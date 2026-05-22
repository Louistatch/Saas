/**
 * Global Teardown — Cleans up all E2E test data after the suite completes.
 */

import { cleanupTestData } from './helpers/supabase.helper'

async function globalTeardown() {
  console.log('\n→ Running global teardown: cleaning E2E test data...')

  try {
    await cleanupTestData()
  } catch (error) {
    console.error('⚠ Global teardown warning:', (error as Error).message)
    // Don't throw — teardown failures shouldn't fail the test run
  }
}

export default globalTeardown
