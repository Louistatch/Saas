import { test as base } from '@playwright/test'
import {
  createTestMember,
  createTestCard,
  createExpiredTestCard,
  cleanupTestData,
  getCooperativeForUser,
} from '../helpers/supabase.helper'
import { ACCOUNTS } from '../helpers/constants'

export interface TestDataHelper {
  createMember: (cooperativeId: string, overrides?: {
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
  }) => Promise<any>
  createCard: (memberId: string, cooperativeId: string, overrides?: {
    status?: string
    expiryDate?: string
  }) => Promise<any>
  createExpiredCard: (memberId: string, cooperativeId: string) => Promise<any>
  getCoopId: (email: string) => Promise<string | null>
  cleanup: () => Promise<void>
}

export type TestDataFixtures = {
  testData: TestDataHelper
}

export const testDataTest = base.extend<TestDataFixtures>({
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
