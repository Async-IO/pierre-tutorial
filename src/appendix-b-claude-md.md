<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->
<!-- Copyright (c) 2025 Pierre Fitness Intelligence -->

# Appendix B: CLAUDE.md Compliance Reference

Comprehensive reference for Pierre codebase standards from `.claude/CLAUDE.md`.

## Error Handling (Zero Tolerance)

### Structured Error Types (REQUIRED)

All errors MUST use project-specific error enums:

```rust
// ✅ GOOD: Structured error types
return Err(AppError::not_found(format!("User {user_id}")));
return Err(DatabaseError::ConnectionFailed { source: e.to_string() }.into());
return Err(ProviderError::RateLimitExceeded {
    provider: "Strava".to_string(),
    retry_after_secs: 3600,
    limit_type: "Daily quota".to_string(),
});

// ✅ GOOD: Mapping external errors
external_lib_call().map_err(|e| AppError::internal(format!("API failed: {e}")))?;
```

### Prohibited Patterns (CI Failure)

```rust
// ❌ FORBIDDEN: anyhow::anyhow!()
return Err(anyhow::anyhow!("User not found"));

// ❌ FORBIDDEN: anyhow! macro shorthand
return Err(anyhow!("Invalid input"));

// ❌ FORBIDDEN: In map_err closures
.map_err(|e| anyhow!("Failed: {e}"))?;

// ❌ FORBIDDEN: In ok_or_else
.ok_or_else(|| anyhow!("Not found"))?;
```

### `unwrap()` and `expect()` Rules

- **`unwrap()`**: Only in tests, static data, or binary `main()`
- **`expect()`**: Only for documenting invariants that should never fail:
  ```rust
  // ✅ OK: Static/compile-time data
  "127.0.0.1".parse().expect("valid IP literal")

  // ❌ FORBIDDEN: Runtime errors
  user_input.parse().expect("should be valid") // NO!
  ```

## Code Style Requirements

### File Headers (REQUIRED)

All code files MUST start with ABOUTME comments:

```rust
// ABOUTME: Brief description of what this module does
// ABOUTME: Additional context about the module's responsibility
```

### Import Style (Enforced by Clippy)

Use `use` imports at the top of the file. Avoid inline qualified paths:

```rust
// ✅ GOOD: Import at top of file
use crate::models::User;
use std::collections::HashMap;

fn example() {
    let user = User::new();
    let map = HashMap::new();
}

// ❌ BAD: Inline qualified paths
fn example() {
    let user = crate::models::User::new();  // NO!
    let map = std::collections::HashMap::new();  // NO!
}
```

### Naming Conventions

- **NEVER** use `_` prefix for unused variables (fix the unused variable properly)
- **NEVER** name things `improved`, `new`, `enhanced` - code naming should be evergreen
- **NEVER** add placeholder, `dead_code`, or mock code in production

### Comments

- **NEVER** remove existing comments unless provably false
- Comments should be evergreen - avoid temporal references ("after refactor", "recently changed")
- Use `///` for public API documentation
- Use `//` for inline implementation comments

## Tiered Validation Approach

### Tier 1: Quick Iteration (during development)

```bash
cargo fmt
cargo check --quiet
cargo test <test_name_pattern> -- --nocapture
```

### Tier 2: Pre-Commit (before committing)

```bash
cargo fmt
./scripts/architectural-validation.sh
cargo clippy --all-targets -- -D warnings -D clippy::all -D clippy::pedantic -D clippy::nursery -W clippy::cognitive_complexity
cargo test <module_pattern> -- --nocapture
```

**CRITICAL**: Always use `--all-targets` with clippy. Without it, clippy misses lint errors in `tests/`, `benches/`, and binary crates.

### Tier 3: Full Validation (before PR/merge)

```bash
./scripts/lint-and-test.sh
```

Full test suite takes ~13 minutes (647 tests). Only run for PRs/merges.

## Memory and Performance

### Clone Usage Guidelines

Document why each `clone()` is necessary:

```rust
// ✅ OK: Arc clone (cheap, self-documenting)
let db_clone = database.clone();

// ✅ OK: Documented clone
let name = user.name.clone(); // Needed: ownership moves to async task
tokio::spawn(async move {
    process(name).await;
});

// ❌ BAD: Unnecessary clone
let name = user.name.clone();
println!("{}", name);  // Should just use &user.name
```

### Arc Usage

- Only use when actual shared ownership required across threads
- Document the sharing requirement in comments
- Prefer `&T` references when data lifetime allows
- Current count: ~107 Arc usages (appropriate for multi-tenant async architecture)

### Lazy Statics

```rust
// ✅ GOOD: LazyLock for compile-time-known initialization (Rust 1.80+)
use std::sync::LazyLock;
static CONFIG: LazyLock<Config> = LazyLock::new(|| Config::load());

// ✅ GOOD: OnceLock for runtime values
use std::sync::OnceLock;
static RUNTIME_CONFIG: OnceLock<Config> = OnceLock::new();
```

## Testing Requirements

### Test Coverage Policy

NO EXCEPTIONS: All code must have:
- Unit tests
- Integration tests
- End-to-end tests

Only skip with explicit authorization: "I AUTHORIZE YOU TO SKIP WRITING TESTS THIS TIME"

### Test Targeting

```bash
# By test name (partial match)
cargo test test_training_load

# By test file
cargo test --test intelligence_test

# By module path
cargo test intelligence::
```

## Security Requirements

- **Input validation**: Validate all user inputs at boundaries
- **SQL injection prevention**: Use parameterized queries
- **Secret management**: Never hardcode secrets, use `zeroize` for crypto keys
- **No `allow(clippy::...)` attributes** except for type conversion casts

## Module Organization

- Public API defined in `mod.rs` via re-exports
- Use `pub(crate)` for internal APIs
- Group related functionality in modules
- Feature flags for conditional compilation (database backends)

## Commit Protocol

1. Run tiered validation (Tier 2 minimum)
2. Create atomic commits with clear messages
3. **NEVER** use `--no-verify` flag
4. **NEVER** amend commits already pushed to remote

## Key Compliance Checks

| Check | Requirement |
|-------|-------------|
| `anyhow!()` macro | ❌ FORBIDDEN in production code |
| `unwrap()` | Tests/static data/binary main only |
| `#[allow(clippy::...)]` | Only for cast validations |
| ABOUTME comments | REQUIRED on all source files |
| `--all-targets` | REQUIRED with clippy |
| Structured errors | REQUIRED via `AppError`, etc. |

## Quick Checklist

- [ ] No `anyhow::anyhow!()` in production code
- [ ] No unwarranted `unwrap()` or `expect()`
- [ ] ABOUTME comments at top of file
- [ ] Use imports, not inline qualified paths
- [ ] Document `clone()` usage when not Arc
- [ ] Run clippy with `--all-targets`
- [ ] Tests for all new functionality
