<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->
<!-- Copyright (c) 2025 Pierre Fitness Intelligence -->

# Chapter 32: SDK Development Tutorial

This chapter provides a hands-on guide to developing and extending the Pierre TypeScript SDK. You'll learn how to set up your development environment, run tests, generate types, and modify the bridge client.

## What You'll Learn

- Setting up the SDK development environment
- Building and running the SDK
- Running unit, integration, and E2E tests
- Understanding the type generation pipeline
- Modifying the bridge client
- Using MCP Inspector for debugging
- Best practices for SDK development

## Prerequisites

- Node.js 24.0+ (required by `engines` field in package.json)
- Running Pierre server (see Chapter 25 for deployment)
- Bun runtime (optional, for faster execution)

## Development Environment Setup

### 1. Install Dependencies

```bash
cd sdk
npm install
```

The SDK uses these key dependencies:
- `@modelcontextprotocol/sdk`: Official MCP SDK for protocol compliance
- `@napi-rs/keyring`: OS-native secure credential storage
- `commander`: CLI argument parsing
- `ajv`: JSON Schema validation

### 2. Build the SDK

```bash
# Production build (esbuild)
npm run build

# Type checking only (no emit)
npm run type-check

# Full TypeScript compilation (for debugging)
npm run build:tsc
```

**Source**: sdk/package.json:12-14
```json
{
  "scripts": {
    "build": "node esbuild.config.mjs",
    "build:tsc": "tsc",
    "type-check": "tsc --noEmit"
  }
}
```

The `esbuild` bundler creates optimized production builds in `dist/`:
- `dist/index.js`: SDK library entry point
- `dist/cli.js`: CLI binary

### 3. Development Mode

For rapid iteration, use `tsx` to run TypeScript directly:

```bash
# Run CLI in development mode
npm run dev

# Or run directly with environment variables
PIERRE_SERVER_URL=http://localhost:8081 npm run dev
```

## SDK Directory Structure

```
sdk/
├── src/
│   ├── bridge.ts        # MCP bridge client (98KB, main logic)
│   ├── cli.ts           # CLI wrapper and argument parsing
│   ├── index.ts         # SDK entry point and exports
│   ├── secure-storage.ts # OS keychain integration
│   └── types.ts         # Auto-generated TypeScript types
├── test/
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   ├── e2e/             # End-to-end tests
│   ├── fixtures/        # Test data fixtures
│   └── helpers/         # Test utilities
├── dist/                # Build output
├── package.json         # npm configuration
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration
└── eslint.config.js     # Linting rules
```

## Running Tests

The SDK uses Jest for testing with three test tiers:

### Unit Tests

Fast, isolated tests for individual functions:

```bash
npm run test:unit
```

### Integration Tests

Tests requiring a running Pierre server:

```bash
# Start Pierre server first
cd .. && cargo run --bin pierre-mcp-server &

# Run integration tests
cd sdk && npm run test:integration
```

### End-to-End Tests

Full workflow tests simulating Claude Desktop:

```bash
npm run test:e2e
```

### All Tests

```bash
npm run test:all
```

**Test configuration** (sdk/package.json):
```json
{
  "jest": {
    "testEnvironment": "node",
    "testTimeout": 30000,
    "testMatch": ["**/test/**/*.test.js"]
  }
}
```

### Legacy Test Scripts

Individual test files for specific scenarios:

```bash
# SSE/Streamable HTTP transport test
npm run test:legacy:sse

# Complete E2E Claude Desktop simulation
npm run test:legacy:e2e

# OAuth flow testing
npm run test:legacy:oauth
```

## Type Generation Pipeline

The SDK auto-generates TypeScript types from Pierre server tool schemas.

### How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Pierre Server  │────►│  generate-sdk-   │────►│  sdk/src/       │
│  (tools/list)   │     │  types.js        │     │  types.ts       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
       ▲                        │
       │                        ▼
    JSON-RPC              JSON Schema → TypeScript
   tools/list              type conversion
```

### Generate Types

**Step 1**: Start Pierre server

```bash
cd .. && RUST_LOG=warn cargo run --bin pierre-mcp-server
```

**Step 2**: Run type generation

```bash
cd sdk && npm run generate-types
```

**Source**: scripts/generate-sdk-types.js:23-76
```javascript
async function fetchToolSchemas() {
  const requestData = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  });

  const options = {
    hostname: 'localhost',
    port: SERVER_PORT,
    path: '/mcp',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(JWT_TOKEN ? { 'Authorization': `Bearer ${JWT_TOKEN}` } : {})
    }
  };
  // ... HTTP request to fetch schemas
}
```

### Type Generation Output

The generator creates `sdk/src/types.ts` with:

1. **Parameter interfaces** (47 tools):
```typescript
export interface GetActivitiesParams {
  start_date?: string;
  end_date?: string;
  limit?: number;
  provider?: string;
}
```

2. **Common data types**:
```typescript
export interface Activity {
  id: string;
  name: string;
  type: string;
  distance?: number;
  // ... all activity fields
}
```

3. **Tool name union**:
```typescript
export type ToolName = "get_activities" | "get_athlete" | ...;
```

4. **Type map**:
```typescript
export interface ToolParamsMap {
  "get_activities": GetActivitiesParams;
  "get_athlete": GetAthleteParams;
  // ...
}
```

### When to Regenerate Types

Regenerate types when:
- Adding new tools in the Rust server
- Modifying tool parameter schemas
- Changing tool response structures

```bash
# Full regeneration workflow
cargo build --release
./target/release/pierre-mcp-server &
cd sdk && npm run generate-types
npm run build
```

## Modifying the Bridge Client

The bridge client (`src/bridge.ts`) is the core of the SDK. Here's how to modify it.

### Understanding the Architecture

**Source**: sdk/src/bridge.ts (structure)
```typescript
// OAuth client provider for authentication
class PierreOAuthClientProvider implements OAuthClientProvider {
  // OAuth flow implementation
}

// Main bridge client
export class PierreMcpClient {
  private config: BridgeConfig;
  private oauthProvider: PierreOAuthClientProvider;
  private mcpClient: Client;
  private mcpServer: Server;

  async start(): Promise<void> {
    // 1. Initialize OAuth provider
    // 2. Create MCP client (HTTP to Pierre)
    // 3. Create MCP server (stdio to host)
    // 4. Connect and start
  }
}
```

### Adding a New Configuration Option

1. **Add to BridgeConfig interface**:

```typescript
// sdk/src/bridge.ts
export interface BridgeConfig {
  pierreServerUrl: string;
  // ... existing options
  myNewOption?: string;  // Add here
}
```

2. **Use in client logic**:

```typescript
async start(): Promise<void> {
  if (this.config.myNewOption) {
    // Handle new option
  }
}
```

3. **Add CLI flag** (sdk/src/cli.ts):

```typescript
program
  .option('--my-new-option <value>', 'Description', process.env.MY_NEW_OPTION);
```

### Adding Custom Request Handling

To intercept or modify MCP requests:

```typescript
// In PierreMcpClient.start()
this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  // Custom handling before forwarding to Pierre
  const result = await this.mcpClient.listTools();
  // Custom post-processing
  return result;
});
```

## Using MCP Inspector

The MCP Inspector is a debugging tool for testing MCP servers:

```bash
# Start inspector with SDK CLI
npm run inspect

# Or with explicit CLI arguments
npm run inspect:cli
```

**Source**: sdk/package.json:22-23
```json
{
  "scripts": {
    "inspect": "npx @modelcontextprotocol/inspector node dist/cli.js",
    "inspect:cli": "npx @modelcontextprotocol/inspector --cli node dist/cli.js"
  }
}
```

The inspector provides:
- Visual tool listing
- Interactive tool calls
- Request/response logging
- OAuth flow testing

## Secure Storage Development

The SDK uses OS-native keychain for token storage.

**Source**: sdk/src/secure-storage.ts (structure)
```typescript
export class SecureTokenStorage {
  private serviceName: string;

  async storeToken(key: string, value: string): Promise<void> {
    // Uses @napi-rs/keyring for OS-native storage
  }

  async getToken(key: string): Promise<string | null> {
    // Retrieves from keychain
  }

  async deleteToken(key: string): Promise<void> {
    // Removes from keychain
  }
}
```

**Platform support**:
- macOS: Keychain (`security` command)
- Windows: Credential Manager
- Linux: Secret Service (libsecret)

## Linting and Code Quality

```bash
# Run ESLint
npm run lint

# Type checking
npm run type-check
```

**ESLint configuration**: sdk/eslint.config.js

## Best Practices

### 1. Logging to stderr

All debug output must go to stderr to keep stdout clean for MCP JSON-RPC:

```typescript
// GOOD: stderr for debugging
console.error('[DEBUG] Connection established');

// BAD: stdout pollutes MCP protocol
console.log('Debug message');  // DON'T DO THIS
```

### 2. Error Handling

Use structured error handling with proper cleanup:

```typescript
try {
  await this.mcpClient.connect();
} catch (error) {
  console.error('Connection failed:', error);
  await this.cleanup();
  throw error;
}
```

### 3. Graceful Shutdown

Always handle SIGINT/SIGTERM for clean process termination:

```typescript
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
```

### 4. Type Safety

Use generated types for all tool calls:

```typescript
import { GetActivitiesParams, Activity } from './types';

const params: GetActivitiesParams = {
  limit: 10,
  provider: 'strava'
};
const result = await client.callTool('get_activities', params);
```

## Troubleshooting

### "Cannot find module" errors

Rebuild the SDK:
```bash
npm run build
```

### Type generation fails

Ensure Pierre server is running and accessible:
```bash
curl http://localhost:8081/health
```

### OAuth flow not completing

Check callback port is available:
```bash
lsof -i :35535
```

### Tests timing out

Increase Jest timeout in package.json:
```json
{
  "jest": {
    "testTimeout": 60000
  }
}
```

## Key Takeaways

1. **Node.js 24+**: Required for the SDK's JavaScript engine features.

2. **Type generation**: Run `npm run generate-types` after server tool changes to keep TypeScript types in sync.

3. **Three test tiers**: Unit tests (fast), integration tests (require server), E2E tests (full simulation).

4. **Secure storage**: Uses OS-native keychain via `@napi-rs/keyring` for token security.

5. **stderr for logging**: Keep stdout clean for MCP JSON-RPC protocol messages.

6. **MCP Inspector**: Use `npm run inspect` for interactive debugging.

7. **Bridge architecture**: `PierreMcpClient` translates stdio ↔ HTTP, OAuth handled by `PierreOAuthClientProvider`.

8. **Build system**: esbuild for fast production builds, tsx for development.

---

**Next Chapter**: [Chapter 33: Frontend Development Tutorial](./chapter-33-frontend-development.md) - Learn how to develop and extend the Pierre React frontend application.
