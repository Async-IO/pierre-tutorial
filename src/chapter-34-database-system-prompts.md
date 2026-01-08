<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->
<!-- Copyright (c) 2025 Pierre Fitness Intelligence -->

# Chapter 34: Database System Prompts

This chapter covers Pierre's database-backed prompt management system, which enables tenant-specific customization of AI chat suggestions, welcome messages, and system instructions.

## What You'll Learn

- Database schema for prompt storage
- Pillar-based prompt categorization
- Tenant isolation for prompts
- Admin CRUD operations
- Reset to defaults mechanism
- Frontend admin UI integration

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Prompt Management System                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Prompt     │    │   Welcome    │    │   System     │      │
│  │  Categories  │    │   Prompt     │    │   Prompt     │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                    │               │
│         └───────────────────┼────────────────────┘               │
│                             │                                    │
│                     ┌───────▼───────┐                           │
│                     │ PromptManager │                           │
│                     │   (SQLite)    │                           │
│                     └───────┬───────┘                           │
│                             │                                    │
│              ┌──────────────┼──────────────┐                    │
│              │              │              │                    │
│        ┌─────▼─────┐  ┌─────▼─────┐  ┌────▼─────┐             │
│        │ Tenant A  │  │ Tenant B  │  │ Tenant C │             │
│        │  Prompts  │  │  Prompts  │  │  Prompts │             │
│        └───────────┘  └───────────┘  └──────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

### Prompt Categories Table

**Source**: `migrations/20250107000000_prompt_categories.sql`

```sql
CREATE TABLE IF NOT EXISTS prompt_categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_key TEXT NOT NULL,
    category_title TEXT NOT NULL,
    category_icon TEXT NOT NULL,
    pillar TEXT NOT NULL CHECK (pillar IN ('activity', 'nutrition', 'recovery')),
    prompts TEXT NOT NULL,  -- JSON array of prompt strings
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(tenant_id, category_key)
);

CREATE INDEX IF NOT EXISTS idx_prompt_categories_tenant
    ON prompt_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prompt_categories_active
    ON prompt_categories(tenant_id, is_active);
```

### Welcome Prompts Table

**Source**: `migrations/20250107000001_welcome_prompts.sql`

```sql
CREATE TABLE IF NOT EXISTS welcome_prompts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    prompt_text TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_welcome_prompts_tenant
    ON welcome_prompts(tenant_id);
```

### System Prompts Table

**Source**: `migrations/20250120000024_system_prompts_schema.sql`

```sql
CREATE TABLE IF NOT EXISTS system_prompts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    prompt_text TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_prompts_tenant
    ON system_prompts(tenant_id);
```

## Pillar Classification

Pierre organizes prompts into three "pillars" that align with the fitness intelligence domains:

**Source**: `src/database/prompts.rs:14-27`

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Pillar {
    /// Activity pillar (Emerald gradient)
    Activity,
    /// Nutrition pillar (Amber gradient)
    Nutrition,
    /// Recovery pillar (Indigo gradient)
    Recovery,
}
```

Each pillar maps to a distinct visual style in the frontend:

| Pillar | Color Theme | Example Prompts |
|--------|-------------|-----------------|
| Activity | Emerald (`#10B981`) | "Am I ready for a hard workout?", "What's my predicted marathon time?" |
| Nutrition | Amber (`#F59E0B`) | "How many calories should I eat?", "Create a high-protein meal" |
| Recovery | Indigo (`#6366F1`) | "Do I need a rest day?", "Analyze my sleep quality" |

## Data Models

### PromptCategory

**Source**: `src/database/prompts.rs:31-52`

```rust
pub struct PromptCategory {
    pub id: Uuid,
    pub tenant_id: String,
    pub category_key: String,      // Unique within tenant (e.g., "training")
    pub category_title: String,    // Display title (e.g., "Training")
    pub category_icon: String,     // Emoji icon (e.g., "runner")
    pub pillar: Pillar,            // Visual classification
    pub prompts: Vec<String>,      // List of prompt suggestions
    pub display_order: i32,        // Lower numbers shown first
    pub is_active: bool,           // Whether category is visible
}
```

### WelcomePrompt

```rust
pub struct WelcomePrompt {
    pub id: Uuid,
    pub tenant_id: String,
    pub prompt_text: String,       // Shown to first-time users
    pub is_active: bool,
}
```

### SystemPrompt

```rust
pub struct SystemPrompt {
    pub id: Uuid,
    pub tenant_id: String,
    pub prompt_text: String,       // LLM system instructions (markdown)
    pub is_active: bool,
}
```

## Default Prompt Categories

**Source**: `src/llm/prompts/prompt_categories.json`

```json
[
  {
    "key": "training",
    "title": "Training",
    "icon": "runner",
    "pillar": "activity",
    "prompts": [
      "Am I ready for a hard workout today?",
      "What's my predicted marathon time?"
    ]
  },
  {
    "key": "nutrition",
    "title": "Nutrition",
    "icon": "salad",
    "pillar": "nutrition",
    "prompts": [
      "How many calories should I eat today?",
      "What should I eat before my morning run?"
    ]
  },
  {
    "key": "recovery",
    "title": "Recovery",
    "icon": "sleep",
    "pillar": "recovery",
    "prompts": [
      "Do I need a rest day?",
      "Analyze my sleep quality"
    ]
  },
  {
    "key": "recipes",
    "title": "Recipes",
    "icon": "cooking",
    "pillar": "nutrition",
    "prompts": [
      "Create a high-protein post-workout meal",
      "Show my saved recipes"
    ]
  }
]
```

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/prompts/suggestions` | Get active prompt categories and welcome message |

**Response**:
```json
{
  "categories": [
    {
      "category_key": "training",
      "category_title": "Training",
      "category_icon": "runner",
      "pillar": "activity",
      "prompts": ["Am I ready for a hard workout today?"]
    }
  ],
  "welcome_prompt": "Welcome to Pierre! I'm your fitness AI assistant.",
  "metadata": {
    "timestamp": "2025-01-07T12:00:00Z",
    "api_version": "1.0"
  }
}
```

### Admin Endpoints

All admin endpoints require the `admin` or `super_admin` role.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/prompts` | List all categories (including inactive) |
| POST | `/api/admin/prompts` | Create new category |
| GET | `/api/admin/prompts/:id` | Get specific category |
| PUT | `/api/admin/prompts/:id` | Update category |
| DELETE | `/api/admin/prompts/:id` | Delete category |
| GET | `/api/admin/prompts/welcome` | Get welcome prompt |
| PUT | `/api/admin/prompts/welcome` | Update welcome prompt |
| GET | `/api/admin/prompts/system` | Get system prompt |
| PUT | `/api/admin/prompts/system` | Update system prompt |
| POST | `/api/admin/prompts/reset` | Reset to defaults |

### Create Category Request

```json
{
  "category_key": "strength",
  "category_title": "Strength Training",
  "category_icon": "dumbbell",
  "pillar": "activity",
  "prompts": [
    "What's my estimated 1RM for bench press?",
    "Create a strength training plan"
  ],
  "display_order": 5
}
```

### Update Category Request

```json
{
  "category_title": "Strength & Power",
  "prompts": [
    "What's my estimated 1RM?",
    "Create a power building program"
  ],
  "is_active": true
}
```

## PromptManager Implementation

**Source**: `src/database/prompts.rs`

The `PromptManager` handles all database operations with tenant isolation:

```rust
pub struct PromptManager {
    pool: SqlitePool,
}

impl PromptManager {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Get active prompt categories for a tenant
    pub async fn get_prompt_categories(
        &self,
        tenant_id: &str,
    ) -> AppResult<Vec<PromptCategory>> {
        let rows = sqlx::query(
            r#"
            SELECT id, tenant_id, category_key, category_title,
                   category_icon, pillar, prompts, display_order, is_active,
                   created_at, updated_at
            FROM prompt_categories
            WHERE tenant_id = ? AND is_active = 1
            ORDER BY display_order ASC, category_title ASC
            "#,
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(Self::row_to_category).collect()
    }

    /// Create a new prompt category
    pub async fn create_prompt_category(
        &self,
        tenant_id: &str,
        request: &CreatePromptCategoryRequest,
    ) -> AppResult<PromptCategory> {
        let id = Uuid::new_v4();
        let now = Utc::now().to_rfc3339();
        let prompts_json = serde_json::to_string(&request.prompts)?;

        sqlx::query(
            r#"
            INSERT INTO prompt_categories
            (id, tenant_id, category_key, category_title, category_icon,
             pillar, prompts, display_order, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            "#,
        )
        .bind(id.to_string())
        .bind(tenant_id)
        .bind(&request.category_key)
        .bind(&request.category_title)
        .bind(&request.category_icon)
        .bind(request.pillar.as_str())
        .bind(&prompts_json)
        .bind(request.display_order.unwrap_or(0))
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        self.get_prompt_category(tenant_id, &id.to_string()).await
    }

    /// Reset prompts to defaults from JSON file
    pub async fn reset_to_defaults(&self, tenant_id: &str) -> AppResult<()> {
        // Delete existing categories
        sqlx::query("DELETE FROM prompt_categories WHERE tenant_id = ?")
            .bind(tenant_id)
            .execute(&self.pool)
            .await?;

        // Load defaults from embedded JSON
        let defaults: Vec<DefaultCategory> =
            serde_json::from_str(include_str!("../llm/prompts/prompt_categories.json"))?;

        // Insert default categories
        for (order, cat) in defaults.into_iter().enumerate() {
            let request = CreatePromptCategoryRequest {
                category_key: cat.key,
                category_title: cat.title,
                category_icon: cat.icon,
                pillar: Pillar::from_str(&cat.pillar)?,
                prompts: cat.prompts,
                display_order: Some(order as i32),
            };
            self.create_prompt_category(tenant_id, &request).await?;
        }

        // Reset welcome and system prompts
        self.update_welcome_prompt(
            tenant_id,
            include_str!("../llm/prompts/welcome_prompt.md"),
        ).await?;
        self.update_system_prompt(
            tenant_id,
            include_str!("../llm/prompts/pierre_system.md"),
        ).await?;

        Ok(())
    }
}
```

## Tenant Isolation

Every prompt operation enforces tenant isolation:

1. **Query filtering**: All SELECT queries include `WHERE tenant_id = ?`
2. **Ownership validation**: Updates/deletes verify the category belongs to the tenant
3. **Unique constraints**: `UNIQUE(tenant_id, category_key)` prevents duplicate keys
4. **Foreign key cascade**: `ON DELETE CASCADE` cleans up when tenant is deleted

```rust
/// Ensure the category belongs to the requesting tenant
async fn validate_category_ownership(
    &self,
    tenant_id: &str,
    category_id: &str,
) -> AppResult<PromptCategory> {
    let category = self.get_prompt_category_by_id(category_id).await?;

    if category.tenant_id != tenant_id {
        return Err(AppError::new(
            ErrorCode::PermissionDenied,
            "Category does not belong to this tenant",
        ));
    }

    Ok(category)
}
```

## Frontend Admin UI

**Source**: `frontend/src/components/PromptsAdminTab.tsx`

The admin UI provides three sub-tabs:

### Categories Tab

- Lists all prompt categories with pillar-colored badges
- Create, edit, and delete categories
- Drag-and-drop reordering (via `display_order`)
- Toggle category active/inactive state

### Welcome Tab

- Edit the welcome message shown to new users
- Real-time preview with markdown rendering
- Character count indicator

### System Tab

- Edit the LLM system prompt (markdown format)
- Customize AI assistant behavior and personality
- Reset to default system prompt

### Reset Functionality

```typescript
const resetMutation = useMutation({
  mutationFn: () => apiService.resetPromptsToDefaults(),
  onSuccess: () => {
    // Invalidate all prompt-related queries
    queryClient.invalidateQueries({ queryKey: ['admin-prompt-categories'] });
    queryClient.invalidateQueries({ queryKey: ['admin-welcome-prompt'] });
    queryClient.invalidateQueries({ queryKey: ['admin-system-prompt'] });
    queryClient.invalidateQueries({ queryKey: ['prompt-suggestions'] });
  },
});
```

## Integration with Chat Interface

The chat interface fetches suggestions via the public endpoint:

**Source**: `frontend/src/components/PromptSuggestions.tsx`

```typescript
const { data: suggestions } = useQuery({
  queryKey: ['prompt-suggestions'],
  queryFn: () => apiService.getPromptSuggestions(),
});

// Display categories grouped by pillar
const categoriesByPillar = useMemo(() => {
  return suggestions?.categories.reduce((acc, cat) => {
    const pillar = cat.pillar as Pillar;
    if (!acc[pillar]) acc[pillar] = [];
    acc[pillar].push(cat);
    return acc;
  }, {} as Record<Pillar, PromptCategory[]>);
}, [suggestions]);
```

## Best Practices

### 1. Category Keys

Use descriptive, lowercase keys that won't change:
- Good: `training`, `nutrition`, `recovery`, `recipes`
- Bad: `cat1`, `new_category`, `temp`

### 2. Prompt Writing

Write prompts as questions users would naturally ask:
- Good: "Am I ready for a hard workout today?"
- Bad: "Get workout readiness"

### 3. Pillar Assignment

Match pillars to the primary domain:
- Activity: Training, performance, workouts
- Nutrition: Diet, calories, recipes, hydration
- Recovery: Sleep, rest days, stress, HRV

### 4. Display Order

Use meaningful ordering:
- `0-9`: Primary/featured categories
- `10-19`: Secondary categories
- `20+`: Specialized/advanced categories

## Testing

**Source**: `frontend/e2e/prompts.spec.ts`

The prompt system includes 17 Playwright E2E tests:

```typescript
test.describe('Prompts Admin', () => {
  test('can view prompt categories', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="prompts-tab"]');
    await expect(page.locator('[data-testid="category-card"]'))
      .toHaveCount.greaterThan(0);
  });

  test('can create new category', async ({ page }) => {
    await page.click('[data-testid="create-category-btn"]');
    await page.fill('[data-testid="category-key"]', 'test-category');
    await page.fill('[data-testid="category-title"]', 'Test Category');
    await page.selectOption('[data-testid="pillar-select"]', 'activity');
    await page.click('[data-testid="save-category-btn"]');
    await expect(page.locator('text=Test Category')).toBeVisible();
  });

  test('can reset to defaults', async ({ page }) => {
    await page.click('[data-testid="reset-defaults-btn"]');
    await page.click('[data-testid="confirm-reset-btn"]');
    await expect(page.locator('text=Training')).toBeVisible();
  });
});
```

## Key Takeaways

1. **Three prompt types**: Categories (suggestions), Welcome (first-time), System (LLM instructions)

2. **Tenant isolation**: Each tenant has independent prompt configurations

3. **Pillar classification**: Visual organization into Activity, Nutrition, Recovery

4. **Admin-only management**: CRUD operations require admin role

5. **Reset to defaults**: One-click restore from embedded JSON/markdown files

6. **Real-time updates**: React Query invalidation ensures UI stays current

7. **Markdown support**: System prompts support full markdown formatting

8. **Default prompts**: New tenants get pre-configured defaults automatically

---

**Related Chapters**:
- Chapter 7: Multi-Tenant Isolation (tenant security)
- Chapter 33: Frontend Development (admin tabs)
- Chapter 26: LLM Providers (system prompt usage)
