import { test as base } from '@playwright/test'
import {
  createTestMember,
  createTestCard,
  createExpiredTestCard,
  cleanupTestData,
  getCooperativeForUser,
} from '../helpers/supabase.helper'

// Les signatures suivent les aides elles-mêmes : le type de ligne Supabase ne
// peut pas diverger de ce que les aides renvoient réellement.
export interface TestDataHelper {
  createMember: typeof createTestMember
  createCard: typeof createTestCard
  createExpiredCard: typeof createExpiredTestCard
  getCoopId: (email: string) => Promise<string | null>
  cleanup: () => Promise<void>
}

export type TestDataFixtures = {
  testData: TestDataHelper
}

export const testDataTest = base.extend<TestDataFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: signature imposée par Playwright — une fixture sans dépendance se déclare ainsi
  testData: async ({}, use) => {
    const helper: TestDataHelper = {
      createMember: createTestMember,
      createCard: createTestCard,
      createExpiredCard: createExpiredTestCard,
      getCoopId: getCooperativeForUser,
      cleanup: cleanupTestData,
    }

    await use(helper)

    // Always cleanup after test, even if it fails
    try {
      await cleanupTestData()
    } catch (e) {
      console.warn('Test data cleanup warning:', (e as Error).message)
    }
  },
})
