<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->
<!-- Copyright (c) 2025 Pierre Fitness Intelligence -->

# Chapter 33: Frontend Development Tutorial

This chapter provides a hands-on guide to developing and extending the Pierre React frontend dashboard. You'll learn how to set up your development environment, understand the component architecture, run tests, and modify the application.

## What You'll Learn

- Setting up the frontend development environment
- Understanding the component architecture
- Working with the service layer and React Query
- Adding new features and components
- Running unit, integration, and E2E tests
- Pierre design system guidelines
- Best practices for frontend development

## Prerequisites

- Node.js 18+ (Bun runtime also supported)
- Running Pierre server on localhost:8081
- Basic familiarity with React and TypeScript

## Development Environment Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

Key dependencies:
- **React 19.1.0**: UI framework with hooks
- **TypeScript 5.8.3**: Type safety
- **Vite 6.4.1**: Development server and bundler
- **TailwindCSS 3.4.17**: Utility-first CSS
- **@tanstack/react-query 5.80.7**: Server state management

### 2. Start Development Server

```bash
npm run dev
```

The development server runs at `http://localhost:5173` with:
- Hot module replacement (HMR)
- Vite proxy to backend (avoids CORS issues)
- TypeScript checking

### 3. Build for Production

```bash
npm run build
```

Production build outputs to `dist/` directory.

## Project Structure

```
frontend/
├── src/
│   ├── App.tsx                 # Root component and routing
│   ├── main.tsx               # React entry point
│   ├── index.css              # Global styles (TailwindCSS)
│   ├── components/            # React components (35+)
│   │   ├── Dashboard.tsx      # Main dashboard container
│   │   ├── ChatTab.tsx        # AI chat interface (52KB)
│   │   ├── AdminConfiguration.tsx  # Admin settings
│   │   ├── UserSettings.tsx   # User preferences
│   │   ├── Login.tsx          # Authentication
│   │   ├── Register.tsx       # User registration
│   │   ├── ui/                # Reusable UI primitives
│   │   └── __tests__/         # Component tests
│   ├── contexts/              # React contexts
│   │   ├── AuthContext.tsx    # Authentication state
│   │   ├── WebSocketProvider.tsx  # Real-time updates
│   │   └── auth.ts            # Auth types
│   ├── services/              # API service layer
│   │   └── api.ts             # Axios-based API client
│   ├── hooks/                 # Custom React hooks
│   ├── types/                 # TypeScript definitions
│   └── firebase/              # Firebase integration
├── e2e/                       # Playwright E2E tests (282 tests)
├── integration/               # Integration test config
├── public/                    # Static assets
├── tailwind.config.cjs        # TailwindCSS configuration
├── vite.config.ts             # Vite configuration
└── playwright.config.ts       # Playwright configuration
```

## Component Architecture

### Root Component (`App.tsx`)

The root component handles authentication flow and routing:

**Source**: frontend/src/App.tsx:40-165
```typescript
function AppContent() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('login');

  // OAuth callback handling
  useEffect(() => {
    const params = getOAuthCallbackParams();
    if (params) {
      setOauthCallback(params);
      // Invalidate queries to refresh connection state
      localQueryClient.invalidateQueries({ queryKey: ['oauth-status'] });
    }
  }, [localQueryClient]);

  // Authentication flow
  if (!isAuthenticated) {
    return authView === 'register' ? <Register /> : <Login />;
  }

  // User status flow
  if (user?.user_status === 'pending') return <PendingApproval />;
  if (user?.user_status === 'suspended') return <SuspendedView />;

  // Dashboard for active users
  return <Dashboard />;
}
```

### Context Providers

The app wraps components with three providers:

```typescript
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WebSocketProvider>
          <AppContent />
        </WebSocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

1. **QueryClientProvider**: React Query for server state
2. **AuthProvider**: User authentication and session
3. **WebSocketProvider**: Real-time updates

### Dashboard Tabs

The Dashboard component renders different interfaces based on user role:

| Tab | Component | Description |
|-----|-----------|-------------|
| Home | `OverviewTab.tsx` | Statistics overview |
| Connections | `UnifiedConnections.tsx` | A2A clients, API keys |
| MCP Tokens | `MCPTokensTab.tsx` | Token management |
| Analytics | `UsageAnalytics.tsx` | Usage charts |
| Monitor | `RequestMonitor.tsx` | Request logs |
| Settings | `UserSettings.tsx` | Profile settings |
| Admin | `AdminConfiguration.tsx` | Admin-only settings |

## Admin vs User Mode

Pierre has three user roles that determine the UI experience:

| Role | Access Level | Default Tab |
|------|--------------|-------------|
| `user` | User mode only | Chat |
| `admin` | Admin + User modes | Overview |
| `super_admin` | Full access including token management | Overview |

### User Mode (Regular Users)

**Source**: `frontend/src/components/Dashboard.tsx:207-248`

Regular users see a clean, focused interface:

```
┌─────────────────────────────────────────────────────────────────┐
│  Pierre Fitness Intelligence                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                      AI Chat Interface                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │          Welcome! Ask me about your fitness data.        │   │
│  │                                                          │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │   │
│  │  │  Training   │ │  Nutrition  │ │  Recovery   │       │   │
│  │  │  ⚡ Activity │ │  🥗 Amber   │ │  💤 Indigo  │       │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘       │   │
│  │                                                          │   │
│  │  [Message input field...]                    [Send]     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│                                        [⚙️ Settings]            │
└─────────────────────────────────────────────────────────────────┘
```

**User mode features**:
- **Chat Tab**: AI conversation with prompt suggestions organized by pillar
- **Settings Tab**: Access via gear icon in chat header

```typescript
// Dashboard.tsx - User mode check
if (!isAdminUser) {
  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* Minimal header */}
      <header className="h-12 border-b border-pierre-gray-100">
        <PierreLogoSmall />
        <span>Pierre Fitness Intelligence</span>
      </header>

      {/* Chat or Settings content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <ChatTab onOpenSettings={() => setActiveTab('settings')} />}
        {activeTab === 'settings' && <UserSettings />}
      </main>
    </div>
  );
}
```

### User Settings Tabs

**Source**: `frontend/src/components/UserSettings.tsx:45-83`

Regular users have access to four settings tabs:

| Tab | Description | Features |
|-----|-------------|----------|
| **Profile** | User identity | Display name, email (read-only), avatar |
| **Connections** | OAuth credentials | Add/remove Strava, Fitbit, Garmin, WHOOP, Terra credentials |
| **API Tokens** | MCP tokens | Create/revoke tokens for Claude Desktop, Cursor IDE |
| **Account** | Account management | Status, role, sign out, danger zone |

```typescript
const SETTINGS_TABS: { id: SettingsTab; name: string }[] = [
  { id: 'profile', name: 'Profile' },
  { id: 'connections', name: 'Connections' },
  { id: 'tokens', name: 'API Tokens' },
  { id: 'account', name: 'Account' },
];
```

### Admin Mode (Admin/Super Admin)

**Source**: `frontend/src/components/Dashboard.tsx:250-540`

Admins see a full sidebar with navigation:

```
┌──────────────┬──────────────────────────────────────────────────┐
│              │                                                  │
│  [Pierre]    │  Overview                                        │
│              │                                                  │
│  Overview ● │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  Connections │  │ Total Users │ │ Active Keys │ │ Requests    ││
│  Analytics   │  │     127     │ │      45     │ │   12,847    ││
│  Monitor     │  └─────────────┘ └─────────────┘ └─────────────┘│
│  Tools       │                                                  │
│  Users    🔴 │  Weekly Usage Chart                              │
│  Config      │  [═══════════════════════════════════════]       │
│  Prompts     │                                                  │
│  Settings    │  Rate Limits          A2A Connections            │
│              │  [████████░░] 80%     ● Client A    Connected    │
│  ──────────  │                       ● Client B    Connected    │
│  👤 Admin    │                                                  │
│  [Sign out]  │                                                  │
│              │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

**Admin tabs** (9 total):

| Tab | Component | Description |
|-----|-----------|-------------|
| **Overview** | `OverviewTab.tsx` | Dashboard statistics, quick links |
| **Connections** | `UnifiedConnections.tsx` | A2A clients, OAuth connections |
| **Analytics** | `UsageAnalytics.tsx` | Usage charts, trends |
| **Monitor** | `RequestMonitor.tsx` | Real-time request logs |
| **Tools** | `ToolUsageBreakdown.tsx` | Tool usage analysis |
| **Users** | `UserManagement.tsx` | User list, approve/suspend (badge shows pending count) |
| **Configuration** | `AdminConfiguration.tsx` | LLM providers, tenant settings |
| **Prompts** | `PromptsAdminTab.tsx` | Manage AI prompts (see Chapter 34) |
| **Settings** | `AdminSettings.tsx` | Auto-approval, security settings |

**Super admin additional tab**:

| Tab | Component | Description |
|-----|-----------|-------------|
| **Admin Tokens** | `ApiKeyList.tsx` / `ApiKeyDetails.tsx` | System API key management |

```typescript
// Admin tabs definition
const adminTabs: TabDefinition[] = [
  { id: 'overview', name: 'Overview', icon: <ChartIcon /> },
  { id: 'connections', name: 'Connections', icon: <WifiIcon /> },
  { id: 'analytics', name: 'Analytics', icon: <GraphIcon /> },
  { id: 'monitor', name: 'Monitor', icon: <EyeIcon /> },
  { id: 'tools', name: 'Tools', icon: <GearIcon /> },
  { id: 'users', name: 'Users', icon: <UsersIcon />, badge: pendingUsers.length },
  { id: 'configuration', name: 'Configuration', icon: <SlidersIcon /> },
  { id: 'prompts', name: 'Prompts', icon: <ChatIcon /> },
  { id: 'admin-settings', name: 'Settings', icon: <SettingsIcon /> },
];

// Super admin extends with token management
const superAdminTabs = [
  ...adminTabs,
  { id: 'admin-tokens', name: 'Admin Tokens', icon: <KeyIcon /> },
];
```

### Role Detection

**Source**: `frontend/src/components/Dashboard.tsx:77-82`

```typescript
const { user, logout } = useAuth();
const isAdminUser = user?.role === 'admin' || user?.role === 'super_admin';
const isSuperAdmin = user?.role === 'super_admin';

// Default tab based on role
const [activeTab, setActiveTab] = useState(isAdminUser ? 'overview' : 'chat');
```

### Admin-Only Features

**Users Tab** (`UserManagement.tsx`):
- View all registered users
- Approve pending registrations
- Suspend/unsuspend users
- View user activity details

**Configuration Tab** (`AdminConfiguration.tsx`):
- LLM provider selection (OpenAI, Anthropic, etc.)
- Model configuration
- Tenant-specific settings

**Prompts Tab** (`PromptsAdminTab.tsx`):
- Manage prompt categories
- Edit welcome message
- Customize system prompt
- Reset to defaults

**Settings Tab** (`AdminSettings.tsx`):
- Toggle auto-approval for registrations
- System information display
- Security recommendations

### Pending Users Badge

The Users tab shows a red badge when users are pending approval:

```typescript
const { data: pendingUsers = [] } = useQuery<User[]>({
  queryKey: ['pending-users'],
  queryFn: () => apiService.getPendingUsers(),
  staleTime: 30_000,
  enabled: isAdminUser,
});

// In tab definition
{ id: 'users', name: 'Users', badge: pendingUsers.length > 0 ? pendingUsers.length : undefined }
```

### Sidebar Collapse

The admin sidebar can be collapsed for more screen space:

```typescript
const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

// Collapsed: 72px, Expanded: 260px
<aside className={clsx(
  'fixed left-0 top-0 h-screen',
  sidebarCollapsed ? 'w-[72px]' : 'w-[260px]'
)}>
```

## Service Layer

### API Service (`services/api.ts`)

The `ApiService` class centralizes all HTTP communication:

**Source**: frontend/src/services/api.ts:10-62
```typescript
class ApiService {
  private csrfToken: string | null = null;

  constructor() {
    axios.defaults.baseURL = API_BASE_URL;
    axios.defaults.headers.common['Content-Type'] = 'application/json';
    axios.defaults.withCredentials = true;
    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Add CSRF token to state-changing requests
    axios.interceptors.request.use((config) => {
      if (this.csrfToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method?.toUpperCase() || '')) {
        config.headers['X-CSRF-Token'] = this.csrfToken;
      }
      return config;
    });

    // Handle 401 authentication failures
    axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          this.handleAuthFailure();
        }
        return Promise.reject(error);
      }
    );
  }
}
```

### Key API Methods

```typescript
// Authentication
await apiService.login(email, password);
await apiService.loginWithFirebase(idToken);
await apiService.logout();
await apiService.register(email, password, displayName);

// API Keys
await apiService.createApiKey({ name, description, rate_limit_requests });
await apiService.getApiKeys();
await apiService.deactivateApiKey(keyId);

// A2A Clients
await apiService.createA2AClient(data);
await apiService.getA2AClients();

// Admin Operations
await apiService.getPendingUsers();
await apiService.approveUser(userId);
await apiService.suspendUser(userId);
await apiService.startImpersonation(targetUserId, reason);
```

### React Query Integration

Components use React Query for data fetching:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function ApiKeyList() {
  const queryClient = useQueryClient();

  // Fetch API keys
  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiService.getApiKeys(),
  });

  // Deactivate mutation
  const deactivateMutation = useMutation({
    mutationFn: (keyId: string) => apiService.deactivateApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  return (
    <div>
      {apiKeys?.map((key) => (
        <ApiKeyCard
          key={key.id}
          apiKey={key}
          onDeactivate={() => deactivateMutation.mutate(key.id)}
        />
      ))}
    </div>
  );
}
```

## Authentication Context

**Source**: frontend/src/contexts/AuthContext.tsx:16-187
```typescript
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [impersonation, setImpersonation] = useState<ImpersonationState>(...);

  const login = async (email: string, password: string) => {
    const response = await apiService.login(email, password);
    const { access_token, csrf_token, user: userData } = response;

    apiService.setCsrfToken(csrf_token);
    setToken(access_token);
    setUser(userData);
    localStorage.setItem('jwt_token', access_token);
  };

  // Admin impersonation
  const startImpersonation = useCallback(async (targetUserId: string) => {
    if (user?.role !== 'super_admin') {
      throw new Error('Only super admins can impersonate users');
    }
    const response = await apiService.startImpersonation(targetUserId);
    setImpersonation({
      isImpersonating: true,
      targetUser: response.target_user,
      originalUser: user,
    });
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, ... }}>
      {children}
    </AuthContext.Provider>
  );
}
```

## WebSocket Real-Time Updates

The `WebSocketProvider` enables real-time dashboard updates:

```typescript
// Connect to WebSocket for live updates
const { connectionStatus, subscribe, lastMessage } = useWebSocket();

// Subscribe to usage updates
useEffect(() => {
  subscribe('usage');
  subscribe('system');
}, [subscribe]);

// React to real-time messages
useEffect(() => {
  if (lastMessage?.type === 'usage_update') {
    // Update UI with new usage data
  }
}, [lastMessage]);
```

## Adding New Features

### 1. Create a New Component

```typescript
// src/components/MyNewFeature.tsx
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';

export function MyNewFeature() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-feature'],
    queryFn: () => apiService.getMyFeatureData(),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-pierre-gray-900">
        My New Feature
      </h2>
      {/* Feature content */}
    </div>
  );
}
```

### 2. Add API Method

```typescript
// src/services/api.ts
async getMyFeatureData() {
  const response = await axios.get('/api/my-feature');
  return response.data;
}

async updateMyFeature(data: MyFeatureData) {
  const response = await axios.put('/api/my-feature', data);
  return response.data;
}
```

### 3. Add to Dashboard

```typescript
// src/components/Dashboard.tsx
import { MyNewFeature } from './MyNewFeature';

// Add to tabs array
const tabs = [
  // ... existing tabs
  { id: 'my-feature', label: 'My Feature', component: MyNewFeature },
];
```

## Testing

### Unit Tests (Vitest)

```bash
# Run tests in watch mode
npm test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

**Test example** (frontend/src/components/__tests__/):
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Login } from '../Login';

describe('Login', () => {
  it('submits login form', async () => {
    const mockLogin = vi.fn();
    render(<Login onLogin={mockLogin} />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
  });
});
```

### E2E Tests (Playwright)

The E2E suite covers **282 tests** across 13 spec files:

```bash
# Run all E2E tests
npm run test:e2e

# Run with Playwright UI
npm run test:e2e:ui

# Run in headed mode (visible browser)
npm run test:e2e:headed

# Run specific test file
npx playwright test e2e/connections.spec.ts
```

**Test structure** (e2e/):
```typescript
import { test, expect } from '@playwright/test';
import { setupDashboardMocks, loginToDashboard, navigateToTab } from './test-helpers';

test.describe('API Keys', () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page, { role: 'admin' });
    await loginToDashboard(page);
    await navigateToTab(page, 'Connections');
  });

  test('creates new API key', async ({ page }) => {
    await page.click('[data-testid="create-api-key"]');
    await page.fill('[name="name"]', 'Test Key');
    await page.click('[type="submit"]');
    await expect(page.locator('.success-message')).toBeVisible();
  });
});
```

### Integration Tests

```bash
npm run test:integration
npm run test:integration:ui
```

## Pierre Design System

### Color Palette

The frontend uses Pierre's custom TailwindCSS theme:

```css
/* Pierre brand colors */
.text-pierre-violet        /* #6366F1 - Primary brand color */
.bg-pierre-gray-50         /* #F9FAFB - Background */
.text-pierre-gray-900      /* #111827 - Primary text */
.bg-pierre-activity        /* #10B981 - Success/activity */
.text-pierre-performance   /* #F59E0B - Warning/performance */
```

### Component Patterns

**Card pattern**:
```tsx
<div className="bg-white rounded-lg shadow p-6">
  <h3 className="text-lg font-semibold text-pierre-gray-900">
    Card Title
  </h3>
  <p className="text-sm text-pierre-gray-600 mt-2">
    Card content
  </p>
</div>
```

**Button variants**:
```tsx
// Primary button
<button className="bg-pierre-violet text-white px-4 py-2 rounded-lg hover:bg-pierre-violet-dark">
  Primary Action
</button>

// Secondary button
<button className="border border-pierre-gray-300 text-pierre-gray-700 px-4 py-2 rounded-lg hover:bg-pierre-gray-50">
  Secondary Action
</button>
```

**Loading states**:
```tsx
<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pierre-violet" />
```

## Best Practices

### 1. Type Safety

Always define TypeScript interfaces:

```typescript
interface ApiKey {
  id: string;
  name: string;
  created_at: string;
  expires_at?: string;
  rate_limit_requests: number;
  usage_count: number;
}
```

### 2. Error Handling

Use React Query's error handling:

```typescript
const { data, error, isError } = useQuery({ ... });

if (isError) {
  return (
    <div className="bg-red-50 text-red-700 p-4 rounded-lg">
      Error: {error.message}
    </div>
  );
}
```

### 3. Loading States

Always show loading feedback:

```typescript
if (isLoading) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pierre-violet" />
    </div>
  );
}
```

### 4. Query Invalidation

Invalidate queries after mutations:

```typescript
const mutation = useMutation({
  mutationFn: apiService.createApiKey,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    toast.success('API key created');
  },
});
```

### 5. Accessibility

Include ARIA attributes and keyboard navigation:

```tsx
<button
  aria-label="Delete API key"
  onClick={handleDelete}
  className="focus:ring-2 focus:ring-pierre-violet focus:outline-none"
>
  Delete
</button>
```

## Troubleshooting

### CORS Errors

The Vite dev server proxies API requests. If you see CORS errors:
- Ensure Pierre server is running on port 8081
- Check `vite.config.ts` proxy configuration

### Authentication Issues

Clear browser storage and re-authenticate:
```javascript
localStorage.clear();
window.location.reload();
```

### React Query Stale Data

Force refresh queries:
```typescript
queryClient.invalidateQueries();
```

## Key Takeaways

1. **React 19 + TypeScript**: Modern React with full type safety.

2. **React Query**: Server state management with automatic caching and refetching.

3. **Context providers**: `AuthProvider` for auth, `WebSocketProvider` for real-time updates.

4. **API service**: Centralized Axios client with interceptors for CSRF and auth.

5. **TailwindCSS**: Utility-first styling with Pierre's custom theme.

6. **Testing pyramid**: Unit (Vitest), E2E (Playwright, 282 tests), Integration.

7. **Component-based**: 35+ components organized by feature.

8. **User flows**: Registration → Pending → Approved → Active lifecycle.

9. **Admin features**: Impersonation, user management, system settings.

10. **Real-time**: WebSocket integration for live dashboard updates.

---

**End of Tutorial**

You've completed the comprehensive Pierre Fitness Platform tutorial! You now understand:
- **Part I**: Foundation (architecture, errors, config, DI)
- **Part II**: Authentication & Security (cryptography, JWT, multi-tenancy, middleware)
- **Part III**: MCP Protocol (JSON-RPC, request flow, transports, tool registry)
- **Part IV**: SDK & Type System (bridge architecture, type generation)
- **Part V**: OAuth, A2A & Providers (OAuth server/client, provider abstraction, A2A protocol)
- **Part VI**: Tools & Intelligence (47 tools, sports science algorithms, recovery, nutrition)
- **Part VII**: Testing & Deployment (synthetic data, design system, production deployment)
- **SDK Development**: TypeScript SDK with type generation pipeline
- **Frontend Development**: React dashboard with 35+ components

**Next Steps**:
1. Review CLAUDE.md for code standards
2. Explore the codebase using Appendix C as a map
3. Run the test suite to see synthetic data in action
4. Set up local development environment
5. Contribute improvements or new features

Happy coding!
