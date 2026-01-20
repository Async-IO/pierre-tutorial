<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->
<!-- Copyright (c) 2025 Pierre Fitness Intelligence -->

# Chapter 34: AI Coaches System

---

This chapter covers Pierre's AI Coaches system, which enables users to create, manage, and interact with personalized AI coaching personas. The system supports both user-created coaches and tenant-wide system coaches managed by administrators.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Coaches System                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │    User      │    │   System     │    │    Admin     │      │
│  │   Coaches    │    │   Coaches    │    │ Assignments  │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                    │               │
│         └───────────────────┼────────────────────┘               │
│                             │                                    │
│                     ┌───────▼───────┐                           │
│                     │CoachesManager │                           │
│                     │   (SQLite)    │                           │
│                     └───────┬───────┘                           │
│                             │                                    │
│              ┌──────────────┼──────────────┐                    │
│              │              │              │                    │
│        ┌─────▼─────┐  ┌─────▼─────┐  ┌────▼─────┐             │
│        │ Tenant A  │  │ Tenant B  │  │ Tenant C │             │
│        │  Coaches  │  │  Coaches  │  │  Coaches │             │
│        └───────────┘  └───────────┘  └──────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Core Data Models

### Coach Model

**Source**: `src/database/coaches.rs`

```rust
/// Represents a custom AI coaching persona
pub struct Coach {
    /// Unique identifier
    pub id: Uuid,
    /// Owner user ID (null for system coaches)
    pub user_id: Option<String>,
    /// Tenant for multi-tenant isolation
    pub tenant_id: String,
    /// Display title
    pub title: String,
    /// Brief description of the coach's specialty
    pub description: String,
    /// System prompt that shapes AI responses
    pub system_prompt: String,
    /// Category classification
    pub category: CoachCategory,
    /// Searchable tags
    pub tags: Vec<String>,
    /// Example prompts to show users
    pub sample_prompts: Vec<String>,
    /// Estimated token count (~4 chars per token)
    pub token_count: i32,
    /// Times this coach has been used
    pub usage_count: i64,
    /// Last time this coach was used
    pub last_used_at: Option<DateTime<Utc>>,
    /// User's favorite status
    pub is_favorite: bool,
    /// Currently active for the user
    pub is_active: bool,
    /// System coach (created by admin)
    pub is_system: bool,
    /// Visibility level
    pub visibility: CoachVisibility,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Last update timestamp
    pub updated_at: DateTime<Utc>,
}
```

### CoachCategory Enum

**Source**: `src/database/coaches.rs`

```rust
/// Categories for organizing coaches by domain
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CoachCategory {
    /// Workout and training-focused coaching
    Training,
    /// Diet and nutrition guidance
    Nutrition,
    /// Rest, sleep, and recovery advice
    Recovery,
    /// Meal planning and recipe suggestions
    Recipes,
    /// Performance analysis and insights
    Analysis,
    /// User-defined category
    Custom,
}

impl CoachCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Training => "training",
            Self::Nutrition => "nutrition",
            Self::Recovery => "recovery",
            Self::Recipes => "recipes",
            Self::Analysis => "analysis",
            Self::Custom => "custom",
        }
    }

    pub fn from_str(s: &str) -> AppResult<Self> {
        match s.to_lowercase().as_str() {
            "training" => Ok(Self::Training),
            "nutrition" => Ok(Self::Nutrition),
            "recovery" => Ok(Self::Recovery),
            "recipes" => Ok(Self::Recipes),
            "analysis" => Ok(Self::Analysis),
            "custom" => Ok(Self::Custom),
            _ => Err(AppError::new(
                ErrorCode::InvalidParams,
                format!("Invalid coach category: {}", s),
            )),
        }
    }
}
```

### CoachVisibility Enum

**Source**: `src/database/coaches.rs`

```rust
/// Visibility levels for coaches
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CoachVisibility {
    /// Only visible to the owner
    Private,
    /// Visible to all users in the tenant
    Tenant,
    /// Visible across all tenants (super-admin only)
    Global,
}
```

| Visibility | Use Case |
|------------|----------|
| Private | User-created personal coaches |
| Tenant | Company-wide coaching standards |
| Global | Platform-wide default coaches |

## Database Schema

**Source**: `migrations/20250120000025_coaches_schema.sql`

```sql
CREATE TABLE IF NOT EXISTS coaches (
    id TEXT PRIMARY KEY,
    user_id TEXT,                    -- NULL for system coaches
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'training', 'nutrition', 'recovery', 'recipes', 'analysis', 'custom'
    )),
    tags TEXT NOT NULL DEFAULT '[]', -- JSON array
    sample_prompts TEXT NOT NULL DEFAULT '[]', -- JSON array
    token_count INTEGER NOT NULL DEFAULT 0,
    usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    is_system INTEGER NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN (
        'private', 'tenant', 'global'
    )),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_coaches_user ON coaches(user_id);
CREATE INDEX IF NOT EXISTS idx_coaches_tenant ON coaches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_coaches_category ON coaches(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_coaches_active ON coaches(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_coaches_system ON coaches(tenant_id, is_system);

-- Coach assignments table (for system coaches assigned to users)
CREATE TABLE IF NOT EXISTS coach_assignments (
    id TEXT PRIMARY KEY,
    coach_id TEXT NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by TEXT NOT NULL,       -- Admin who made assignment
    assigned_at TEXT NOT NULL,
    UNIQUE(coach_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_assignments_user ON coach_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_coach_assignments_coach ON coach_assignments(coach_id);

-- Hidden coaches table (coaches user has hidden from view)
CREATE TABLE IF NOT EXISTS hidden_coaches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coach_id TEXT NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    hidden_at TEXT NOT NULL,
    UNIQUE(user_id, coach_id)
);
```

## CoachesManager Implementation

**Source**: `src/database/coaches.rs`

The `CoachesManager` handles all coach database operations with user and tenant isolation.

```rust
pub struct CoachesManager {
    pool: SqlitePool,
}

impl CoachesManager {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}
```

### User Coach Operations

```rust
impl CoachesManager {
    /// Create a new personal coach
    pub async fn create(
        &self,
        user_id: &str,
        tenant_id: &str,
        request: &CreateCoachRequest,
    ) -> AppResult<Coach> {
        let id = Uuid::new_v4();
        let now = Utc::now();
        let token_count = estimate_tokens(&request.system_prompt);

        sqlx::query(
            r#"
            INSERT INTO coaches
            (id, user_id, tenant_id, title, description, system_prompt,
             category, tags, sample_prompts, token_count, visibility,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'private', ?, ?)
            "#,
        )
        .bind(id.to_string())
        .bind(user_id)
        .bind(tenant_id)
        .bind(&request.title)
        .bind(&request.description)
        .bind(&request.system_prompt)
        .bind(request.category.as_str())
        .bind(serde_json::to_string(&request.tags)?)
        .bind(serde_json::to_string(&request.sample_prompts)?)
        .bind(token_count)
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .execute(&self.pool)
        .await?;

        self.get(user_id, &id.to_string()).await
    }

    /// List coaches visible to user (personal + system + assigned)
    pub async fn list(
        &self,
        user_id: &str,
        category: Option<CoachCategory>,
        favorites_only: bool,
    ) -> AppResult<Vec<Coach>> {
        let mut query = String::from(
            r#"
            SELECT c.* FROM coaches c
            WHERE (
                (c.user_id = ? AND c.visibility = 'private')
                OR (c.is_system = 1 AND c.visibility IN ('tenant', 'global'))
                OR EXISTS (
                    SELECT 1 FROM coach_assignments ca
                    WHERE ca.coach_id = c.id AND ca.user_id = ?
                )
            )
            AND c.id NOT IN (
                SELECT coach_id FROM hidden_coaches WHERE user_id = ?
            )
            "#,
        );

        if let Some(cat) = category {
            query.push_str(&format!(" AND c.category = '{}'", cat.as_str()));
        }

        if favorites_only {
            query.push_str(" AND c.is_favorite = 1");
        }

        query.push_str(" ORDER BY c.is_favorite DESC, c.usage_count DESC");

        let rows = sqlx::query(&query)
            .bind(user_id)
            .bind(user_id)
            .bind(user_id)
            .fetch_all(&self.pool)
            .await?;

        rows.into_iter().map(Self::row_to_coach).collect()
    }

    /// Get a specific coach by ID
    pub async fn get(&self, user_id: &str, coach_id: &str) -> AppResult<Coach> {
        let row = sqlx::query(
            r#"
            SELECT * FROM coaches
            WHERE id = ? AND (
                user_id = ?
                OR is_system = 1
                OR EXISTS (
                    SELECT 1 FROM coach_assignments
                    WHERE coach_id = ? AND user_id = ?
                )
            )
            "#,
        )
        .bind(coach_id)
        .bind(user_id)
        .bind(coach_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::new(ErrorCode::NotFound, "Coach not found"))?;

        Self::row_to_coach(row)
    }

    /// Search coaches by query
    pub async fn search(&self, user_id: &str, query: &str) -> AppResult<Vec<Coach>> {
        let search_pattern = format!("%{}%", query.to_lowercase());

        let rows = sqlx::query(
            r#"
            SELECT c.* FROM coaches c
            WHERE (
                (c.user_id = ?)
                OR (c.is_system = 1)
                OR EXISTS (SELECT 1 FROM coach_assignments ca WHERE ca.coach_id = c.id AND ca.user_id = ?)
            )
            AND (
                LOWER(c.title) LIKE ?
                OR LOWER(c.description) LIKE ?
                OR c.tags LIKE ?
            )
            ORDER BY c.usage_count DESC
            LIMIT 20
            "#,
        )
        .bind(user_id)
        .bind(user_id)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(Self::row_to_coach).collect()
    }
}
```

### Coach Activation

```rust
impl CoachesManager {
    /// Activate a coach (only one active at a time per user)
    pub async fn activate_coach(&self, user_id: &str, coach_id: &str) -> AppResult<()> {
        // Deactivate all current coaches for user
        sqlx::query("UPDATE coaches SET is_active = 0 WHERE user_id = ?")
            .bind(user_id)
            .execute(&self.pool)
            .await?;

        // Activate the selected coach
        sqlx::query(
            r#"
            UPDATE coaches SET is_active = 1, updated_at = ?
            WHERE id = ? AND (user_id = ? OR is_system = 1)
            "#,
        )
        .bind(Utc::now().to_rfc3339())
        .bind(coach_id)
        .bind(user_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Deactivate the current active coach
    pub async fn deactivate_coach(&self, user_id: &str) -> AppResult<()> {
        sqlx::query("UPDATE coaches SET is_active = 0 WHERE user_id = ? AND is_active = 1")
            .bind(user_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    /// Get the currently active coach for a user
    pub async fn get_active_coach(&self, user_id: &str) -> AppResult<Option<Coach>> {
        let row = sqlx::query(
            "SELECT * FROM coaches WHERE user_id = ? AND is_active = 1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(r) => Ok(Some(Self::row_to_coach(r)?)),
            None => Ok(None),
        }
    }

    /// Record coach usage for analytics
    pub async fn record_usage(&self, coach_id: &str) -> AppResult<()> {
        sqlx::query(
            r#"
            UPDATE coaches
            SET usage_count = usage_count + 1,
                last_used_at = ?,
                updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .bind(coach_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
```

### Admin Operations

```rust
impl CoachesManager {
    /// Create a system coach (admin only)
    pub async fn create_system_coach(
        &self,
        tenant_id: &str,
        request: &CreateSystemCoachRequest,
    ) -> AppResult<Coach> {
        let id = Uuid::new_v4();
        let now = Utc::now();
        let token_count = estimate_tokens(&request.system_prompt);

        sqlx::query(
            r#"
            INSERT INTO coaches
            (id, user_id, tenant_id, title, description, system_prompt,
             category, tags, sample_prompts, token_count, is_system,
             visibility, created_at, updated_at)
            VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            "#,
        )
        .bind(id.to_string())
        .bind(tenant_id)
        .bind(&request.title)
        .bind(&request.description)
        .bind(&request.system_prompt)
        .bind(request.category.as_str())
        .bind(serde_json::to_string(&request.tags)?)
        .bind(serde_json::to_string(&request.sample_prompts)?)
        .bind(token_count)
        .bind(request.visibility.as_str())
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .execute(&self.pool)
        .await?;

        self.get_system_coach(tenant_id, &id.to_string()).await
    }

    /// List all system coaches in tenant
    pub async fn list_system_coaches(&self, tenant_id: &str) -> AppResult<Vec<Coach>> {
        let rows = sqlx::query(
            "SELECT * FROM coaches WHERE tenant_id = ? AND is_system = 1 ORDER BY title",
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(Self::row_to_coach).collect()
    }

    /// Assign a system coach to a user
    pub async fn assign_coach(
        &self,
        coach_id: &str,
        user_id: &str,
        assigned_by: &str,
    ) -> AppResult<()> {
        let id = Uuid::new_v4();
        let now = Utc::now();

        sqlx::query(
            r#"
            INSERT INTO coach_assignments (id, coach_id, user_id, assigned_by, assigned_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (coach_id, user_id) DO NOTHING
            "#,
        )
        .bind(id.to_string())
        .bind(coach_id)
        .bind(user_id)
        .bind(assigned_by)
        .bind(now.to_rfc3339())
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Remove a coach assignment
    pub async fn unassign_coach(&self, coach_id: &str, user_id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM coach_assignments WHERE coach_id = ? AND user_id = ?")
            .bind(coach_id)
            .bind(user_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    /// List all assignments for a coach
    pub async fn list_assignments(&self, coach_id: &str) -> AppResult<Vec<CoachAssignment>> {
        let rows = sqlx::query(
            r#"
            SELECT ca.*, u.email, u.name
            FROM coach_assignments ca
            JOIN users u ON ca.user_id = u.id
            WHERE ca.coach_id = ?
            ORDER BY ca.assigned_at DESC
            "#,
        )
        .bind(coach_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(Self::row_to_assignment).collect()
    }
}
```

## MCP Tools

The coaches system exposes 21 MCP tools: 13 for regular users and 8 for administrators.

### User Tools (13 tools)

| Tool | Description |
|------|-------------|
| `list_coaches` | List available coaches with filtering |
| `create_coach` | Create a custom personal coach |
| `get_coach` | Get detailed coach information |
| `update_coach` | Modify coach configuration |
| `delete_coach` | Remove a personal coach |
| `toggle_favorite_coach` | Mark/unmark as favorite |
| `search_coaches` | Search by title/description/tags |
| `activate_coach` | Set as currently active coach |
| `deactivate_coach` | Disable active coach |
| `get_active_coach` | Get currently active coach |
| `hide_coach` | Hide coach from listings |
| `show_coach` | Restore hidden coach |
| `list_hidden_coaches` | View hidden coaches |

**Implementation**: `src/tools/implementations/coaches.rs`

### Admin Tools (8 tools)

| Tool | Description |
|------|-------------|
| `admin_list_system_coaches` | List all system coaches |
| `admin_create_system_coach` | Create tenant-wide coach |
| `admin_get_system_coach` | Get system coach details |
| `admin_update_system_coach` | Modify system coach |
| `admin_delete_system_coach` | Delete system coach |
| `admin_assign_coach` | Assign coach to user |
| `admin_unassign_coach` | Remove assignment |
| `admin_list_coach_assignments` | View all assignments |

**Implementation**: `src/tools/implementations/admin.rs`

## Integration with LLM

When a coach is active, its system prompt is prepended to conversations:

```rust
/// Build the full system prompt with active coach
pub fn build_system_prompt(
    base_prompt: &str,
    active_coach: Option<&Coach>,
) -> String {
    match active_coach {
        Some(coach) => format!(
            "{}\n\n---\n\n## Active Coach: {}\n\n{}\n\n---\n\n{}",
            base_prompt,
            coach.title,
            coach.system_prompt,
            COACH_FOOTER
        ),
        None => base_prompt.to_string(),
    }
}

const COACH_FOOTER: &str = r#"
Remember to embody the coaching persona above while still having access
to all fitness tools and data. Maintain the coach's tone and focus areas
throughout the conversation.
"#;
```

## Frontend Integration

**Source**: `frontend/src/components/CoachSelector.tsx`

```typescript
const { data: coaches } = useQuery({
  queryKey: ['coaches', { category, favoritesOnly }],
  queryFn: () => mcpClient.callTool('list_coaches', { category, favorites_only: favoritesOnly }),
});

const { data: activeCoach } = useQuery({
  queryKey: ['active-coach'],
  queryFn: () => mcpClient.callTool('get_active_coach', {}),
});

const activateMutation = useMutation({
  mutationFn: (coachId: string) => mcpClient.callTool('activate_coach', { coach_id: coachId }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['active-coach'] });
  },
});
```

## Best Practices

### 1. System Prompt Design

Write effective coach system prompts:

```
You are a marathon training coach with expertise in long-distance running.

Your approach:
- Focus on gradual mileage increases (10% rule)
- Emphasize recovery between hard sessions
- Tailor advice to the athlete's current fitness level

Communication style:
- Encouraging but realistic
- Data-driven recommendations
- Always reference the athlete's actual training data

Key areas of focus:
- Weekly mileage progression
- Long run development
- Race-specific workouts
- Injury prevention
```

### 2. Category Selection

Match categories to coach specialties:

| Category | Best For |
|----------|----------|
| Training | Workout plans, performance coaching |
| Nutrition | Diet advice, meal timing, macros |
| Recovery | Sleep, rest days, injury prevention |
| Recipes | Meal planning, cooking guidance |
| Analysis | Data interpretation, insights |
| Custom | Specialized or hybrid coaching |

### 3. Token Management

Monitor token counts to manage costs:

```rust
/// Estimate tokens in text (~4 characters per token)
fn estimate_tokens(text: &str) -> i32 {
    (text.len() as f64 / 4.0).ceil() as i32
}
```

Recommended limits:
- User coaches: < 2,000 tokens
- System coaches: < 4,000 tokens

## Key Takeaways

1. **Two coach types**: Personal coaches (user-created) and system coaches (admin-created)

2. **CoachCategory**: Six categories for organizing coaches by domain

3. **CoachVisibility**: Private, tenant, or global visibility levels

4. **One active coach**: Users can have only one active coach at a time

5. **Usage tracking**: Track usage_count and last_used_at for analytics

6. **Favorites system**: Users can mark coaches as favorites for quick access

7. **Hidden coaches**: Users can hide system/assigned coaches they don't want

8. **Admin assignments**: Administrators can assign system coaches to users

9. **21 MCP tools**: 13 user tools + 8 admin tools for complete management

10. **LLM integration**: Active coach's system prompt shapes AI responses

---

**Related Chapters**:
- Chapter 7: Multi-Tenant Isolation (tenant security)
- Chapter 12: Pluggable MCP Tool Architecture (tool implementation)
- Chapter 19: Comprehensive Tools Guide (all 61 tools)
- Chapter 26: LLM Providers (system prompt usage)
