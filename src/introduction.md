# Pierre MCP Server Tutorial

Welcome to the comprehensive tutorial for building production-grade MCP (Model Context Protocol) servers in Rust.

## What You'll Learn

This tutorial takes you through every aspect of the Pierre Fitness Intelligence platform, a real-world production MCP server implementation. You'll learn:

- **Production Rust Architecture** - Module organization, error handling, configuration management
- **Security & Authentication** - JWT tokens, cryptographic key management, multi-tenant isolation
- **Protocol Implementation** - JSON-RPC 2.0, MCP protocol, A2A (Agent-to-Agent) communication
- **OAuth 2.0** - Both server and client implementations with PKCE support
- **Provider Integration** - Pluggable provider architecture for fitness APIs (Strava, Garmin, Fitbit, etc.)
- **Sports Science** - Real algorithms for TSS, VDOT, FTP, CTL/ATL/TSB
- **Testing** - Comprehensive testing patterns for async Rust applications

## Prerequisites

Before starting this tutorial, you should have:

- Basic Rust knowledge (ownership, borrowing, traits, async/await)
- Familiarity with `cargo` and Rust project structure
- Understanding of HTTP APIs and JSON
- Basic knowledge of OAuth 2.0 (helpful but not required)

## How to Use This Tutorial

Each chapter builds on previous ones but can also be read standalone for reference:

1. **Chapters 1-4**: Start here for foundational concepts
2. **Chapters 5-8**: Security-focused deep dive
3. **Chapters 9-14**: Protocol implementation details
4. **Chapters 15-18**: OAuth and provider integration
5. **Chapters 19-22**: Domain-specific implementation
6. **Chapters 23-31**: Operations and advanced topics

Each chapter includes:
- **Learning Objectives** - What you'll understand after reading
- **Prerequisites** - Prior knowledge needed
- **Code Examples** - Real code from the Pierre codebase
- **Rust Idioms** - Explanations of patterns and best practices
- **Practical Exercises** - Hands-on coding challenges

## About Pierre

Pierre is a fitness intelligence platform that provides:

- **47 MCP tools** for fitness data analysis
- **Multi-tenant SaaS architecture** with complete data isolation
- **OAuth 2.0 server** for MCP client authentication
- **Pluggable provider system** supporting Strava, Garmin, Fitbit, Whoop, and Terra
- **Sports science algorithms** for training load, performance, and recovery analysis

The codebase demonstrates production-grade Rust patterns:
- Zero `unsafe` code policy
- Structured error handling (no `anyhow!` in production)
- Comprehensive test coverage
- ~300 source files in a well-organized module hierarchy

## Getting Started

Let's begin with [Chapter 1: Project Architecture](./chapter-01-project-architecture.md) to understand how the codebase is organized.

---

*This tutorial is maintained alongside the [Pierre MCP Server](https://github.com/Async-IO/pierre_mcp_server) codebase.*
