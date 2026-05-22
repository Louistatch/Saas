import { mergeTests } from '@playwright/test'
import { authTest, type AuthFixtures } from './auth.fixture'
import { testDataTest, type TestDataFixtures } from './test-data.fixture'

/**
 * Combined test fixture that provides:
 * - Pre-authenticated pages for all roles (adminPage, coopAdminPage, fenomatPage, memberPage)
 * - Test data helpers (testData.createMember, testData.createCard, etc.)
 */
export const test = mergeTests(authTest, testDataTest)
export type { AuthFixtures, TestDataFixtures }

// Re-export expect for convenience
export { expect } from '@playwright/test'
