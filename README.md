# Pierre MCP Server Tutorial

A comprehensive tutorial for building production-grade MCP (Model Context Protocol) servers in Rust.

## Read Online

**[Read the tutorial online](https://async-io.github.io/pierre-tutorial/)**

## About This Tutorial

This tutorial documents the architecture and implementation patterns used in the [Pierre Fitness Intelligence](https://github.com/Async-IO/pierre_mcp_server) MCP server. It covers:

### Part I: Foundations
- Project architecture and module organization
- Type-safe error handling with `thiserror`
- Configuration management and environment variables
- Database architecture with repository pattern

### Part II: Security & Context
- Dependency injection patterns
- Cryptographic key management (MEK + DEK)
- JWT authentication with RS256
- Multi-tenant database isolation
- Middleware and request context

### Part III: Protocols
- JSON-RPC 2.0 foundation
- MCP request flow and tool dispatch
- Transport layers (HTTP, WebSocket, SSE, stdio)
- Tool registry and schema generation
- SDK bridge architecture
- TypeScript type generation

### Part IV: OAuth & Providers
- OAuth 2.0 authorization server (RFC 6749, RFC 7636)
- OAuth 2.0 client for fitness providers
- Pluggable provider architecture
- A2A (Agent-to-Agent) protocol

### Part V: Domain Intelligence
- 47 MCP tools for fitness analysis
- Sports science algorithms (TSS, VDOT, FTP)
- Recovery and sleep analysis
- Nutrition tracking with USDA integration

### Part VI: Operations
- Testing patterns for async Rust
- Design system and frontend
- Deployment strategies
- Performance optimization

## Building Locally

This tutorial uses [mdBook](https://rust-lang.github.io/mdBook/). To build locally:

```bash
# Install mdBook
cargo install mdbook

# Build the book
mdbook build

# Serve locally with hot reload
mdbook serve --open
```

## Contributing

Contributions are welcome! Please:

1. Keep code examples accurate and up-to-date
2. Follow the existing chapter format
3. Include learning objectives and exercises
4. Test any code samples before submitting

## License

This tutorial is dual-licensed under MIT or Apache 2.0, matching the Pierre MCP Server license.

---

*Part of the [Pierre Fitness Intelligence](https://github.com/Async-IO/pierre_mcp_server) project.*
