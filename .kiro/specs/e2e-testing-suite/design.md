# Design Document

## Overview

The E2E testing system for FaîtiereHub uses Playwright with TypeScript to automate 6 tester scenarios against the live staging environment. The architecture follows the Page Object Model pattern for maintainability, with shared authentication state for performance, and fixture-based test data management for isolation.

## Architecture

### Directory Structure

```
e2e/
├── playwright.config.ts          # Playwright configuration
├── global-setup.ts               # Pre-authenticates all demo accounts
├── global-teardown.ts            # Cleans up E2E test data
├── .auth/                        # Stored auth state (gitignored)
│   ├── super-admin.json
│   ├── coop-admin.json
│   ├── fenomat-admin.json
│   └── member.json
├── fixtures/
│   ├── auth.fixture.ts           # Custom test fixtures with pre-authenticated pages
│   ├── test-data.fixture.ts      # Test data creation/cleanup utilities
│   └── base.fixture.ts           # Combined fixture exports
├── pages/
│   ├── login.page.ts             # Login page object
│   ├── dashboard.page.ts         # Dashboard page object
│   ├── members.page.ts           # Members management page object
│   ├── cards.page.ts             # Cards page object
│   ├── marketplace.page.ts       # Public marketplace page object
│   ├── marketplace-admin.page.ts # Admin marketplace page object
│   └── verify.page.ts            # QR verification page object
├── helpers/
│   ├── supabase.helper.ts        # Direct Supabase client for data setup/teardown
│   └── constants.ts              # Test constants, URLs, credentials
├── tests/
│   ├── 01-navigation.spec.ts     # Scenario 1: Navigation & UX
│   ├── 02-authentication.spec.ts # Scenario 2: Authentication flows
│   ├── 03-members.spec.ts        # Scenario 3: Member management
│   ├── 04-cards.spec.ts          # Scenario 4: Card generation
│   ├── 05-marketplace.spec.ts    # Scenario 5: Comptes d'exploitation
│   └── 06-verification.spec.ts   # Scenario 6: QR & Mobile
└── .env.e2e                      # E2E-specific environment variables
```

### Authentication Strategy

The global setup script authenticates all 4 demo accounts once before the test suite runs, storing session state in `.auth/` JSON files. Individual tests use Playwright's `storageState` option to load pre-authenticated sessions without repeating login flows. This reduces test execution time significantly.

```typescript
// global-setup.ts approach
// 1. Launch browser
// 2. For each demo account: navigate to /auth/login, fill credentials, submit
// 3. Wait for redirect (confirms auth success)
// 4. Save storageState to .auth/{role}.json
// 5. Close browser
```

### Page Object Model

Each page object encapsulates:
- Locator definitions (using accessible selectors: role, label, text)
- Action methods (click, fill, navigate)
- Assertion helpers (isVisible, hasText, hasCount)

```typescript
// Example: MembersPage
class MembersPage {
  readonly page: Page
  readonly addButton: Locator
  readonly searchInput: Locator
  readonly membersTable: Locator
  
  async addMember(data: { firstName: string; lastName: string }) { ... }
  async searchMembers(term: string) { ... }
  async deleteMember(name: string) { ... }
  async getMemberCount(): Promise<number> { ... }
}
```

### Test Data Management

Test data follows a lifecycle:
1. **Setup**: Create test members/cards with "E2E_TEST_" prefix via Supabase client
2. **Execute**: Tests interact with the UI using this data
3. **Teardown**: afterAll hooks delete all "E2E_TEST_" prefixed records

The Supabase helper connects directly to the staging database using the service role key (for cleanup) or anon key (for user-scoped operations).

### Fixture System

Custom Playwright fixtures extend the base test with:
- `adminPage`: Pre-authenticated as super_admin
- `coopAdminPage`: Pre-authenticated as coop-admin
- `fenomatPage`: Pre-authenticated as fenomat admin
- `memberPage`: Pre-authenticated as member
- `testData`: Utility for creating/cleaning test records

```typescript
// fixtures/base.fixture.ts
export const test = base.extend<{
  adminPage: Page
  coopAdminPage: Page
  fenomatPage: Page
  memberPage: Page
  testData: TestDataHelper
}>({ ... })
```

## Technical Decisions

### Selector Strategy

Priority order for element selection:
1. `getByRole()` — buttons, links, headings (most resilient)
2. `getByLabel()` — form inputs
3. `getByText()` — visible text content
4. `getByTestId()` — fallback for complex components (add data-testid where needed)

### Timeouts and Retries

- Test timeout: 60s (accounts for staging latency)
- Navigation timeout: 30s
- Expect timeout: 15s (for assertions with auto-retry)
- Retries: 1 on CI, 0 locally (fail fast during development)

### Parallel Execution

Tests are organized so each spec file can run independently:
- Navigation tests: no auth needed, fully parallel
- Auth tests: use fresh browser contexts, parallel
- Member/Card tests: use separate cooperative contexts, parallel between files
- Marketplace tests: read-only public access, parallel

### Mobile Testing

Mobile viewport tests use Playwright's `devices['iPhone 13']` preset (390x844) for the verification page and navigation tests. The mobile project runs a subset of tests tagged with `@mobile`.

## API Contracts

### Supabase Direct Access (Test Data)

```typescript
// Create test member
supabase.from('members').insert({
  cooperative_id: COOP_ID,
  first_name: 'E2E_TEST_Jean',
  last_name: 'E2E_TEST_Dupont',
  email: 'e2e-test@example.com',
  status: 'active'
})

// Cleanup
supabase.from('members').delete().like('first_name', 'E2E_TEST_%')
supabase.from('member_cards').delete().like('card_number', 'E2E_%')
```

### Environment Variables

```
BASE_URL=http://localhost:3000
SUPABASE_URL=<staging-url>
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_KEY=<service-key-for-cleanup>
E2E_ADMIN_EMAIL=admin@demo.local
E2E_ADMIN_PASSWORD=Demo123!SuperAdmin
E2E_COOP_EMAIL=coop-admin@demo.local
E2E_COOP_PASSWORD=Demo123!CoopAdmin
E2E_FENOMAT_EMAIL=fenomat@demo.local
E2E_FENOMAT_PASSWORD=Demo123!CoopAdmin
E2E_MEMBER_EMAIL=member1@demo.local
E2E_MEMBER_PASSWORD=Demo123!Member1
```

## Correctness Properties

1. **Navigation Completeness**: For all public routes defined in the application, loading the route returns HTTP 200 and renders the expected heading element.

2. **Auth Role Isolation**: For any authenticated user with role R, accessing a route restricted to role R' (where R ≠ R') results in redirect or access denied — never in data exposure.

3. **Cooperative Data Isolation**: For any two cooperative admins A and B managing different cooperatives, the set of members visible to A and the set visible to B have zero intersection.

4. **Card Generation Idempotence**: Generating a card for a member who already has an active card produces the same card_number with an extended expiry — not a duplicate card.

5. **QR Verification Round-Trip**: For any card generated through the UI, the QR payload URL resolves to the verification page which displays the correct member name and cooperative.

6. **Test Data Isolation**: After test suite completion, querying for records with "E2E_TEST_" prefix returns zero results — all test data is cleaned up.
