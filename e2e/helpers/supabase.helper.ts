/**
 * Supabase Helper for E2E Tests
 * Provides direct database access for test data setup and teardown.
 * Uses the service role key for admin-level operations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { TEST_PREFIX, CARD_PREFIX } from './constants'

let adminClient: SupabaseClient | null = null

export function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    const url = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY

    if (!url || !serviceKey) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment. ' +
        'These are required for E2E test data management.'
      )
    }

    adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return adminClient
}

export function getAnonClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment.')
  }

  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Create a test member with E2E_TEST_ prefix.
 * Returns the created member record.
 */
export async function createTestMember(cooperativeId: string, overrides?: {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
}) {
  const client = getAdminClient()
  const firstName = overrides?.firstName || `${TEST_PREFIX}Jean`
  const lastName = overrides?.lastName || `${TEST_PREFIX}Dupont`

  const { data, error } = await client.from('members').insert({
    cooperative_id: cooperativeId,
    first_name: firstName,
    last_name: lastName,
    email: overrides?.email || `e2e-${Date.now()}@test.local`,
    phone: overrides?.phone || '+228 90 00 00 00',
    status: 'active',
  }).select().single()

  if (error) throw new Error(`Failed to create test member: ${error.message}`)
  return data
}

/**
 * Create a test card with E2E_ prefix card number.
 * Returns the created card record.
 */
export async function createTestCard(memberId: string, cooperativeId: string, overrides?: {
  status?: string
  expiryDate?: string
}) {
  const client = getAdminClient()
  const cardNumber = `${CARD_PREFIX}-${Date.now().toString().slice(-5)}`
  const expiryDate = overrides?.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data, error } = await client.from('member_cards').insert({
    cooperative_id: cooperativeId,
    member_id: memberId,
    card_number: cardNumber,
    status: overrides?.status || 'active',
    expiry_date: expiryDate,
    qr_data: `/verify/${encodeURIComponent(cardNumber)}`,
  }).select().single()

  if (error) throw new Error(`Failed to create test card: ${error.message}`)
  return data
}

/**
 * Create an expired test card for testing expired card verification.
 */
export async function createExpiredTestCard(memberId: string, cooperativeId: string) {
  const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  return createTestCard(memberId, cooperativeId, {
    status: 'active',
    expiryDate: pastDate,
  })
}

/**
 * Clean up all E2E test data from the staging database.
 * Removes records with E2E_TEST_ or E2E_ prefixes.
 */
export async function cleanupTestData() {
  const client = getAdminClient()

  // Delete test cards first (foreign key constraint)
  const { error: cardError } = await client
    .from('member_cards')
    .delete()
    .like('card_number', `${CARD_PREFIX}-%`)

  if (cardError) {
    console.warn(`Warning: Failed to cleanup test cards: ${cardError.message}`)
  }

  // Delete test members
  const { error: memberError } = await client
    .from('members')
    .delete()
    .like('first_name', `${TEST_PREFIX}%`)

  if (memberError) {
    console.warn(`Warning: Failed to cleanup test members: ${memberError.message}`)
  }

  // Also clean up by last_name prefix
  const { error: memberError2 } = await client
    .from('members')
    .delete()
    .like('last_name', `${TEST_PREFIX}%`)

  if (memberError2) {
    console.warn(`Warning: Failed to cleanup test members by last_name: ${memberError2.message}`)
  }

  console.log('✓ E2E test data cleanup complete')
}

/**
 * Get a cooperative ID for a given admin email.
 * Used to determine which cooperative a test account manages.
 */
export async function getCooperativeForUser(email: string): Promise<string | null> {
  const client = getAdminClient()

  // First get the user ID
  const { data: userData } = await client.auth.admin.listUsers()
  const user = userData?.users?.find(u => u.email === email)
  if (!user) return null

  // Then get their cooperative
  const { data: profile } = await client
    .from('profiles')
    .select('cooperative_id')
    .eq('id', user.id)
    .single()

  return profile?.cooperative_id || null
}
