<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->
<!-- Copyright (c) 2025 Pierre Fitness Intelligence -->

# Chapter 11: MCP Transport Layers

---

## Transport Abstraction Overview

MCP is transport-agnostic - the same JSON-RPC messages work over any transport:

```
┌──────────────────────────────────────────────────────────┐
│                   MCP Protocol Layer                     │
│         (JSON-RPC requests/responses)                    │
└─────────────────┬────────────────────────────────────────┘
                  │
      ┌───────────┼───────────┬────────────┬────────────┐
      │           │           │            │            │
      ▼           ▼           ▼            ▼            ▼
┌──────────┐ ┌────────┐ ┌────────┐   ┌────────┐   ┌────────┐
│  stdio   │ │  HTTP  │ │  SSE   │   │  WS    │   │Sampling│
│ (Direct) │ │ (API)  │ │(Notify)│   │(Bidir) │   │ (LLM)  │
└──────────┘ └────────┘ └────────┘   └────────┘   └────────┘
```

**Source**: src/mcp/transport_manager.rs:24-39
```rust
/// Manages multiple transport methods for MCP communication
pub struct TransportManager {
    resources: Arc<ServerResources>,
    notification_sender: broadcast::Sender<OAuthCompletedNotification>,
}

impl TransportManager {
    /// Create a new transport manager with shared resources
    #[must_use]
    pub fn new(resources: Arc<ServerResources>) -> Self {
        let (notification_sender, _) = broadcast::channel(100);
        Self {
            resources,
            notification_sender,
        }
    }
```

**Design**: Single `TransportManager` coordinates all transports using `broadcast::channel` for notifications.

## HTTP Transport

HTTP transport serves MCP over REST endpoints:

**Source**: src/mcp/transport_manager.rs:103-128
```rust
/// Run HTTP server with restart on failure
async fn run_http_server_loop(shared_resources: Arc<ServerResources>, port: u16) -> ! {
    loop {
        info!("Starting unified Axum HTTP server on port {}", port);

        let server = super::multitenant::MultiTenantMcpServer::new(shared_resources.clone());
        let result = server
            .run_http_server_with_resources_axum(port, shared_resources.clone())
            .await;

        Self::handle_server_restart(result).await;
    }
}

async fn handle_server_restart(result: AppResult<()>) {
    match result {
        Ok(()) => {
            error!("HTTP server unexpectedly completed - restarting in 5 seconds...");
            sleep(Duration::from_secs(5)).await;
        }
        Err(e) => {
            error!("HTTP server failed: {} - restarting in 10 seconds...", e);
            sleep(Duration::from_secs(10)).await;
        }
    }
}
```

**Features**:
- Axum web framework for routing
- REST endpoints for MCP methods
- CORS support for web clients
- TLS/HTTPS support (production)
- Rate limiting per endpoint

**Typical endpoints**:
```
POST /mcp/initialize    - Initialize MCP session
POST /mcp/tools/list    - List available tools
POST /mcp/tools/call    - Execute tool
GET  /mcp/ping          - Health check
GET  /oauth/authorize   - OAuth flow start
POST /oauth/callback    - OAuth callback
```

## Stdio Transport (Direct MCP)

Pierre includes a native Rust stdio transport for direct MCP communication without HTTP overhead:

**Source**: src/mcp/transport_manager.rs:155-165
```rust
/// Handles stdio transport for MCP communication
pub struct StdioTransport {
    resources: Arc<ServerResources>,
}

impl StdioTransport {
    /// Creates a new stdio transport instance
    #[must_use]
    pub const fn new(resources: Arc<ServerResources>) -> Self {
        Self { resources }
    }
```

**Message processing loop**:

**Source**: src/mcp/transport_manager.rs:245-291
```rust
/// Run stdio transport for MCP communication
pub async fn run(
    &self,
    notification_receiver: broadcast::Receiver<OAuthCompletedNotification>,
) -> AppResult<()> {
    info!("MCP stdio transport ready - listening on stdin/stdout with sampling support");

    let stdin_handle = stdin();
    let mut lines = BufReader::new(stdin_handle).lines();
    let sampling_peer = self.resources.sampling_peer.clone();

    // Spawn notification handler
    let notification_handle = tokio::spawn(async move {
        Self::handle_stdio_notifications(notification_receiver, resources_for_notifications).await
    });

    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }

        match serde_json::from_str::<serde_json::Value>(&line) {
            Ok(message) => {
                Self::process_stdio_message(
                    message,
                    self.resources.clone(),
                    sampling_peer.as_ref(),
                ).await;
            }
            Err(e) => {
                warn!("Invalid JSON-RPC message: {}", e);
                println!("{}", Self::parse_error_response());
            }
        }
    }

    // Cleanup on exit
    if let Some(peer) = &sampling_peer {
        peer.cancel_all_pending().await;
    }
    notification_handle.abort();
    Ok(())
}
```

**Stdio characteristics**:
- **Bidirectional**: Full JSON-RPC over stdin/stdout
- **Line-based**: One JSON message per line
- **BufReader**: Efficient buffered reading
- **MCP Sampling**: Supports server-initiated LLM requests
- **Concurrent startup**: Runs alongside HTTP/SSE transports

**MCP Sampling support**:

The stdio transport includes special handling for MCP Sampling - a protocol feature allowing servers to request LLM completions from clients:

**Source**: src/mcp/transport_manager.rs:167-200
```rust
/// Check if a JSON message is a sampling response
fn is_sampling_response(message: &serde_json::Value) -> bool {
    message.get("id").is_some()
        && message.get("method").is_none()
        && (message.get("result").is_some() || message.get("error").is_some())
}

/// Route a sampling response to the sampling peer
async fn route_sampling_response(
    message: &serde_json::Value,
    sampling_peer: Option<&Arc<super::sampling_peer::SamplingPeer>>,
) {
    let Some(peer) = sampling_peer else {
        warn!("Received sampling response but no sampling peer available");
        return;
    };

    let id = message.get("id").cloned().unwrap_or(serde_json::Value::Null);
    let result = message.get("result").cloned();
    let error = message.get("error").cloned();

    match peer.handle_response(id, result, error).await {
        Ok(handled) if !handled => {
            warn!("Received response for unknown sampling request");
        }
        Ok(_) => {}
        Err(e) => warn!("Failed to handle sampling response: {}", e),
    }
}
```

**Transport startup**:

**Source**: src/mcp/transport_manager.rs:70-85, 148
```rust
fn spawn_stdio_transport(
    resources: Arc<ServerResources>,
    notification_receiver: broadcast::Receiver<OAuthCompletedNotification>,
) {
    let stdio_handle = tokio::spawn(async move {
        let stdio_transport = StdioTransport::new(resources);
        match stdio_transport.run(notification_receiver).await {
            Ok(()) => info!("stdio transport completed successfully"),
            Err(e) => warn!("stdio transport failed: {}", e),
        }
    });
    // Monitor task completion
    tokio::spawn(async move {
        match stdio_handle.await {
            Ok(()) => info!("stdio transport task completed"),
            Err(e) => warn!("stdio transport task failed: {}", e),
        }
    });
}

// Called from start_legacy_unified_server()
Self::spawn_stdio_transport(shared_resources.clone(), notification_receiver);
```

**Use cases**:
- Claude Desktop integration via MCP stdio protocol
- Direct MCP client connections
- Server-initiated LLM requests (MCP Sampling)
- OAuth notifications to stdio clients

## Sse Transport (Notifications)

Server-Sent Events provide server-to-client notifications:

**Source**: src/mcp/transport_manager.rs:90-101
```rust
/// Spawn SSE notification forwarder task
fn spawn_sse_forwarder(
    resources: Arc<ServerResources>,
    notification_receiver: broadcast::Receiver<OAuthCompletedNotification>,
) {
    tokio::spawn(async move {
        let sse_forwarder = SseNotificationForwarder::new(resources);
        if let Err(e) = sse_forwarder.run(notification_receiver).await {
            error!("SSE notification forwarder failed: {}", e);
        }
    });
}
```

**SSE characteristics**:
- **Unidirectional**: Server → Client only
- **Long-lived**: Connection stays open
- **Text-based**: Sends `data:` prefixed messages
- **Auto-reconnect**: Browsers reconnect on disconnect

**MCP notifications over SSE**:
- OAuth flow completion
- Tool execution progress
- Resource updates
- Prompt changes

**Example SSE event**:
```
data: {"jsonrpc":"2.0","method":"notifications/oauth_completed","params":{"provider":"strava","status":"success"}}

```

## Websocket Transport (Bidirectional)

WebSocket provides full-duplex bidirectional communication for real-time updates:

**Source**: src/websocket.rs:88-127
```rust
/// Manages WebSocket connections and message broadcasting
#[derive(Clone)]
pub struct WebSocketManager {
    database: Arc<Database>,
    auth_middleware: McpAuthMiddleware,
    clients: Arc<RwLock<HashMap<Uuid, ClientConnection>>>,
    broadcast_tx: broadcast::Sender<WebSocketMessage>,
}

impl WebSocketManager {
    /// Creates a new WebSocket manager instance
    #[must_use]
    pub fn new(
        database: Arc<Database>,
        auth_manager: &Arc<AuthManager>,
        jwks_manager: &Arc<JwksManager>,
        rate_limit_config: RateLimitConfig,
    ) -> Self {
        let (broadcast_tx, _) = broadcast::channel(WEBSOCKET_CHANNEL_CAPACITY);
        let auth_middleware = McpAuthMiddleware::new(
            (**auth_manager).clone(),
            database.clone(),
            jwks_manager.clone(),
            rate_limit_config,
        );

        Self {
            database,
            auth_middleware,
            clients: Arc::new(RwLock::new(HashMap::new())),
            broadcast_tx,
        }
    }
```

**WebSocket message types**:

**Source**: src/websocket.rs:35-86
```rust
/// WebSocket message types for real-time communication
#[non_exhaustive]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WebSocketMessage {
    /// Client authentication message
    #[serde(rename = "auth")]
    Authentication {
        token: String,
    },
    /// Subscribe to specific topics
    #[serde(rename = "subscribe")]
    Subscribe {
        topics: Vec<String>,
    },
    /// API key usage update notification
    #[serde(rename = "usage_update")]
    UsageUpdate {
        api_key_id: String,
        requests_today: u64,
        requests_this_month: u64,
        rate_limit_status: Value,
    },
    /// System-wide statistics update
    #[serde(rename = "system_stats")]
    SystemStats {
        total_requests_today: u64,
        total_requests_this_month: u64,
        active_connections: usize,
    },
    /// Error message to client
    #[serde(rename = "error")]
    Error {
        message: String,
    },
    /// Success confirmation message
    #[serde(rename = "success")]
    Success {
        message: String,
    },
}
```

**Connection handling**:

**Source**: src/websocket.rs:206-269
```rust
/// Handle incoming WebSocket connection
pub async fn handle_connection(&self, ws: WebSocket) {
    let (mut ws_tx, mut ws_rx) = ws.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();

    let connection_id = Uuid::new_v4();
    let mut authenticated_user: Option<Uuid> = None;
    let mut subscriptions: Vec<String> = Vec::new();

    // Spawn task to forward messages to WebSocket
    let ws_send_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if ws_tx.send(message).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages
    while let Some(msg) = ws_rx.next().await {
        match msg {
            Ok(Message::Text(text)) => match serde_json::from_str::<WebSocketMessage>(&text) {
                Ok(WebSocketMessage::Authentication { token }) => {
                    authenticated_user = self.handle_auth_message(&token, &tx).await;
                }
                Ok(WebSocketMessage::Subscribe { topics }) => {
                    subscriptions = Self::handle_subscribe_message(topics, authenticated_user, &tx);
                }
                // ... error handling
                _ => {}
            },
            Ok(Message::Close(_)) | Err(_) => break,
            _ => {}
        }
    }

    // Store authenticated connection
    if let Some(user_id) = authenticated_user {
        let client = ClientConnection {
            user_id,
            subscriptions,
            tx: tx.clone(),
        };
        self.clients.write().await.insert(connection_id, client);
    }

    // Clean up on disconnect
    ws_send_task.abort();
    self.clients.write().await.remove(&connection_id);
}
```

**WebSocket authentication flow**:
1. Client connects to `/ws` endpoint
2. Client sends `{"type":"auth","token":"Bearer ..."}` message
3. Server validates JWT using `McpAuthMiddleware`
4. Server responds with `{"type":"success"}` or `{"type":"error"}`
5. Authenticated client can subscribe to topics

**Topic subscription**:
```json
{
  "type": "subscribe",
  "topics": ["usage", "system"]
}
```

**Broadcasting updates**:

**Source**: src/websocket.rs:285-303
```rust
/// Broadcast usage update to subscribed clients
pub async fn broadcast_usage_update(
    &self,
    api_key_id: &str,
    user_id: &Uuid,
    requests_today: u64,
    requests_this_month: u64,
    rate_limit_status: Value,
) {
    let message = WebSocketMessage::UsageUpdate {
        api_key_id: api_key_id.to_owned(),
        requests_today,
        requests_this_month,
        rate_limit_status,
    };

    self.send_to_user_subscribers(user_id, &message, "usage")
        .await;
}
```

**Periodic system stats**:

**Source**: src/websocket.rs:394-409
```rust
/// Start background task for periodic updates
pub fn start_periodic_updates(&self) {
    let manager = self.clone(); // Safe: Arc clone for background task
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(30)); // Update every 30 seconds

        loop {
            interval.tick().await;

            // Broadcast system stats
            if let Err(e) = manager.broadcast_system_stats().await {
                warn!("Failed to broadcast system stats: {}", e);
            }
        }
    });
}
```

**WebSocket characteristics**:
- **Bidirectional**: Full-duplex client ↔ server communication
- **JWT authentication**: Required before subscribing
- **Topic-based subscriptions**: Clients choose what to receive
- **Broadcast channels**: `tokio::sync::broadcast` for efficient distribution
- **Connection tracking**: `HashMap<Uuid, ClientConnection>` with `RwLock`
- **Automatic cleanup**: Connections removed on disconnect
- **Periodic updates**: System stats every 30 seconds

**Use cases**:
- Real-time API usage monitoring
- Rate limit status updates
- System health dashboards
- Live fitness data streaming
- OAuth flow status updates

**Rust Idiom**: WebSocket connection splitting

The `ws.split()` pattern separates the WebSocket into independent read and write halves. This allows concurrent sending/receiving without conflicts. The `mpsc::unbounded_channel` bridges the write half to the message handler, decoupling message generation from socket I/O.

## Transport Coordination

The `TransportManager` starts all transports concurrently:

**Source**: src/mcp/transport_manager.rs:41-53, 130-152
```rust
/// Start all transport methods (HTTP, SSE, WebSocket) in coordinated fashion
///
/// # Errors
/// Returns an error if transport setup or server startup fails
pub async fn start_all_transports(&self, port: u16) -> AppResult<()> {
    info!(
        "Transport manager coordinating all transports on port {}",
        port
    );

    // Delegate to the unified server implementation
    self.start_legacy_unified_server(port).await
}

/// Unified server startup using existing transport coordination
async fn start_legacy_unified_server(&self, port: u16) -> AppResult<()> {
    info!("Starting MCP server with HTTP transports (Axum framework)");

    let sse_notification_receiver = self.notification_sender.subscribe();

    let mut resources_clone = (*self.resources).clone();
    resources_clone.set_oauth_notification_sender(self.notification_sender.clone());

    Self::spawn_progress_handler(&mut resources_clone);

    let shared_resources = Arc::new(resources_clone);

    Self::spawn_sse_forwarder(shared_resources.clone(), sse_notification_receiver);

    Self::run_http_server_loop(shared_resources, port).await
}
```

**Concurrency**: Transports run in separate `tokio::spawn` tasks, allowing simultaneous HTTP, SSE, and WebSocket clients.

## Notification Broadcasting

The `broadcast::channel` distributes notifications to subscribed transports:

```rust
let (notification_sender, _) = broadcast::channel(100);

// Subscribe for SSE transport
let sse_notification_receiver = self.notification_sender.subscribe();

// Send notification (from OAuth callback)
notification_sender.send(OAuthCompletedNotification {
    provider: "strava",
    status: "success",
    user_id
})?;
```

**Rust Idiom**: `broadcast::channel` for pub-sub

The `broadcast::channel` allows multiple subscribers. When a notification is sent, all active subscribers receive it. This is perfect for distributing OAuth completion events to SSE and WebSocket transports simultaneously.

## Key Takeaways

1. **Transport abstraction**: MCP protocol is transport-agnostic. Same JSON-RPC messages work over stdio, HTTP, SSE, and WebSocket.

2. **Stdio transport**: Native Rust implementation using `BufReader` for stdin, supports MCP Sampling for server-initiated LLM requests, runs concurrently with HTTP/SSE.

3. **HTTP transport**: REST endpoints with Axum framework for web clients, with CORS and rate limiting support.

4. **SSE for notifications**: Server-Sent Events provide unidirectional server→client notifications for OAuth completion and progress updates. SSE routes are implemented in `src/sse/routes.rs`.

5. **WebSocket transport**: Full-duplex bidirectional communication with JWT authentication, topic-based subscriptions, and real-time updates. Supports usage monitoring, system stats broadcasting every 30 seconds, and live data streaming.

6. **WebSocket message types**: Tagged enum with Authentication, Subscribe, UsageUpdate, SystemStats, Error, and Success variants for type-safe messaging.

7. **Connection management**: `WebSocketManager` tracks authenticated clients in `HashMap<Uuid, ClientConnection>` with `RwLock` for concurrent access.

8. **Broadcast notifications**: `tokio::sync::broadcast` distributes notifications to all active transports simultaneously.

9. **Concurrent transports**: All transports run in separate `tokio::spawn` tasks, allowing simultaneous stdio, HTTP, SSE, and WebSocket clients.

10. **Shared resources**: `Arc<ServerResources>` provides thread-safe access to database, auth manager, and other services across transports.

11. **Error isolation**: Each transport handles errors independently. HTTP failure doesn't affect stdio, SSE, or WebSocket transports.

12. **Auto-recovery**: HTTP transport restarts on failure with exponential backoff (5s, 10s).

13. **Transport-agnostic processing**: `McpRequestProcessor` handles requests identically regardless of transport source.

14. **WebSocket splitting**: `ws.split()` pattern separates read/write halves for concurrent bidirectional communication without conflicts.

15. **MCP Sampling**: Stdio transport supports server-initiated LLM requests via `SamplingPeer`, enabling Pierre to request completions from connected MCP clients.

---

**Next Chapter**: [Chapter 12: MCP Tool Registry & Type-Safe Routing](./chapter-12-mcp-tool-registry.md) - Learn how the Pierre platform registers MCP tools, validates parameters with JSON Schema, and routes tool calls to handlers.
