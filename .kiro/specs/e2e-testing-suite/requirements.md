# Requirements Document

## Introduction

This document defines the requirements for an automated End-to-End (E2E) testing system for FaîtiereHub, a cooperative management platform built with Next.js 16 and Supabase. The testing system uses Playwright to simulate 6 real tester scenarios covering navigation, authentication, member management, card generation, marketplace access, and QR verification. Tests run against the live Supabase staging instance using pre-configured demo accounts.

## Glossary

- **Test_Runner**: The Playwright test execution engine that orchestrates browser automation and assertions
- **Test_Suite**: A collection of related test cases grouped by functional scenario (e.g., authentication, navigation)
- **Page_Object**: A TypeScript class encapsulating page-specific selectors and interaction methods for reusable test logic
- **Auth_Helper**: A utility module that handles login/logout flows for different user roles during test execution
- **Demo_Account**: A pre-configured user account in the staging Supabase instance used for automated testing
- **Staging_Instance**: The live Supabase backend environment against which E2E tests execute
- **Mobile_Viewport**: A browser viewport configured at 375x667 pixels to simulate mobile device rendering
- **Card_Number**: A unique alphanumeric identifier (format: PREFIX-NNNNN) assigned to each member card
- **QR_Payload**: The URL encoded in a member card QR code pointing to the verification page
- **Cooperative_Isolation**: The data access boundary ensuring members of one cooperative cannot access another cooperative's data
- **Faitiere_Role**: A super-admin or faîtière-level cooperative admin with elevated permissions including fiche upload

## Requirements

### Requirement 1: Test Infrastructure Setup

**User Story:** As a developer, I want a fully configured Playwright testing infrastructure, so that I can run E2E tests reliably against the staging environment.

#### Acceptance Criteria

1. THE Test_Runner SHALL provide a `playwright.config.ts` configuration file with baseURL pointing to the local Next.js development server
2. THE Test_Runner SHALL configure projects for Chromium desktop (1280x720), mobile Chrome (375x667), and Firefox desktop (1280x720)
3. THE Test_Runner SHALL store authentication state files in a `.auth/` directory excluded from version control
4. THE Test_Runner SHALL provide environment variable configuration for `BASE_URL`, `SUPABASE_URL`, and test account credentials
5. WHEN a test fails, THE Test_Runner SHALL capture a screenshot and trace file for debugging
6. THE Test_Runner SHALL provide a global setup script that authenticates all Demo_Accounts and stores session state for reuse across tests
7. THE Test_Runner SHALL configure test timeout at 60 seconds and navigation timeout at 30 seconds for staging environment latency

### Requirement 2: Navigation and UX Testing

**User Story:** As a QA tester, I want automated tests verifying all public pages load correctly and navigation works, so that regressions in page rendering are caught early.

#### Acceptance Criteria

1. WHEN the home page is loaded, THE Test_Suite SHALL verify the page returns HTTP 200 and contains the heading "Donnez du pouvoir à votre coopérative agricole"
2. WHEN each public page (/a-propos, /contact, /blog, /marketplace, /produit) is loaded, THE Test_Suite SHALL verify the page returns HTTP 200 and renders without JavaScript errors
3. WHEN the mobile viewport is active, THE Test_Suite SHALL verify the mobile hamburger menu is visible and toggles the navigation links
4. WHEN a navigation link is clicked, THE Test_Suite SHALL verify the browser navigates to the correct URL without 404 errors
5. THE Test_Suite SHALL verify the Logo component is visible on all public pages and links back to the home page
6. WHEN the /auth/login page is loaded, THE Test_Suite SHALL verify the login form renders with email and password fields

### Requirement 3: Authentication Flow Testing

**User Story:** As a QA tester, I want automated tests covering login, logout, and role-based access, so that authentication regressions are detected immediately.

#### Acceptance Criteria

1. WHEN valid credentials for the super_admin Demo_Account (admin@demo.local / Demo123!SuperAdmin) are submitted, THE Test_Suite SHALL verify successful redirect to /admin
2. WHEN valid credentials for the cooperative_admin Demo_Account (coop-admin@demo.local / Demo123!CoopAdmin) are submitted, THE Test_Suite SHALL verify successful redirect to /dashboard
3. WHEN valid credentials for the member Demo_Account (member1@demo.local / Demo123!Member1) are submitted, THE Test_Suite SHALL verify successful redirect to /dashboard
4. WHEN invalid credentials are submitted, THE Test_Suite SHALL verify an error message is displayed and no redirect occurs
5. WHEN a user logs out via /auth/signout, THE Test_Suite SHALL verify the session is cleared and the user is redirected to the login page
6. WHEN an unauthenticated user attempts to access /dashboard, THE Test_Suite SHALL verify the user is redirected to /auth/login
7. WHEN an unauthenticated user attempts to access /admin, THE Test_Suite SHALL verify the user is redirected to /auth/login
8. WHEN a cooperative_admin user attempts to access /admin, THE Test_Suite SHALL verify access is denied or the user is redirected away

### Requirement 4: Member Management Testing

**User Story:** As a QA tester, I want automated tests for member CRUD operations and data isolation, so that member management functionality is verified across cooperatives.

#### Acceptance Criteria

1. WHEN a cooperative_admin navigates to /dashboard/members, THE Test_Suite SHALL verify the members list loads and displays member data in a table
2. WHEN the "Ajouter un membre" button is clicked and valid form data (first_name, last_name) is submitted, THE Test_Suite SHALL verify the new member appears in the members list
3. WHEN the edit button is clicked for an existing member and the name is modified, THE Test_Suite SHALL verify the updated name is reflected in the members list
4. WHEN the delete button is clicked for a member and the confirmation dialog is accepted, THE Test_Suite SHALL verify the member is removed from the list
5. WHEN a search term is entered in the search field, THE Test_Suite SHALL verify the members list is filtered to show only matching results
6. WHEN cooperative_admin "coop-admin@demo.local" is logged in, THE Test_Suite SHALL verify only members belonging to that cooperative are displayed (Cooperative_Isolation)
7. WHEN cooperative_admin "fenomat@demo.local" is logged in, THE Test_Suite SHALL verify a different set of members is displayed than for "coop-admin@demo.local" (Cooperative_Isolation)
8. WHEN the LocationPicker component is used during member creation, THE Test_Suite SHALL verify the region, prefecture, canton, and village dropdowns cascade correctly

### Requirement 5: Card Generation Testing

**User Story:** As a QA tester, I want automated tests for card generation, download, and QR code functionality, so that the card lifecycle is verified end-to-end.

#### Acceptance Criteria

1. WHEN a cooperative_admin navigates to /dashboard/cards, THE Test_Suite SHALL verify the cards page loads with the "Générer une carte" button visible
2. WHEN the "Générer une carte" button is clicked and a member is selected, THE Test_Suite SHALL verify a new card is created with status "active" and a valid Card_Number format (PREFIX-NNNNN)
3. WHEN the download button is clicked for an active card, THE Test_Suite SHALL verify a PNG file download is triggered
4. WHEN a card is generated, THE Test_Suite SHALL verify the QR_Payload contains a valid URL in the format /verify/{card_number}
5. WHEN a member already has an active card and generation is triggered again, THE Test_Suite SHALL verify the card is renewed (expiry extended) rather than creating a duplicate
6. WHEN the "Génération en masse" button is clicked and multiple members are selected, THE Test_Suite SHALL verify cards are generated for all selected members
7. WHEN the revoke button is clicked for an active card, THE Test_Suite SHALL verify the card status changes to "revoked"

### Requirement 6: Comptes d'Exploitation (Marketplace) Testing

**User Story:** As a QA tester, I want automated tests for fiche upload and marketplace access, so that the marketplace workflow is verified for both admins and public users.

#### Acceptance Criteria

1. WHEN a Faitiere_Role user navigates to /dashboard/marketplace, THE Test_Suite SHALL verify the "Nouvelle fiche" button is visible
2. WHEN a cooperative_admin without Faitiere_Role navigates to /dashboard/marketplace, THE Test_Suite SHALL verify the "Nouvelle fiche" button is not visible
3. WHEN the public marketplace page (/marketplace) is loaded without authentication, THE Test_Suite SHALL verify fiches are displayed with title, culture, and price information
4. WHEN the "Accès membre" button is clicked on the public marketplace and a valid Card_Number is entered, THE Test_Suite SHALL verify the member session is established and "Gratuit" labels appear on fiches
5. WHEN an invalid Card_Number is entered in the member access dialog, THE Test_Suite SHALL verify an error message "Carte invalide" is displayed
6. WHEN a member session is active on the public marketplace, THE Test_Suite SHALL verify the "Télécharger" button is available instead of "Acheter"
7. WHEN the search filter is used on the public marketplace, THE Test_Suite SHALL verify the fiches list is filtered by the search term

### Requirement 7: QR Verification and Mobile Testing

**User Story:** As a QA tester, I want automated tests for the QR verification page on mobile viewports, so that the card scanning experience is verified for field use.

#### Acceptance Criteria

1. WHEN the /verify/{card_number} page is loaded with a valid Card_Number, THE Test_Suite SHALL verify the page displays "MEMBRE VÉRIFIÉ" status with the member's name and cooperative
2. WHEN the /verify/{card_number} page is loaded with an invalid card number, THE Test_Suite SHALL verify the page displays "CARTE INVALIDE" status with the error message "Carte non trouvée dans le système"
3. WHEN the /verify/{card_number} page is loaded with an expired card, THE Test_Suite SHALL verify the page displays "CARTE EXPIRÉE" status
4. WHEN the verification page is loaded on a Mobile_Viewport (375x667), THE Test_Suite SHALL verify all content is visible without horizontal scrolling
5. WHEN the verification page loads, THE Test_Suite SHALL verify the loading spinner with "Vérification en cours..." text appears before the result
6. THE Test_Suite SHALL verify the verification page displays locality, phone, cooperative name, and cotisation information for valid cards

### Requirement 8: Test Data Management

**User Story:** As a developer, I want test data to be managed safely without polluting the staging database, so that tests are repeatable and isolated.

#### Acceptance Criteria

1. THE Test_Runner SHALL use a naming convention prefix "E2E_TEST_" for all test-created data (members, cards) to distinguish from real data
2. WHEN a test suite completes, THE Test_Runner SHALL execute a cleanup step that removes all records with the "E2E_TEST_" prefix from the staging database
3. THE Test_Runner SHALL provide fixture utilities that create and teardown test members and cards within individual test scopes
4. IF a test fails before cleanup, THEN THE Test_Runner SHALL still execute the cleanup step via the afterAll hook
5. THE Test_Runner SHALL not modify or delete any Demo_Account data or pre-existing staging data

### Requirement 9: Test Reporting and CI Integration

**User Story:** As a developer, I want test results reported clearly with CI pipeline integration, so that test failures are visible and actionable.

#### Acceptance Criteria

1. THE Test_Runner SHALL generate an HTML report after each test run with pass/fail status per test case
2. THE Test_Runner SHALL output results in JUnit XML format for CI pipeline integration
3. WHEN a test fails, THE Test_Runner SHALL include the screenshot and trace file path in the failure report
4. THE Test_Runner SHALL provide npm scripts: "test:e2e" for full suite execution, "test:e2e:ui" for interactive mode, and "test:e2e:headed" for headed browser execution
5. THE Test_Runner SHALL support parallel test execution across test files with worker count configurable via environment variable
