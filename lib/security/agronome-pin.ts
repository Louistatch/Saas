import 'server-only'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { derive, generatePin } from '@/lib/security/card-pin'
import { normalizedCardNumber } from '@/lib/security/card-number'
import { isCardAuthConfigured } from '@/lib/security/card-session'
import { createClient } from '@/lib/supabase/admin'

/**
 * PIN de la carte professionnelle d'un agronome Haroo (cartes AGR-…).
 *
 * Même protection que le PIN des cartes membres (lib/security/card-pin) :
 * hash scrypt poivré par le secret serveur, essai COMPTÉ avant comparaison,
 * fermeture de 15 min tous les 5 échecs (doublée, plafonnée à 24 h), blocage
 * définitif à 30 échecs jusqu'à réémission. Émis par le super-admin, remis
 * avec la carte ; demandé pour ACCEPTER et pour TERMINER une mission.
 */
const BLOCK = 5
const BASE_LOCK_MS = 15 * 60 * 1000
const MAX_LOCK_MS = 24 * 60 * 60 * 1000
const HARD_LOCK_AT = 30

export interface AgronomeCard {
  agronomeId: string
  cardNumber: string
}

/** Carte active d'un agronome validé, ou null. */
export async function activeAgronomeCard(agronomeId: string): Promise<AgronomeCard | null> {
  const supabase = createClient()
  const { data: profile } = await supabase
    .from('haroo_agronome_profiles')
    .select('id, card_number, badge_valide')
    .eq('id', agronomeId)
    .maybeSingle<{ id: string; card_number: string | null; badge_valide: boolean }>()
  if (!profile?.card_number || !profile.badge_valide) return null
  const { data: card } = await supabase
    .from('member_cards')
    .select('card_number, expiry_date')
    .eq('card_number', profile.card_number)
    .eq('card_type', 'AGRONOME')
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle<{ card_number: string; expiry_date: string | null }>()
  if (!card || (card.expiry_date && card.expiry_date < new Date().toISOString().slice(0, 10))) {
    return null
  }
  return { agronomeId: profile.id, cardNumber: card.card_number }
}

export type AgronomePinIssue =
  | { ok: true; pin: string; cardNumber: string }
  | { ok: false; reason: 'not_configured' | 'no_card' | 'failed' }

export async function issueAgronomePin(agronomeId: string, issuedBy: string): Promise<AgronomePinIssue> {
  if (!isCardAuthConfigured()) return { ok: false, reason: 'not_configured' }
  const card = await activeAgronomeCard(agronomeId)
  if (!card) return { ok: false, reason: 'no_card' }
  const pin = generatePin()
  const salt = randomBytes(16).toString('hex')
  const { error } = await createClient()
    .from('haroo_card_pins')
    .upsert({
      card_number: card.cardNumber,
      agronome_id: card.agronomeId,
      pin_hash: await derive(pin, salt),
      salt,
      failed_attempts: 0,
      locked_until: null,
      issued_by: issuedBy,
      issued_at: new Date().toISOString(),
    })
  if (error) return { ok: false, reason: 'failed' }
  return { ok: true, pin, cardNumber: card.cardNumber }
}

export type AgronomePinCheck =
  | { ok: true }
  | {
      ok: false
      reason: 'no_card' | 'no_pin' | 'wrong_pin' | 'locked' | 'invalid' | 'not_configured'
      attemptsLeft?: number
      retryAfterSeconds?: number
    }

interface PinRow {
  agronome_id: string
  pin_hash: string
  salt: string
  failed_attempts: number
  locked_until: string | null
}

/** Vérifie le PIN de la carte de CET agronome. */
export async function checkAgronomePin(agronomeId: string, rawPin: string): Promise<AgronomePinCheck> {
  if (!isCardAuthConfigured()) return { ok: false, reason: 'not_configured' }
  const pin = rawPin.trim()
  if (!/^\d{6}$/.test(pin)) return { ok: false, reason: 'invalid' }
  const card = await activeAgronomeCard(agronomeId)
  if (!card) return { ok: false, reason: 'no_card' }
  const cardNumber = normalizedCardNumber(card.cardNumber) ?? card.cardNumber

  const supabase = createClient()
  let before: PinRow | null = null
  let counted = 0
  for (let tries = 0; tries < 4 && !before; tries++) {
    const { data: row } = await supabase
      .from('haroo_card_pins')
      .select('agronome_id, pin_hash, salt, failed_attempts, locked_until')
      .eq('card_number', cardNumber)
      .maybeSingle<PinRow>()
    if (!row || row.agronome_id !== agronomeId) return { ok: false, reason: 'no_pin' }
    if (row.failed_attempts >= HARD_LOCK_AT) return { ok: false, reason: 'locked' }
    if (row.locked_until && Date.parse(row.locked_until) > Date.now()) {
      return {
        ok: false,
        reason: 'locked',
        retryAfterSeconds: Math.ceil((Date.parse(row.locked_until) - Date.now()) / 1000),
      }
    }
    const next = row.failed_attempts + 1
    const blocks = Math.floor(next / BLOCK)
    const lockMs = next % BLOCK === 0 ? Math.min(BASE_LOCK_MS * 2 ** (blocks - 1), MAX_LOCK_MS) : 0
    const { data } = await supabase
      .from('haroo_card_pins')
      .update({
        failed_attempts: next,
        locked_until: lockMs ? new Date(Date.now() + lockMs).toISOString() : null,
      })
      .eq('card_number', cardNumber)
      .eq('failed_attempts', row.failed_attempts)
      .select('agronome_id')
      .maybeSingle()
    if (data) {
      before = row
      counted = next
    }
  }
  if (!before) return { ok: false, reason: 'locked' }

  const given = Buffer.from(await derive(pin, before.salt), 'hex')
  const stored = Buffer.from(before.pin_hash, 'hex')
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
    const inBlock = counted % BLOCK
    return { ok: false, reason: 'wrong_pin', attemptsLeft: inBlock === 0 ? 0 : BLOCK - inBlock }
  }
  await supabase
    .from('haroo_card_pins')
    .update({ failed_attempts: 0, locked_until: null })
    .eq('card_number', cardNumber)
    .eq('pin_hash', before.pin_hash)
  return { ok: true }
}
