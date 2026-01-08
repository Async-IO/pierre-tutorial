<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->
<!-- Copyright (c) 2025 Pierre Fitness Intelligence -->

# Appendix A: Rust Idioms Reference

Quick reference for Rust idioms used throughout Pierre.

## Error Handling

**`?` operator**: Propagate errors up the call stack.
```rust
let data = fetch_data()?; // Returns early if error
```

**`thiserror`**: Derive Error trait with formatted messages.
```rust
#[derive(Error, Debug)]
#[error("Database error: {0}")]
pub struct DbError(String);
```

### Structured Error Types (REQUIRED)

**CRITICAL**: Pierre prohibits `anyhow::anyhow!()` macro in all production code. All errors MUST use structured error types.

**Correct patterns**:
```rust
// GOOD: Using structured error types
return Err(AppError::not_found(format!("User {user_id}")));
return Err(DatabaseError::ConnectionFailed { source: e.to_string() }.into());

// GOOD: Mapping external errors to structured types
external_lib_call().map_err(|e| AppError::internal(format!("API failed: {e}")))?;

// GOOD: Adding context to structured errors
database_operation().context("Failed to fetch user profile")?;
```

**Prohibited patterns (ZERO TOLERANCE)**:
```rust
// ❌ FORBIDDEN: Using anyhow::anyhow!()
return Err(anyhow::anyhow!("User not found"));

// ❌ FORBIDDEN: In map_err closures
.map_err(|e| anyhow!("Failed: {e}"))?;

// ❌ FORBIDDEN: In ok_or_else
.ok_or_else(|| anyhow!("Not found"))?;
```

**Why structured errors?**
- Enable type-safe error handling and proper HTTP status code mapping
- Support better error messages, logging, and debugging
- Make error handling testable and maintainable

## Option and Result Patterns

**`Option::is_some_and`**: Check Some and condition in one call.
```rust
token.expires_at.is_some_and(|exp| exp > Utc::now())
```

**`Result::map_or`**: Transform result or use default.
```rust
result.map_or(0, |val| val.len())
```

## Ownership and Borrowing

**`Arc<T>`**: Shared ownership across threads.
```rust
let database = Arc::new(Database::new());
let db_clone = database.clone(); // Cheap reference count increment
```

**`Box<dyn Trait>`**: Heap-allocated trait objects.
```rust
let provider: Box<dyn FitnessProvider> = Box::new(StravaProvider::new());
```

## Async Patterns

**`async_trait`**: Async methods in traits.
```rust
#[async_trait]
trait Provider {
    async fn get_data(&self) -> Result<Data>;
}
```

**HRTB for Deserialize**: Higher-ranked trait bound.
```rust
where
    T: for<'de> Deserialize<'de>,
```

## Type Safety Patterns

**Enum for algorithm selection**:
```rust
enum Algorithm {
    Method1 { param: u32 },
    Method2,
}
```

**`#[must_use]`**: Compiler warning if return value ignored.
```rust
#[must_use]
pub fn calculate(&self) -> f64 { ... }
```

## Memory Management

**`zeroize`**: Secure memory cleanup for secrets.
```rust
use zeroize::Zeroize;
secret.zeroize(); // Overwrite with zeros
```

**`LazyLock`**: Thread-safe lazy static initialization (Rust 1.80+, preferred).
```rust
use std::sync::LazyLock;

// Initialization function runs once on first access
static CONFIG: LazyLock<Config> = LazyLock::new(|| Config::load());

// Usage - always initialized
let cfg = &*CONFIG; // Deref to get &Config
```

**`OnceLock`**: Thread-safe one-time initialization with runtime values.
```rust
use std::sync::OnceLock;

// When you need to set the value dynamically at runtime
static RUNTIME_CONFIG: OnceLock<Config> = OnceLock::new();

fn initialize(config: Config) {
    RUNTIME_CONFIG.get_or_init(|| config);
}
```

**When to use which**:
- `LazyLock`: Initialization is known at compile time (replaces `lazy_static!`)
- `OnceLock`: Initialization depends on runtime values or must be deferred

## Memory Allocation Guidance

### When to Use Each Smart Pointer

| Type | Heap? | Thread-Safe? | Use Case |
|------|-------|--------------|----------|
| `T` (owned) | No | N/A | Small, short-lived values |
| `Box<T>` | Yes | No | Large values, recursive types |
| `Rc<T>` | Yes | No | Single-thread shared ownership |
| `Arc<T>` | Yes | Yes | Multi-thread shared ownership |
| `Cow<'a, T>` | Maybe | No | Clone-on-write optimization |

### Stack vs Heap Guidelines

**Prefer stack allocation**:
```rust
// GOOD: Small structs on stack
let point = Point { x: 1.0, y: 2.0 }; // 16 bytes on stack

// GOOD: Arrays of known size
let buffer: [u8; 1024] = [0; 1024]; // 1KB on stack
```

**Use heap for**:
```rust
// Large data - avoid stack overflow
let large: Box<[u8; 1_000_000]> = Box::new([0; 1_000_000]);

// Dynamic size
let activities: Vec<Activity> = fetch_activities().await?;

// Trait objects (unknown size at compile time)
let provider: Box<dyn FitnessProvider> = get_provider();

// Recursive types
enum LinkedList {
    Node(i32, Box<LinkedList>),
    Nil,
}
```

### Avoiding Unnecessary Allocations

**Use slices instead of vectors**:
```rust
// BAD: Allocates new Vec
fn process(data: Vec<u8>) { ... }

// GOOD: Borrows existing data
fn process(data: &[u8]) { ... }
```

**Use `&str` for string parameters**:
```rust
// BAD: Requires allocation or move
fn greet(name: String) { ... }

// GOOD: Accepts &str, &String, or String
fn greet(name: &str) { ... }

// BEST: Generic, accepts anything string-like
fn greet(name: impl AsRef<str>) { ... }
```

**Clone-on-write for conditional ownership**:
```rust
use std::borrow::Cow;

fn process_name(name: Cow<'_, str>) -> Cow<'_, str> {
    if name.contains(' ') {
        // Only allocates if modification needed
        Cow::Owned(name.replace(' ', "_"))
    } else {
        name // No allocation
    }
}
```

### Activity Stream Processing

For large data streams (GPS, power, heart rate):

```rust
// BAD: Loads entire stream into memory
let stream: Vec<f64> = activity.power_stream.clone();
let np = calculate_np(&stream);

// GOOD: Process in chunks with iterator
fn calculate_np_streaming<I>(stream: I, window: usize) -> f64
where
    I: Iterator<Item = f64>,
{
    // Uses fixed-size window buffer, O(window) space
    let mut window_buf = VecDeque::with_capacity(window);
    // ... process
}
```

### Reducing Clone Usage

```rust
// BAD: Unnecessary clone
let name = user.name.clone();
println!("{}", name);

// GOOD: Borrow instead
println!("{}", &user.name);

// When clone is necessary, document why
let name = user.name.clone(); // Needed: ownership moves to async task
tokio::spawn(async move {
    process(name).await;
});
```

### Arc vs Clone for Shared State

```rust
// GOOD: Arc cloning is cheap (atomic counter increment)
let db = Arc::new(Database::new());
let db_clone = db.clone(); // ~2 CPU instructions

// BAD: Cloning large data
let activities = expensive_query().await?;
let activities_clone = activities.clone(); // Allocates!

// GOOD: Share via Arc if needed in multiple places
let activities = Arc::new(expensive_query().await?);
let activities_ref = activities.clone(); // Cheap
```

## Key Takeaways

1. **Error propagation**: Use `?` operator for clean error handling.
2. **Structured errors**: `anyhow!()` is forbidden in production code. Use `AppError`, `DatabaseError`, `ProviderError` enums.
3. **Trait objects**: `Arc<dyn Trait>` for shared polymorphism.
4. **Async traits**: `#[async_trait]` macro enables async methods in traits.
5. **Type safety**: Enums and `#[must_use]` prevent common mistakes.
6. **Secure memory**: `zeroize` crate for cryptographic key cleanup.
7. **Lazy statics**: Use `std::sync::LazyLock` (Rust 1.80+) for compile-time-known lazy initialization, `OnceLock` for runtime values.
