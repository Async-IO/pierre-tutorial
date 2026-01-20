<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->
<!-- Copyright (c) 2025 Pierre Fitness Intelligence -->

# Chapter 31: Adding New MCP Tools - Pluggable Architecture

---

This appendix provides a comprehensive guide for adding new MCP tools to Pierre using the pluggable tool architecture. The new architecture simplifies tool creation to a 4-step process.

## Quick Reference Checklist

```
□ 1. Implement McpTool  - src/tools/implementations/<category>.rs
□ 2. Create factory     - create_<category>_tools() function
□ 3. Register in mod.rs - src/tools/implementations/mod.rs
□ 4. Add feature flag   - Cargo.toml (if new category)
```

## Architecture Overview

Pierre's pluggable tool architecture centers on three core components:

```
┌─────────────────────────────────────────────────────────────┐
│                  Tool Creation Flow                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Implement McpTool trait                                  │
│     └─► src/tools/implementations/<category>.rs              │
│                                                              │
│  2. Create factory function                                  │
│     └─► pub fn create_<category>_tools() -> Vec<Box<...>>   │
│                                                              │
│  3. Export from mod.rs                                       │
│     └─► #[cfg(feature = "tools-<category>")]                │
│         pub mod <category>;                                  │
│                                                              │
│  4. Register in ToolRegistry                                 │
│     └─► Automatic via register_builtin_tools()              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Step 1: Implement the McpTool Trait

Create a new struct implementing the `McpTool` trait in the appropriate category file.

**File**: `src/tools/implementations/<category>.rs`

```rust
use crate::tools::traits::{McpTool, ToolCapabilities, ToolExecutionContext, ToolResult};
use crate::mcp::schema::{JsonSchema, PropertySchema};
use crate::error::AppResult;
use serde_json::Value;
use std::collections::HashMap;

/// Tool to perform your new functionality
pub struct YourNewTool;

impl McpTool for YourNewTool {
    fn name(&self) -> &'static str {
        "your_new_tool"
    }

    fn description(&self) -> &'static str {
        "Clear description of what this tool does for AI assistants"
    }

    fn input_schema(&self) -> JsonSchema {
        let mut properties = HashMap::new();

        // Add required parameter
        properties.insert(
            "required_param".to_string(),
            PropertySchema {
                property_type: "string".to_string(),
                description: Some("Description of required parameter".to_string()),
            },
        );

        // Add optional parameter
        properties.insert(
            "optional_param".to_string(),
            PropertySchema {
                property_type: "number".to_string(),
                description: Some("Optional limit (default: 10)".to_string()),
            },
        );

        JsonSchema {
            schema_type: "object".to_string(),
            properties: Some(properties),
            required: Some(vec!["required_param".to_string()]),
        }
    }

    fn capabilities(&self) -> ToolCapabilities {
        ToolCapabilities::REQUIRES_AUTH
            | ToolCapabilities::READS_DATA
    }

    async fn execute(
        &self,
        args: Value,
        context: &ToolExecutionContext,
    ) -> AppResult<ToolResult> {
        // Get authenticated user
        let user_id = context.require_user()?;

        // Extract parameters
        let required_param = args
            .get("required_param")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                crate::error::AppError::new(
                    crate::error::ErrorCode::InvalidParams,
                    "Missing required_param",
                )
            })?;

        let optional_param = args
            .get("optional_param")
            .and_then(|v| v.as_i64())
            .unwrap_or(10);

        // Execute business logic
        let result = do_something(user_id, required_param, optional_param).await?;

        // Return success response
        Ok(ToolResult::success(serde_json::to_value(result)?))
    }
}
```

### Capability Flags Reference

Choose the appropriate capabilities for your tool:

| Flag | Use When |
|------|----------|
| `REQUIRES_AUTH` | Tool needs authenticated user |
| `REQUIRES_TENANT` | Tool needs tenant context |
| `REQUIRES_PROVIDER` | Tool needs connected fitness provider |
| `READS_DATA` | Tool reads data (enables caching) |
| `WRITES_DATA` | Tool modifies data (invalidates cache) |
| `ANALYTICS` | Tool performs calculations |
| `GOALS` | Tool manages goals |
| `CONFIGURATION` | Tool manages configuration |
| `RECIPES` | Tool manages recipes |
| `COACHES` | Tool manages coaches |
| `ADMIN_ONLY` | Tool requires admin privileges |
| `SLEEP_RECOVERY` | Tool handles sleep/recovery |

**Combine flags with bitwise OR**:
```rust
ToolCapabilities::REQUIRES_AUTH | ToolCapabilities::WRITES_DATA | ToolCapabilities::COACHES
```

## Step 2: Create Factory Function

Add your tool to the category's factory function.

**File**: `src/tools/implementations/<category>.rs`

```rust
/// Create all <category> tools for registration
pub fn create_<category>_tools() -> Vec<Box<dyn McpTool>> {
    vec![
        Box::new(ExistingTool),
        Box::new(YourNewTool),  // Add your new tool here
    ]
}
```

### Creating a New Category

If adding a new tool category, create the full file:

**File**: `src/tools/implementations/my_category.rs`

```rust
//! My Category Tools
//!
//! This module provides tools for my new functionality.

use crate::tools::traits::{McpTool, ToolCapabilities, ToolExecutionContext, ToolResult};
use crate::mcp::schema::{JsonSchema, PropertySchema};
use crate::error::AppResult;
use serde_json::Value;
use std::collections::HashMap;

// Tool implementations...

pub struct FirstTool;
impl McpTool for FirstTool { /* ... */ }

pub struct SecondTool;
impl McpTool for SecondTool { /* ... */ }

/// Create all my_category tools for registration
pub fn create_my_category_tools() -> Vec<Box<dyn McpTool>> {
    vec![
        Box::new(FirstTool),
        Box::new(SecondTool),
    ]
}
```

## Step 3: Register in mod.rs

Export your module with a feature flag.

**File**: `src/tools/implementations/mod.rs`

```rust
// Existing modules...
#[cfg(feature = "tools-connection")]
pub mod connection;

#[cfg(feature = "tools-data")]
pub mod data;

// Add your new category
#[cfg(feature = "tools-my-category")]
pub mod my_category;
```

## Step 4: Add Feature Flag (New Categories Only)

For new categories, add the feature flag to Cargo.toml.

**File**: `Cargo.toml`

```toml
[features]
# Existing features...
tools-connection = []
tools-data = []

# Add your new category
tools-my-category = []

# Update tools-all to include your category
tools-all = [
    "tools-connection",
    "tools-data",
    # ... existing categories ...
    "tools-my-category",
]
```

Then add registration in the registry:

**File**: `src/tools/registry.rs`

```rust
impl ToolRegistry {
    fn register_builtin_tools(&mut self) {
        // Existing registrations...

        #[cfg(feature = "tools-my-category")]
        self.register_my_category_tools();
    }

    #[cfg(feature = "tools-my-category")]
    fn register_my_category_tools(&mut self) {
        use crate::tools::implementations::my_category::create_my_category_tools;
        for tool in create_my_category_tools() {
            self.register_with_category(std::sync::Arc::from(tool), "my-category");
        }
    }
}
```

## Complete Example: Adding a Coach Tool

Here's a complete example of adding a new coach tool:

### Step 1: Implement the Tool

**File**: `src/tools/implementations/coaches.rs`

```rust
/// Tool to get coach recommendations based on user's goals
pub struct RecommendCoachTool;

impl McpTool for RecommendCoachTool {
    fn name(&self) -> &'static str {
        "recommend_coach"
    }

    fn description(&self) -> &'static str {
        "Get AI coach recommendations based on fitness goals and activity history"
    }

    fn input_schema(&self) -> JsonSchema {
        let mut properties = HashMap::new();

        properties.insert(
            "goal_type".to_string(),
            PropertySchema {
                property_type: "string".to_string(),
                description: Some(
                    "Type of goal: marathon, weight_loss, strength, recovery".to_string()
                ),
            },
        );

        properties.insert(
            "experience_level".to_string(),
            PropertySchema {
                property_type: "string".to_string(),
                description: Some("User experience: beginner, intermediate, advanced".to_string()),
            },
        );

        JsonSchema {
            schema_type: "object".to_string(),
            properties: Some(properties),
            required: Some(vec!["goal_type".to_string()]),
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

        let goal_type = args
            .get("goal_type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                AppError::new(ErrorCode::InvalidParams, "Missing goal_type")
            })?;

        let experience = args
            .get("experience_level")
            .and_then(|v| v.as_str())
            .unwrap_or("intermediate");

        let manager = CoachesManager::new(context.db_pool.clone());
        let recommendations = manager
            .recommend_for_goal(user_id, goal_type, experience)
            .await?;

        Ok(ToolResult::success(serde_json::to_value(recommendations)?))
    }
}
```

### Step 2: Add to Factory Function

```rust
pub fn create_coach_tools() -> Vec<Box<dyn McpTool>> {
    vec![
        Box::new(ListCoachesTool),
        Box::new(CreateCoachTool),
        Box::new(GetCoachTool),
        // ... existing tools ...
        Box::new(RecommendCoachTool),  // Add new tool
    ]
}
```

### Step 3: Verify Registration

Since coaches is an existing category, no changes needed to mod.rs or Cargo.toml.

## Testing Your New Tool

### Unit Test

**File**: `tests/tool_tests.rs`

```rust
#[tokio::test]
async fn test_recommend_coach_tool() {
    let tool = RecommendCoachTool;

    // Verify metadata
    assert_eq!(tool.name(), "recommend_coach");
    assert!(tool.description().contains("recommendations"));

    // Verify capabilities
    let caps = tool.capabilities();
    assert!(caps.requires_auth());
    assert!(caps.contains(ToolCapabilities::COACHES));
    assert!(caps.reads_data());
    assert!(!caps.is_admin_only());

    // Verify schema
    let schema = tool.input_schema();
    assert!(schema.required.as_ref().unwrap().contains(&"goal_type".to_string()));
}
```

### Integration Test

```rust
#[tokio::test]
async fn test_recommend_coach_execution() {
    let pool = setup_test_db().await;
    let context = ToolExecutionContext {
        db_pool: pool,
        user_id: Some("test-user".to_string()),
        tenant_id: Some("test-tenant".to_string()),
        is_admin: false,
        providers: Arc::new(RwLock::new(HashMap::new())),
    };

    let tool = RecommendCoachTool;
    let args = serde_json::json!({
        "goal_type": "marathon",
        "experience_level": "intermediate"
    });

    let result = tool.execute(args, &context).await;
    assert!(result.is_ok());
}
```

## Documentation Updates

After adding your tool, update documentation:

1. **tools-reference.md**: Add tool to the reference documentation
2. **chapter-19-tools-guide.md**: Update tool count and add to appropriate category

## Common Mistakes to Avoid

### 1. Forgetting Static Lifetime for name()

```rust
// WRONG - returns String
fn name(&self) -> String {
    "my_tool".to_string()
}

// CORRECT - returns &'static str
fn name(&self) -> &'static str {
    "my_tool"
}
```

### 2. Missing Required Parameter Validation

```rust
// WRONG - panics on missing parameter
let param = args.get("param").unwrap().as_str().unwrap();

// CORRECT - returns proper error
let param = args
    .get("param")
    .and_then(|v| v.as_str())
    .ok_or_else(|| AppError::new(ErrorCode::InvalidParams, "Missing param"))?;
```

### 3. Incorrect Capability Flags

```rust
// WRONG - admin tool without ADMIN_ONLY
fn capabilities(&self) -> ToolCapabilities {
    ToolCapabilities::REQUIRES_AUTH | ToolCapabilities::WRITES_DATA
}

// CORRECT - include ADMIN_ONLY for admin tools
fn capabilities(&self) -> ToolCapabilities {
    ToolCapabilities::REQUIRES_AUTH
        | ToolCapabilities::ADMIN_ONLY
        | ToolCapabilities::WRITES_DATA
}
```

### 4. Forgetting to Add to Factory Function

Your tool won't be registered if you don't add it to `create_<category>_tools()`.

## File Reference Summary

| File | Purpose |
|------|---------|
| `src/tools/traits.rs` | McpTool trait and ToolCapabilities |
| `src/tools/registry.rs` | ToolRegistry registration |
| `src/tools/implementations/<category>.rs` | Tool implementations |
| `src/tools/implementations/mod.rs` | Module exports with feature flags |
| `Cargo.toml` | Feature flag definitions |
| `docs/tools-reference.md` | Tool documentation |
| `docs/tutorial/chapter-19-tools-guide.md` | Tool usage guide |

## Key Takeaways

1. **4-step process**: Implement trait → factory function → mod.rs → feature flag

2. **McpTool trait**: Core abstraction with name, description, schema, capabilities, execute

3. **Static names**: Use `&'static str` for efficient tool lookup

4. **Capability flags**: Combine with bitwise OR for access control

5. **Factory pattern**: Each category exports `create_<category>_tools()`

6. **Feature flags**: Enable conditional compilation for reduced binary size

7. **ToolExecutionContext**: Provides database, user, and tenant access

8. **Proper error handling**: Use `AppResult` and proper validation

9. **Test coverage**: Unit tests for metadata, integration tests for execution

10. **Documentation**: Update tools-reference.md and chapter-19
