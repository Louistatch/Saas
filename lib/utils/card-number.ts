/**
 * Crypto-secure member card number generation (SEC-02).
 *
 * Replaces Math.random() — which is non-cryptographic and collision-prone at
 * scale — with crypto.randomInt(). Generates PREFIX-NNNNNN and verifies
 * uniqueness against the database before returning, retrying up to MAX_RETRIES.
 *
 * Server-only: relies on node:crypto and a Supabase client with insert rights.
 */
import 'server-only'
import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_RETRIES = 5
const SUFFIX_MIN = 100000 // 6-digit suffix → 900k space per prefix
const SUFFIX_MAX = 999999

/**
 * Derive a 3-letter uppercase prefix from a cooperative/faitiere name.
 * Falls back to 'COP' when the name yields no usable letters.
 */
export function cardPrefix(name: string | null | undefined): string {
  const cleaned = (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
  return (cleaned.slice(0, 3) || 'COP').padEnd(3, 'X')
}

/**
 * Generate a unique card number for a cooperative.
 *
 * @param supabase  client able to SELECT member_cards (admin or RLS-scoped)
 * @param prefix    3-letter prefix (use cardPrefix())
 * @returns         a card number guaranteed unique at generation time
 * @throws          if no unique number could be found after MAX_RETRIES
 */
export async function generateUniqueCardNumber(
  supabase: SupabaseClient,
  prefix: string,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // randomInt is uniformly distributed and cryptographically secure.
    const suffix = randomInt(SUFFIX_MIN, SUFFIX_MAX + 1)
    const candidate = `${prefix}-${suffix}`

    const { data, error } = await supabase
      .from('member_cards')
      .select('id')
      .eq('card_number', candidate)
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(`Card uniqueness check failed: ${error.message}`)
    }
    if (!data) {
      return candidate // free — use it
    }
    // else: collision, retry
  }

  throw new Error(
    `Could not generate a unique card number for prefix "${prefix}" after ${MAX_RETRIES} attempts`,
  )
}
