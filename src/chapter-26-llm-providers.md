# Chapter 26: LLM Provider Architecture

---

This chapter explores Pierre's LLM (Large Language Model) provider abstraction layer, which enables pluggable AI model integration for chat functionality and recipe generation. The architecture mirrors the fitness provider SPI pattern, providing a consistent approach to external service integration.

## Architecture Overview

The LLM module uses a **runtime provider selector** pattern. The `ChatProvider` enum wraps the underlying providers and selects based on the `PIERRE_LLM_PROVIDER` environment variable.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              Chat System                                              │
│   ┌──────────────────────────────────────────────────────────────────────────────┐   │
│   │                            ChatProvider                                       │   │
│   │      Runtime selector: PIERRE_LLM_PROVIDER=groq|gemini|local|ollama|vllm     │   │
│   └───────────────────────────────┬──────────────────────────────────────────────┘   │
│                                   │                                                   │
│          ┌────────────────────────┼────────────────────────┐                         │
│          │                        │                        │                          │
│          ▼                        ▼                        ▼                          │
│   ┌─────────────┐          ┌─────────────┐          ┌─────────────┐                  │
│   │   Gemini    │          │    Groq     │          │   Local     │                  │
│   │  Provider   │          │  Provider   │          │  Provider   │                  │
│   │  (vision,   │          │  (fast LPU  │          │  (Ollama,   │                  │
│   │   tools)    │          │  inference) │          │  vLLM, etc) │                  │
│   └──────┬──────┘          └──────┬──────┘          └──────┬──────┘                  │
│          │                        │                        │                          │
│          └────────────────────────┼────────────────────────┘                          │
│                                   │                                                   │
│                                   ▼                                                   │
│                  ┌───────────────────────────────┐                                   │
│                  │      LlmProvider Trait        │                                   │
│                  │  ┌─────────────────────────┐  │                                   │
│                  │  │ + name()                │  │                                   │
│                  │  │ + capabilities()        │  │                                   │
│                  │  │ + complete()            │  │                                   │
│                  │  │ + complete_stream()     │  │                                   │
│                  │  │ + health_check()        │  │                                   │
│                  │  └─────────────────────────┘  │                                   │
│                  └───────────────────────────────┘                                   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Module Structure

```
src/llm/
├── mod.rs              # Trait definitions, types, registry, exports
├── provider.rs         # ChatProvider enum (runtime selector)
├── gemini.rs           # Google Gemini implementation
├── groq.rs             # Groq LPU implementation
├── openai_compatible.rs # OpenAI-compatible API (Ollama, vLLM, LocalAI)
└── prompts/
    └── mod.rs          # System prompts (pierre_system.md)
```

**Source**: `src/lib.rs`
```rust
/// LLM provider abstraction for AI chat integration
pub mod llm;
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PIERRE_LLM_PROVIDER` | Provider selector: `groq`, `gemini`, `local`, `ollama`, `vllm`, `localai` | `groq` |
| `GROQ_API_KEY` | Groq API key | Required for Groq |
| `GEMINI_API_KEY` | Google Gemini API key | Required for Gemini |
| `LOCAL_LLM_BASE_URL` | Base URL for OpenAI-compatible API | `http://localhost:11434/v1` (Ollama) |
| `LOCAL_LLM_MODEL` | Model name for local provider | `qwen2.5:14b-instruct` |
| `LOCAL_LLM_API_KEY` | API key (optional for local servers) | None |

### Provider Comparison

| Feature | Groq | Gemini | Local (OpenAI-compatible) |
|---------|------|--------|---------------------------|
| Default | ✓ | | |
| Streaming | ✓ | ✓ | ✓ |
| Function Calling | ✓ | ✓ | ✓ (model dependent) |
| Vision | ✗ | ✓ | Model dependent |
| JSON Mode | ✓ | ✓ | ✓ |
| System Messages | ✓ | ✓ | ✓ |
| Rate Limits | 12K TPM (free) | More generous | None (local) |
| Speed | Very fast (LPU) | Fast | Hardware dependent |
| Privacy | Cloud | Cloud | **Local/Private** |
| Cost | Free tier | Paid | Free (local hardware) |

### Local Provider Backends

The Local provider supports any OpenAI-compatible API:

| Backend | Default URL | Notes |
|---------|-------------|-------|
| **Ollama** | `http://localhost:11434/v1` | Default, easy setup |
| **vLLM** | `http://localhost:8000/v1` | High-throughput serving |
| **LocalAI** | `http://localhost:8080/v1` | Lightweight alternative |
| **Text Generation Inference** | `http://localhost:8080/v1` | Hugging Face optimized |

## Capability Detection with Bitflags

LLM providers have varying capabilities. We use bitflags for efficient storage and querying:

**Source**: `src/llm/mod.rs`
```rust
bitflags::bitflags! {
    /// LLM provider capability flags using bitflags for efficient storage
    #[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
    pub struct LlmCapabilities: u8 {
        /// Provider supports streaming responses
        const STREAMING = 0b0000_0001;
        /// Provider supports function/tool calling
        const FUNCTION_CALLING = 0b0000_0010;
        /// Provider supports vision/image input
        const VISION = 0b0000_0100;
        /// Provider supports JSON mode output
        const JSON_MODE = 0b0000_1000;
        /// Provider supports system messages
        const SYSTEM_MESSAGES = 0b0001_0000;
    }
}
```

**Helper methods**:
```rust
impl LlmCapabilities {
    /// Create capabilities for a basic text-only provider
    pub const fn text_only() -> Self {
        Self::STREAMING.union(Self::SYSTEM_MESSAGES)
    }

    /// Create capabilities for a full-featured provider
    pub const fn full_featured() -> Self {
        Self::STREAMING
            .union(Self::FUNCTION_CALLING)
            .union(Self::VISION)
            .union(Self::JSON_MODE)
            .union(Self::SYSTEM_MESSAGES)
    }

    /// Check if streaming is supported
    pub const fn supports_streaming(&self) -> bool {
        self.contains(Self::STREAMING)
    }
}
```

**Usage**:
```rust
let caps = provider.capabilities();

if caps.supports_streaming() && caps.supports_function_calling() {
    // Use advanced features
} else if caps.supports_streaming() {
    // Use basic streaming
}
```

## The LlmProvider Trait

The core abstraction that all providers implement:

**Source**: `src/llm/mod.rs`
```rust
/// Type alias for boxed stream of chat chunks
pub type ChatStream = Pin<Box<dyn Stream<Item = Result<StreamChunk, AppError>> + Send>>;

#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// Unique provider identifier (e.g., "gemini", "groq")
    fn name(&self) -> &'static str;

    /// Human-readable display name for the provider
    fn display_name(&self) -> &'static str;

    /// Provider capabilities (streaming, function calling, etc.)
    fn capabilities(&self) -> LlmCapabilities;

    /// Default model to use if not specified in request
    fn default_model(&self) -> &'static str;

    /// Available models for this provider
    fn available_models(&self) -> &'static [&'static str];

    /// Perform a chat completion (non-streaming)
    async fn complete(&self, request: &ChatRequest) -> Result<ChatResponse, AppError>;

    /// Perform a streaming chat completion
    async fn complete_stream(&self, request: &ChatRequest) -> Result<ChatStream, AppError>;

    /// Check if the provider is healthy and API key is valid
    async fn health_check(&self) -> Result<bool, AppError>;
}
```

## ChatProvider: Runtime Selection

The `ChatProvider` enum provides runtime provider selection based on environment configuration:

**Source**: `src/llm/provider.rs`
```rust
/// Unified chat provider that wraps Gemini, Groq, or Local providers
pub enum ChatProvider {
    /// Google Gemini provider with full tool calling support
    Gemini(GeminiProvider),
    /// Groq provider for fast, cost-effective inference
    Groq(GroqProvider),
    /// Local LLM provider via OpenAI-compatible API (Ollama, vLLM, LocalAI)
    Local(OpenAiCompatibleProvider),
}

impl ChatProvider {
    /// Create a provider from environment configuration
    ///
    /// Reads `PIERRE_LLM_PROVIDER` to determine which provider to use:
    /// - `groq` (default): Creates `GroqProvider` (requires `GROQ_API_KEY`)
    /// - `gemini`: Creates `GeminiProvider` (requires `GEMINI_API_KEY`)
    /// - `local`/`ollama`/`vllm`/`localai`: Creates `OpenAiCompatibleProvider`
    pub fn from_env() -> Result<Self, AppError> {
        let provider_type = LlmProviderType::from_env();

        info!(
            "Initializing LLM provider: {} (set {} to change)",
            provider_type,
            LlmProviderType::ENV_VAR
        );

        match provider_type {
            LlmProviderType::Groq => Self::groq(),
            LlmProviderType::Gemini => Self::gemini(),
            LlmProviderType::Local => Self::local(),
        }
    }

    /// Create a local LLM provider (Ollama, vLLM, LocalAI)
    pub fn local() -> Result<Self, AppError> {
        Ok(Self::Local(OpenAiCompatibleProvider::from_env()?))
    }

    /// Create a Gemini provider explicitly
    pub fn gemini() -> Result<Self, AppError> {
        Ok(Self::Gemini(GeminiProvider::from_env()?))
    }

    /// Create a Groq provider explicitly
    pub fn groq() -> Result<Self, AppError> {
        Ok(Self::Groq(GroqProvider::from_env()?))
    }
}
```

## Message Types

### MessageRole

Enum representing conversation roles:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MessageRole {
    System,
    User,
    Assistant,
}

impl MessageRole {
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::System => "system",
            Self::User => "user",
            Self::Assistant => "assistant",
        }
    }
}
```

### ChatMessage

Individual message in a conversation:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: MessageRole,
    pub content: String,
}

impl ChatMessage {
    /// Create a system message
    pub fn system(content: impl Into<String>) -> Self {
        Self::new(MessageRole::System, content)
    }

    /// Create a user message
    pub fn user(content: impl Into<String>) -> Self {
        Self::new(MessageRole::User, content)
    }

    /// Create an assistant message
    pub fn assistant(content: impl Into<String>) -> Self {
        Self::new(MessageRole::Assistant, content)
    }
}
```

### ChatRequest (Builder Pattern)

Request configuration using the builder pattern:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stream: bool,
}

impl ChatRequest {
    /// Create a new chat request with messages
    pub const fn new(messages: Vec<ChatMessage>) -> Self {
        Self {
            messages,
            model: None,
            temperature: None,
            max_tokens: None,
            stream: false,
        }
    }

    /// Set the model to use
    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    /// Set the temperature (const fn - no allocation)
    pub const fn with_temperature(mut self, temperature: f32) -> Self {
        self.temperature = Some(temperature);
        self
    }

    /// Set the maximum tokens (const fn)
    pub const fn with_max_tokens(mut self, max_tokens: u32) -> Self {
        self.max_tokens = Some(max_tokens);
        self
    }

    /// Enable streaming (const fn)
    pub const fn with_streaming(mut self) -> Self {
        self.stream = true;
        self
    }
}
```

## Groq Provider Implementation

The Groq provider uses an OpenAI-compatible API for fast inference:

**Source**: `src/llm/groq.rs`

### Configuration

```rust
/// Environment variable for Groq API key
const GROQ_API_KEY_ENV: &str = "GROQ_API_KEY";

/// Default model to use
const DEFAULT_MODEL: &str = "llama-3.3-70b-versatile";

/// Available Groq models
const AVAILABLE_MODELS: &[&str] = &[
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama-3.1-70b-versatile",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
];

/// Base URL for the Groq API (OpenAI-compatible)
const API_BASE_URL: &str = "https://api.groq.com/openai/v1";
```

### Capabilities

```rust
#[async_trait]
impl LlmProvider for GroqProvider {
    fn name(&self) -> &'static str {
        "groq"
    }

    fn display_name(&self) -> &'static str {
        "Groq (Llama/Mixtral)"
    }

    fn capabilities(&self) -> LlmCapabilities {
        // Groq supports streaming, function calling, and system messages
        // but does not support vision (yet)
        LlmCapabilities::STREAMING
            | LlmCapabilities::FUNCTION_CALLING
            | LlmCapabilities::SYSTEM_MESSAGES
            | LlmCapabilities::JSON_MODE
    }

    fn default_model(&self) -> &'static str {
        DEFAULT_MODEL
    }

    fn available_models(&self) -> &'static [&'static str] {
        AVAILABLE_MODELS
    }
}
```

## Gemini Provider Implementation

The Gemini provider supports full-featured capabilities including vision:

**Source**: `src/llm/gemini.rs`

### Configuration

```rust
/// Environment variable for Gemini API key
const GEMINI_API_KEY_ENV: &str = "GEMINI_API_KEY";

/// Default model to use
const DEFAULT_MODEL: &str = "gemini-2.5-flash";

/// Available Gemini models
const AVAILABLE_MODELS: &[&str] = &[
    "gemini-2.5-flash",
    "gemini-2.0-flash-exp",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-1.0-pro",
];

/// Base URL for the Gemini API
const API_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta";
```

### System Message Handling

Gemini handles system messages differently - via a separate `system_instruction` field:

```rust
impl GeminiProvider {
    /// Convert chat messages to Gemini format
    fn convert_messages(messages: &[ChatMessage]) -> (Vec<GeminiContent>, Option<GeminiContent>) {
        let mut contents = Vec::new();
        let mut system_instruction = None;

        for message in messages {
            if message.role == MessageRole::System {
                // Gemini uses separate system_instruction field
                system_instruction = Some(GeminiContent {
                    role: None,
                    parts: vec![ContentPart::Text {
                        text: message.content.clone(),
                    }],
                });
            } else {
                contents.push(GeminiContent {
                    role: Some(Self::convert_role(message.role).to_owned()),
                    parts: vec![ContentPart::Text {
                        text: message.content.clone(),
                    }],
                });
            }
        }

        (contents, system_instruction)
    }

    /// Convert our message role to Gemini's role format
    const fn convert_role(role: MessageRole) -> &'static str {
        match role {
            MessageRole::System | MessageRole::User => "user",
            MessageRole::Assistant => "model",
        }
    }
}
```

### Debug Implementation (API Key Redaction)

Never expose API keys in logs:

```rust
impl std::fmt::Debug for GeminiProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GeminiProvider")
            .field("default_model", &self.default_model)
            .field("api_key", &"[REDACTED]")
            // Omit `client` field as HTTP clients are not useful to debug
            .finish_non_exhaustive()
    }
}
```

## OpenAI-Compatible Provider (Local LLM)

The `OpenAiCompatibleProvider` enables integration with any OpenAI-compatible API, including local LLM servers.

**Source**: `src/llm/openai_compatible.rs`

### Use Cases

- **Privacy-first deployments**: Run LLMs locally without sending data to cloud
- **Cost optimization**: Use local hardware instead of API credits
- **Air-gapped environments**: Deploy in networks without internet access
- **Custom models**: Use fine-tuned or specialized models

### Configuration

```rust
/// Default base URL (Ollama)
const DEFAULT_BASE_URL: &str = "http://localhost:11434/v1";

/// Default model for local inference
const DEFAULT_MODEL: &str = "qwen2.5:14b-instruct";

/// Connection timeout for local servers (more lenient than cloud)
const CONNECT_TIMEOUT_SECS: u64 = 30;

/// Request timeout (local inference can be slower)
const REQUEST_TIMEOUT_SECS: u64 = 300;
```

### Setup Examples

**Ollama (default)**:
```bash
# Start Ollama server
ollama serve

# Pull a model
ollama pull qwen2.5:14b-instruct

# Configure Pierre
export PIERRE_LLM_PROVIDER=local
# Uses defaults: http://localhost:11434/v1 and qwen2.5:14b-instruct
```

**vLLM**:
```bash
# Start vLLM server
vllm serve meta-llama/Llama-3.1-8B-Instruct --api-key token-abc123

# Configure Pierre
export PIERRE_LLM_PROVIDER=local
export LOCAL_LLM_BASE_URL=http://localhost:8000/v1
export LOCAL_LLM_MODEL=meta-llama/Llama-3.1-8B-Instruct
export LOCAL_LLM_API_KEY=token-abc123
```

**LocalAI**:
```bash
# Start LocalAI with a model
docker run -p 8080:8080 localai/localai:latest

# Configure Pierre
export PIERRE_LLM_PROVIDER=local
export LOCAL_LLM_BASE_URL=http://localhost:8080/v1
export LOCAL_LLM_MODEL=gpt-3.5-turbo  # LocalAI model name
```

### Implementation

```rust
pub struct OpenAiCompatibleProvider {
    client: Client,
    base_url: String,
    model: String,
    api_key: Option<String>,
}

impl OpenAiCompatibleProvider {
    /// Create provider from environment variables
    pub fn from_env() -> Result<Self, AppError> {
        let base_url = env::var(LOCAL_LLM_BASE_URL_ENV)
            .unwrap_or_else(|_| DEFAULT_BASE_URL.to_owned());

        let model = env::var(LOCAL_LLM_MODEL_ENV)
            .unwrap_or_else(|_| DEFAULT_MODEL.to_owned());

        let api_key = env::var(LOCAL_LLM_API_KEY_ENV).ok();

        info!(
            "Initializing OpenAI-compatible provider: base_url={}, model={}",
            base_url, model
        );

        let client = Client::builder()
            .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .map_err(|e| AppError::internal(format!("HTTP client error: {e}")))?;

        Ok(Self {
            client,
            base_url,
            model,
            api_key,
        })
    }
}

#[async_trait]
impl LlmProvider for OpenAiCompatibleProvider {
    fn name(&self) -> &'static str {
        "local"
    }

    fn display_name(&self) -> &'static str {
        "Local LLM (OpenAI-compatible)"
    }

    fn capabilities(&self) -> LlmCapabilities {
        // Local providers typically support all features (model-dependent)
        LlmCapabilities::STREAMING
            | LlmCapabilities::FUNCTION_CALLING
            | LlmCapabilities::SYSTEM_MESSAGES
            | LlmCapabilities::JSON_MODE
    }
}
```

### Streaming Support

The provider supports SSE streaming for real-time responses:

```rust
async fn complete_stream(&self, request: &ChatRequest) -> Result<ChatStream, AppError> {
    let url = format!("{}/chat/completions", self.base_url);
    let openai_request = self.build_request(request, true);

    let response = self.client
        .post(&url)
        .json(&openai_request)
        .send()
        .await?;

    // Parse SSE stream
    let stream = response
        .bytes_stream()
        .map(|result| {
            // Parse "data: {json}" SSE format
            // Handle [DONE] marker
        });

    Ok(Box::pin(stream))
}
```

## Tool/Function Calling

All three providers support tool calling for structured interactions:

```rust
/// Complete a chat request with function calling support
pub async fn complete_with_tools(
    &self,
    request: &ChatRequest,
    tools: Option<Vec<Tool>>,
) -> Result<ChatResponseWithTools, AppError> {
    match self {
        Self::Gemini(provider) => provider.complete_with_tools(request, tools).await,
        Self::Groq(provider) => provider.complete_with_tools(request, tools).await,
        Self::Local(provider) => provider.complete_with_tools(request, tools).await,
    }
}
```

### Tool Definition

```rust
/// Tool definition for function calling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    pub function_declarations: Vec<FunctionDeclaration>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDeclaration {
    pub name: String,
    pub description: String,
    pub parameters: Option<serde_json::Value>,
}
```

## Recipe Generation Integration

Pierre uses LLM providers for the "Combat des Chefs" recipe architecture:

### LLM Clients (Claude, ChatGPT)

External LLM clients generate recipes themselves:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  LLM Client  │────▶│ Pierre MCP   │────▶│    USDA      │
│  (Claude)    │     │   Server     │     │  Database    │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │  1. get_recipe_    │                    │
       │     constraints    │                    │
       │───────────────────▶│                    │
       │                    │                    │
       │  2. Returns macro  │                    │
       │     targets, hints │                    │
       │◀───────────────────│                    │
       │                    │                    │
       │  [LLM generates    │                    │
       │   recipe locally]  │                    │
       │                    │                    │
       │  3. validate_      │                    │
       │     recipe         │                    │
       │───────────────────▶│                    │
       │                    │  Lookup nutrition  │
       │                    │───────────────────▶│
       │                    │◀───────────────────│
       │  4. Validation     │                    │
       │     result + macros│                    │
       │◀───────────────────│                    │
```

### Non-LLM Clients

For clients without LLM capabilities, Pierre uses its internal LLM:

```rust
// The suggest_recipe tool uses Pierre's configured LLM
let provider = ChatProvider::from_env()?;
let recipe = generate_recipe_with_llm(&provider, constraints).await?;
```

## Error Handling

All LLM operations use structured error types:

```rust
// Good: Structured errors
return Err(AppError::config(format!(
    "{GROQ_API_KEY_ENV} environment variable not set"
)));

return Err(AppError::external_service(
    "Groq",
    format!("API error ({status}): {error_text}"),
));

return Err(AppError::internal("No content in response"));

// Bad: Never use anyhow! in production code
// return Err(anyhow!("API failed")); // FORBIDDEN
```

## Testing LLM Providers

Tests are in `tests/llm_test.rs` (not in src/ per project conventions):

```rust
#[test]
fn test_capabilities_full_featured() {
    let caps = LlmCapabilities::full_featured();
    assert!(caps.supports_streaming());
    assert!(caps.supports_function_calling());
    assert!(caps.supports_vision());
    assert!(caps.supports_json_mode());
    assert!(caps.supports_system_messages());
}

#[test]
fn test_gemini_debug_redacts_api_key() {
    let provider = GeminiProvider::new("super-secret-key");
    let debug_output = format!("{provider:?}");
    assert!(!debug_output.contains("super-secret-key"));
    assert!(debug_output.contains("[REDACTED]"));
}

#[test]
fn test_chat_request_builder() {
    let request = ChatRequest::new(vec![ChatMessage::user("Hello")])
        .with_model("llama-3.3-70b-versatile")
        .with_temperature(0.7)
        .with_max_tokens(1000)
        .with_streaming();

    assert_eq!(request.model, Some("llama-3.3-70b-versatile".to_string()));
    assert!(request.stream);
}
```

Run tests:
```bash
cargo test --test llm_test -- --nocapture
```

## Adding a New Provider

To add a new LLM provider:

1. **Create the provider file** (`src/llm/my_provider.rs`):

```rust
pub struct MyProvider {
    api_key: String,
    client: Client,
}

#[async_trait]
impl LlmProvider for MyProvider {
    fn name(&self) -> &'static str { "myprovider" }
    fn display_name(&self) -> &'static str { "My Provider" }
    fn capabilities(&self) -> LlmCapabilities {
        LlmCapabilities::STREAMING | LlmCapabilities::SYSTEM_MESSAGES
    }
    // ... implement all trait methods
}
```

2. **Export from mod.rs**:

```rust
mod my_provider;
pub use my_provider::MyProvider;
```

3. **Add to ChatProvider enum** in `src/llm/provider.rs`:

```rust
pub enum ChatProvider {
    Gemini(GeminiProvider),
    Groq(GroqProvider),
    MyProvider(MyProvider),  // Add variant
}
```

4. **Update environment config** in `src/config/environment.rs`:

```rust
pub enum LlmProviderType {
    Groq,
    Gemini,
    MyProvider,  // Add variant
}
```

5. **Add tests** in `tests/llm_test.rs`

## Best Practices

1. **API Key Security**: Always redact in Debug impls, never log
2. **Capability Checks**: Query capabilities before using features
3. **Timeout Handling**: Configure appropriate timeouts for HTTP clients
4. **Rate Limiting**: Respect provider rate limits (Groq: 12K TPM on free tier)
5. **Error Context**: Provide meaningful error messages
6. **Streaming**: Prefer streaming for long responses
7. **Model Selection**: Allow users to override default models
8. **Provider Selection**: Use Groq for cost-effective inference, Gemini for vision

## Summary

The LLM provider architecture provides:

- **Runtime Selection**: `ChatProvider` selects provider from environment
- **Pluggable Design**: Add providers without changing consumer code
- **Capability Detection**: Query features at runtime
- **Type Safety**: Structured messages and responses
- **Streaming Support**: SSE-based streaming responses
- **Tool Calling**: Both providers support function calling
- **Recipe Integration**: Powers the "Combat des Chefs" architecture
- **Security**: API key redaction built-in

## See Also

- [LLM Providers Reference](../llm-providers.md)
- [Tools Reference - Recipe Management](../tools-reference.md#recipe-management)
- [Chapter 17.5: Pluggable Provider Architecture](chapter-17.5-pluggable-providers.md)
- [Chapter 2: Error Handling](chapter-02-error-handling.md)
- [Appendix H: Error Reference](appendix-h-error-reference.md)
