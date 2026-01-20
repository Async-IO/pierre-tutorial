<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->
<!-- Copyright (c) 2025 Pierre Fitness Intelligence -->

# Chapter 12: Pluggable MCP Tool Architecture

---

Pierre implements a pluggable tool architecture that enables type-safe tool registration, capability-based access control, and conditional compilation via feature flags.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Tool Architecture                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐     ┌──────────────────┐                  │
│  │   McpTool Trait  │     │ ToolCapabilities │                  │
│  │   (traits.rs)    │     │   (bitflags)     │                  │
│  └────────┬─────────┘     └────────┬─────────┘                  │
│           │                        │                             │
│           └──────────┬─────────────┘                             │
│                      │                                           │
│              ┌───────▼───────┐                                   │
│              │ ToolRegistry  │                                   │
│              │ (registry.rs) │                                   │
│              └───────┬───────┘                                   │
│                      │                                           │
│    ┌─────────────────┼─────────────────┐                        │
│    │                 │                 │                        │
│    ▼                 ▼                 ▼                        │
│ ┌──────┐        ┌──────┐        ┌──────┐                       │
│ │ conn │        │ data │        │coach │  ... 11 categories    │
│ └──────┘        └──────┘        └──────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## The McpTool Trait

**Source**: `src/tools/traits.rs`

The `McpTool` trait defines the core abstraction for all MCP tools:

```rust
/// Core trait for MCP tool implementations
pub trait McpTool: Send + Sync {
    /// Tool name identifier (static for zero-allocation lookup)
    fn name(&self) -> &'static str;

    /// Human-readable description for AI assistants
    fn description(&self) -> &'static str;

    /// JSON Schema for parameter validation
    fn input_schema(&self) -> JsonSchema;

    /// Capability flags for access control
    fn capabilities(&self) -> ToolCapabilities;

    /// Execute the tool with provided arguments
    async fn execute(
        &self,
        args: Value,
        context: &ToolExecutionContext,
    ) -> AppResult<ToolResult>;
}
```

**Design characteristics**:
- **Send + Sync**: Safe for async sharing across threads
- **Static strings**: Zero-allocation tool name lookup
- **Capability flags**: Efficient bitflag-based filtering
- **Async execution**: Non-blocking I/O operations

## ToolCapabilities Bitflags

**Source**: `src/tools/traits.rs`

Capabilities are defined using Rust's `bitflags!` macro for efficient access control:

```rust
bitflags! {
    pub struct ToolCapabilities: u32 {
        /// Tool requires an authenticated user
        const REQUIRES_AUTH    = 0b0000_0000_0001;
        /// Tool requires tenant context
        const REQUIRES_TENANT  = 0b0000_0000_0010;
        /// Tool requires a connected fitness provider
        const REQUIRES_PROVIDER = 0b0000_0000_0100;
        /// Tool reads data (activities, stats, etc.)
        const READS_DATA       = 0b0000_0000_1000;
        /// Tool writes/modifies data
        const WRITES_DATA      = 0b0000_0001_0000;
        /// Tool performs analytics/calculations
        const ANALYTICS        = 0b0000_0010_0000;
        /// Tool manages goals
        const GOALS            = 0b0000_0100_0000;
        /// Tool manages configuration
        const CONFIGURATION    = 0b0000_1000_0000;
        /// Tool manages recipes
        const RECIPES          = 0b0001_0000_0000;
        /// Tool manages coaches
        const COACHES          = 0b0010_0000_0000;
        /// Tool requires admin privileges
        const ADMIN_ONLY       = 0b0100_0000_0000;
        /// Tool handles sleep/recovery data
        const SLEEP_RECOVERY   = 0b1000_0000_0000;
    }
}
```

**Capability helper methods**:

```rust
impl ToolCapabilities {
    /// Check if tool requires authentication
    pub fn requires_auth(&self) -> bool {
        self.contains(Self::REQUIRES_AUTH)
    }

    /// Check if tool requires tenant context
    pub fn requires_tenant(&self) -> bool {
        self.contains(Self::REQUIRES_TENANT)
    }

    /// Check if tool is admin-only
    pub fn is_admin_only(&self) -> bool {
        self.contains(Self::ADMIN_ONLY)
    }

    /// Check if tool reads data (useful for caching)
    pub fn reads_data(&self) -> bool {
        self.contains(Self::READS_DATA)
    }

    /// Check if tool writes data (useful for cache invalidation)
    pub fn writes_data(&self) -> bool {
        self.contains(Self::WRITES_DATA)
    }

    /// Get description of enabled capabilities for logging
    pub fn describe(&self) -> String {
        let mut caps = Vec::new();
        if self.requires_auth() { caps.push("auth"); }
        if self.is_admin_only() { caps.push("admin"); }
        if self.reads_data() { caps.push("read"); }
        if self.writes_data() { caps.push("write"); }
        caps.join(", ")
    }
}
```

## ToolExecutionContext

**Source**: `src/tools/traits.rs`

The execution context provides tools access to shared resources:

```rust
/// Context provided to tools during execution
pub struct ToolExecutionContext {
    /// Database connection pool
    pub db_pool: SqlitePool,
    /// Authenticated user ID (if any)
    pub user_id: Option<String>,
    /// Tenant ID for multi-tenant isolation
    pub tenant_id: Option<String>,
    /// User's admin status
    pub is_admin: bool,
    /// Connected providers map
    pub providers: Arc<RwLock<HashMap<String, ProviderConnection>>>,
}

impl ToolExecutionContext {
    /// Require admin privileges, returning error if not admin
    pub fn require_admin(&self) -> AppResult<()> {
        if !self.is_admin {
            return Err(AppError::new(
                ErrorCode::PermissionDenied,
                "Admin privileges required",
            ));
        }
        Ok(())
    }

    /// Get user ID or return authentication error
    pub fn require_user(&self) -> AppResult<&str> {
        self.user_id.as_deref().ok_or_else(|| {
            AppError::new(ErrorCode::Unauthorized, "Authentication required")
        })
    }
}
```

## ToolRegistry

**Source**: `src/tools/registry.rs`

The `ToolRegistry` manages tool registration, discovery, and execution:

```rust
pub struct ToolRegistry {
    /// Tools indexed by name for O(1) lookup
    tools: HashMap<String, Arc<dyn McpTool>>,
    /// Tools grouped by category for discovery
    categories: HashMap<String, Vec<String>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        let mut registry = Self {
            tools: HashMap::new(),
            categories: HashMap::new(),
        };
        registry.register_builtin_tools();
        registry
    }

    /// Register a tool, returns false if name conflicts
    pub fn register(&mut self, tool: Arc<dyn McpTool>) -> bool {
        let name = tool.name().to_string();
        if self.tools.contains_key(&name) {
            return false;
        }
        self.tools.insert(name, tool);
        true
    }

    /// Register tool with category for organized discovery
    pub fn register_with_category(
        &mut self,
        tool: Arc<dyn McpTool>,
        category: &str,
    ) -> bool {
        let name = tool.name().to_string();
        if !self.register(tool) {
            return false;
        }
        self.categories
            .entry(category.to_string())
            .or_default()
            .push(name);
        true
    }

    /// Get tool by name
    pub fn get(&self, name: &str) -> Option<Arc<dyn McpTool>> {
        self.tools.get(name).cloned()
    }

    /// Execute a tool with context and access control
    pub async fn execute(
        &self,
        name: &str,
        args: Value,
        context: &ToolExecutionContext,
    ) -> AppResult<ToolResult> {
        let tool = self.get(name).ok_or_else(|| {
            AppError::new(ErrorCode::ToolNotFound, format!("Unknown tool: {}", name))
        })?;

        // Enforce admin-only access
        if tool.capabilities().is_admin_only() {
            context.require_admin()?;
        }

        tool.execute(args, context).await
    }
}
```

## Feature Flags for Conditional Compilation

**Source**: `Cargo.toml`

Tools are conditionally compiled using feature flags:

```toml
[features]
# Individual tool categories
tools-connection = []  # connect_provider, get_connection_status, disconnect
tools-data = []        # get_activities, get_athlete, get_stats
tools-analytics = []   # analyze_activity, calculate_metrics, trends
tools-goals = []       # set_goal, track_progress, suggest_goals
tools-config = []      # fitness config tools, user configuration
tools-nutrition = []   # daily_nutrition, nutrient_timing, food search
tools-sleep = []       # sleep_quality, recovery_score, rest_day
tools-recipes = []     # validate_recipe, save_recipe, list_recipes
tools-coaches = []     # coach CRUD, activate, favorites
tools-admin = ["tools-coaches"]  # admin coach management

# Convenience bundles
tools-all = [
    "tools-connection", "tools-data", "tools-analytics",
    "tools-goals", "tools-config", "tools-nutrition",
    "tools-sleep", "tools-recipes", "tools-coaches", "tools-admin"
]
tools-fitness-core = ["tools-connection", "tools-data", "tools-analytics"]
tools-wellness = ["tools-sleep", "tools-nutrition", "tools-recipes"]

# Default includes all tools
default = ["tools-all"]
```

**Registry registration with feature flags**:

```rust
impl ToolRegistry {
    fn register_builtin_tools(&mut self) {
        #[cfg(feature = "tools-connection")]
        self.register_connection_tools();

        #[cfg(feature = "tools-data")]
        self.register_data_tools();

        #[cfg(feature = "tools-analytics")]
        self.register_analytics_tools();

        #[cfg(feature = "tools-goals")]
        self.register_goals_tools();

        #[cfg(feature = "tools-config")]
        self.register_config_tools();

        #[cfg(feature = "tools-nutrition")]
        self.register_nutrition_tools();

        #[cfg(feature = "tools-sleep")]
        self.register_sleep_tools();

        #[cfg(feature = "tools-recipes")]
        self.register_recipes_tools();

        #[cfg(feature = "tools-coaches")]
        self.register_coaches_tools();

        #[cfg(feature = "tools-admin")]
        self.register_admin_tools();
    }

    #[cfg(feature = "tools-coaches")]
    fn register_coaches_tools(&mut self) {
        use crate::tools::implementations::coaches::create_coach_tools;
        for tool in create_coach_tools() {
            self.register_with_category(Arc::from(tool), "coaches");
        }
    }
}
```

## Tool Implementations Directory

**Source**: `src/tools/implementations/`

Tools are organized by category in separate modules:

```
src/tools/implementations/
├── mod.rs            # Module exports with feature flags
├── connection.rs     # Provider connection tools (3)
├── data.rs           # Data access tools (4)
├── analytics.rs      # Analytics tools (14)
├── goals.rs          # Goal management tools (4)
├── configuration.rs  # Configuration tools (6)
├── fitness_config.rs # Fitness config tools (4)
├── nutrition.rs      # Nutrition tools (5)
├── sleep.rs          # Sleep/recovery tools (5)
├── recipes.rs        # Recipe management tools (7)
├── coaches.rs        # Coach management tools (13)
└── admin.rs          # Admin tools (8)
```

**Module exports** (`src/tools/implementations/mod.rs`):

```rust
#[cfg(feature = "tools-connection")]
pub mod connection;

#[cfg(feature = "tools-data")]
pub mod data;

#[cfg(feature = "tools-analytics")]
pub mod analytics;

#[cfg(feature = "tools-goals")]
pub mod goals;

#[cfg(feature = "tools-config")]
pub mod configuration;
pub mod fitness_config;

#[cfg(feature = "tools-nutrition")]
pub mod nutrition;

#[cfg(feature = "tools-sleep")]
pub mod sleep;

#[cfg(feature = "tools-recipes")]
pub mod recipes;

#[cfg(feature = "tools-coaches")]
pub mod coaches;

#[cfg(feature = "tools-admin")]
pub mod admin;
```

## Role-Based Schema Filtering

The registry supports visibility control based on user roles:

```rust
impl ToolRegistry {
    /// List schemas filtered by admin status
    pub fn list_schemas_for_role(&self, is_admin: bool) -> Vec<ToolSchema> {
        self.tools
            .values()
            .filter(|tool| {
                !tool.capabilities().is_admin_only() || is_admin
            })
            .map(|tool| ToolSchema {
                name: tool.name().to_string(),
                description: tool.description().to_string(),
                input_schema: tool.input_schema(),
            })
            .collect()
    }

    /// List only non-admin tools
    pub fn user_visible_schemas(&self) -> Vec<ToolSchema> {
        self.list_schemas_for_role(false)
    }

    /// List only admin-restricted tools
    pub fn admin_tool_schemas(&self) -> Vec<ToolSchema> {
        self.tools
            .values()
            .filter(|tool| tool.capabilities().is_admin_only())
            .map(|tool| ToolSchema {
                name: tool.name().to_string(),
                description: tool.description().to_string(),
                input_schema: tool.input_schema(),
            })
            .collect()
    }
}
```

## Example Tool Implementation

Here's how a coach tool implements the `McpTool` trait:

```rust
/// Tool to list available AI coaches
pub struct ListCoachesTool;

impl McpTool for ListCoachesTool {
    fn name(&self) -> &'static str {
        "list_coaches"
    }

    fn description(&self) -> &'static str {
        "List available AI coaches with optional filtering by category or favorites"
    }

    fn input_schema(&self) -> JsonSchema {
        JsonSchema {
            schema_type: "object".into(),
            properties: Some(hashmap! {
                "category".into() => PropertySchema {
                    property_type: "string".into(),
                    description: Some("Filter by category".into()),
                },
                "favorites_only".into() => PropertySchema {
                    property_type: "boolean".into(),
                    description: Some("Only show favorites".into()),
                },
            }),
            required: None,
        }
    }

    fn capabilities(&self) -> ToolCapabilities {
        ToolCapabilities::REQUIRES_AUTH
            | ToolCapabilities::COACHES
            | ToolCapabilities::READS_DATA
    }

    async fn execute(
        &self,
        args: Value,
        context: &ToolExecutionContext,
    ) -> AppResult<ToolResult> {
        let user_id = context.require_user()?;

        let category = args.get("category")
            .and_then(|v| v.as_str())
            .map(CoachCategory::from_str)
            .transpose()?;

        let favorites_only = args.get("favorites_only")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let manager = CoachesManager::new(context.db_pool.clone());
        let coaches = manager.list(user_id, category, favorites_only).await?;

        Ok(ToolResult::success(serde_json::to_value(coaches)?))
    }
}
```

## Key Takeaways

1. **McpTool trait**: Core abstraction with name, description, schema, capabilities, and async execute.

2. **ToolCapabilities bitflags**: Efficient access control with 12 distinct capability flags.

3. **ToolExecutionContext**: Provides database, user, tenant, and provider access to tools.

4. **ToolRegistry**: Central registry with O(1) lookup, category grouping, and role-based filtering.

5. **Feature flags**: Conditional compilation reduces binary size for specialized deployments.

6. **Category organization**: 11 tool categories in `src/tools/implementations/`.

7. **Role-based visibility**: Admin tools hidden from regular users in tool discovery.

8. **Zero-allocation names**: Static strings for efficient tool lookup.

9. **Arc-wrapped tools**: Safe sharing across async tasks.

10. **Factory pattern**: Each category exports a `create_<category>_tools()` function.

---

**End of Part III: MCP Protocol**

You've completed the MCP protocol implementation section. You now understand:
- JSON-RPC 2.0 foundation (Chapter 9)
- MCP request flow and processing (Chapter 10)
- Transport layers (stdio, HTTP, SSE) (Chapter 11)
- Pluggable tool architecture and registry (Chapter 12)

**Next Chapter**: [Chapter 13: SDK Bridge Architecture](./chapter-13-sdk-bridge-architecture.md) - Begin Part IV by learning how the TypeScript SDK communicates with the Rust MCP server via stdio transport.
