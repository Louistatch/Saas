# Tasks

## Task 1: Setup Playwright Infrastructure

- [ ] 1.1 Install Playwright and dependencies (`@playwright/test`, `@supabase/supabase-js` for test helpers)
- [ ] 1.2 Create `e2e/playwright.config.ts` with Chromium, Firefox, and mobile Chrome projects
- [ ] 1.3 Create `e2e/.env.e2e` with environment variable template for credentials and URLs
- [ ] 1.4 Create `e2e/helpers/constants.ts` with test URLs, credentials, and naming conventions
- [ ] 1.5 Add npm scripts to package.json: `test:e2e`, `test:e2e:ui`, `test:e2e:headed`
- [ ] 1.6 Add `.auth/` and `e2e/.env.e2e` to `.gitignore`
- [ ] 1.7 Create `e2e/global-setup.ts` that authenticates all 4 demo accounts and saves storageState

## Task 2: Create Page Objects and Fixtures

- [ ] 2.1 Create `e2e/pages/login.page.ts` with login form interaction methods
- [ ] 2.2 Create `e2e/pages/dashboard.page.ts` with dashboard navigation helpers
- [ ] 2.3 Create `e2e/pages/members.page.ts` with CRUD operation methods
- [ ] 2.4 Create `e2e/pages/cards.page.ts` with card generation and download methods
- [ ] 2.5 Create `e2e/pages/marketplace.page.ts` with public marketplace interaction methods
- [ ] 2.6 Create `e2e/pages/marketplace-admin.page.ts` with admin fiche management methods
- [ ] 2.7 Create `e2e/pages/verify.page.ts` with verification page assertion methods
- [ ] 2.8 Create `e2e/fixtures/auth.fixture.ts` with pre-authenticated page fixtures
- [ ] 2.9 Create `e2e/fixtures/test-data.fixture.ts` with Supabase test data helpers
- [ ] 2.10 Create `e2e/fixtures/base.fixture.ts` combining all fixtures into single export

## Task 3: Create Supabase Test Helpers

- [ ] 3.1 Create `e2e/helpers/supabase.helper.ts` with admin client for data setup/teardown
- [ ] 3.2 Implement `createTestMember()` function with E2E_TEST_ prefix
- [ ] 3.3 Implement `createTestCard()` function with E2E_ prefix card numbers
- [ ] 3.4 Implement `cleanupTestData()` function that removes all E2E-prefixed records
- [ ] 3.5 Create `e2e/global-teardown.ts` that calls cleanupTestData after all tests

## Task 4: Write Navigation & UX Tests (Scenario 1)

- [ ] 4.1 Create `e2e/tests/01-navigation.spec.ts` with public page load tests
- [ ] 4.2 Add test: home page loads with correct heading and CTA buttons
- [ ] 4.3 Add test: all public pages (/a-propos, /contact, /blog, /marketplace, /produit) return 200
- [ ] 4.4 Add test: mobile menu toggle works on mobile viewport
- [ ] 4.5 Add test: navigation links route to correct pages
- [ ] 4.6 Add test: Logo links back to home page from all public pages

## Task 5: Write Authentication Tests (Scenario 2)

- [ ] 5.1 Create `e2e/tests/02-authentication.spec.ts` with auth flow tests
- [ ] 5.2 Add test: super_admin login redirects to /admin
- [ ] 5.3 Add test: cooperative_admin login redirects to /dashboard
- [ ] 5.4 Add test: member login redirects to /dashboard
- [ ] 5.5 Add test: invalid credentials show error message
- [ ] 5.6 Add test: logout clears session and redirects to login
- [ ] 5.7 Add test: unauthenticated access to /dashboard redirects to /auth/login
- [ ] 5.8 Add test: unauthenticated access to /admin redirects to /auth/login
- [ ] 5.9 Add test: cooperative_admin cannot access /admin routes

## Task 6: Write Member Management Tests (Scenario 3)

- [ ] 6.1 Create `e2e/tests/03-members.spec.ts` with member CRUD tests
- [ ] 6.2 Add test: members page loads with table for cooperative_admin
- [ ] 6.3 Add test: add new member with first_name and last_name
- [ ] 6.4 Add test: edit existing member name
- [ ] 6.5 Add test: delete member with confirmation dialog
- [ ] 6.6 Add test: search filters members list
- [ ] 6.7 Add test: cooperative isolation — coop-admin sees only their members
- [ ] 6.8 Add test: cooperative isolation — fenomat sees different members
- [ ] 6.9 Add test: LocationPicker cascading dropdowns work

## Task 7: Write Card Generation Tests (Scenario 4)

- [ ] 7.1 Create `e2e/tests/04-cards.spec.ts` with card lifecycle tests
- [ ] 7.2 Add test: cards page loads with generate button
- [ ] 7.3 Add test: generate single card for a member
- [ ] 7.4 Add test: card download triggers PNG file
- [ ] 7.5 Add test: QR payload contains valid /verify/ URL
- [ ] 7.6 Add test: card renewal extends expiry without creating duplicate
- [ ] 7.7 Add test: bulk generation creates cards for multiple members
- [ ] 7.8 Add test: revoke card changes status to revoked

## Task 8: Write Marketplace Tests (Scenario 5)

- [ ] 8.1 Create `e2e/tests/05-marketplace.spec.ts` with marketplace tests
- [ ] 8.2 Add test: faitiere admin sees "Nouvelle fiche" button on dashboard marketplace
- [ ] 8.3 Add test: regular cooperative_admin does not see "Nouvelle fiche" button
- [ ] 8.4 Add test: public marketplace loads fiches without authentication
- [ ] 8.5 Add test: member card access grants free download labels
- [ ] 8.6 Add test: invalid card number shows error in access dialog
- [ ] 8.7 Add test: member session shows "Télécharger" instead of "Acheter"
- [ ] 8.8 Add test: search filter works on public marketplace

## Task 9: Write QR Verification & Mobile Tests (Scenario 6)

- [ ] 9.1 Create `e2e/tests/06-verification.spec.ts` with verification page tests
- [ ] 9.2 Add test: valid card number shows "MEMBRE VÉRIFIÉ" with member details
- [ ] 9.3 Add test: invalid card number shows "CARTE INVALIDE" error
- [ ] 9.4 Add test: expired card shows "CARTE EXPIRÉE" status
- [ ] 9.5 Add test: mobile viewport renders without horizontal scroll
- [ ] 9.6 Add test: loading state shows spinner with "Vérification en cours..."
- [ ] 9.7 Add test: verification page displays locality, phone, cooperative, and cotisation data
