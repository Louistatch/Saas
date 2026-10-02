import 'server-only'
import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'
import { normalizedCardNumber } from '@/lib/security/card-number'
import { authSecret, isCardAuthConfigured, signCardSession } from '@/lib/security/card-session'
import { createClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'

/**
 * PIN de carte — émis par un opérateur, remis avec la carte.
 *
 * Verrouillage progressif : tous les 5 échecs consécutifs la carte se ferme
 * (15 min, puis le double, plafonné à 24 h). À 30 échecs elle est fermée jusqu'à
 * ce qu'un opérateur réémette un PIN. Six chiffres = 10^6 combinaisons ; avec ces
 * bornes, deviner coûte des semaines et un opérateur le voit.
 */

const log = createLogger('auth:card-pin')

const PIN_LENGTH = 6
const BLOCK = 5
const BASE_LOCK_MS = 15 * 60 * 1000
const MAX_LOCK_MS = 24 * 60 * 60 * 1000
const HARD_LOCK_AT = 30

export type PinLoginResult =
  | { ok: true; token: string; expiresAt: Date; memberId: string }
  | {
      ok: false
      reason: 'not_configured' | 'invalid' | 'wrong_pin' | 'locked' | 'no_pin'
      attemptsLeft?: number
      retryAfterSeconds?: number
    }

export type IssueResult =
  | { ok: true; pin: string; memberId: string }
  | { ok: false; reason: 'not_configured' | 'invalid_card' | 'failed' }

function derive(pin: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Le secret serveur sert de poivre : une fuite de la seule table ne permet
    // pas de tester les 10^6 PIN hors ligne.
    scrypt(pin, `${salt}:${authSecret() ?? ''}`, 32, (err, key) =>
      err ? reject(err) : resolve(key.toString('hex')),
    )
  })
}

/** Refuse les PIN triviaux qu'un humain choisirait (000000, 123456…). */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true
  return '0123456789'.includes(pin) || '9876543210'.includes(pin)
}

export function generatePin(): string {
  for (;;) {
    const pin = randomInt(0, 10 ** PIN_LENGTH).toString().padStart(PIN_LENGTH, '0')
    if (!isWeakPin(pin)) return pin
  }
}

async function eligibleCard(cardNumber: string) {
  const supabase = createClient()
  const { data: card } = await supabase
    .from('member_cards')
    .select('member_id, cooperative_id, expiry_date, card_type')
    .eq('card_number', cardNumber)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle<{
      member_id: string | null
      cooperative_id: string | null
      expiry_date: string | null
      card_type: string
    }>()
  if (!card?.member_id || card.card_type !== 'FAITIERE') return null
  if (card.expiry_date && card.expiry_date < new Date().toISOString().slice(0, 10)) return null
  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('id', card.member_id)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (!member) return null
  return { memberId: card.member_id, cooperativeId: card.cooperative_id }
}

/** Pour la route opérateur : à quelle coopérative appartient cette carte ? */
export async function cardCooperative(rawCardNumber: string) {
  const cardNumber = normalizedCardNumber(rawCardNumber)
  if (!cardNumber) return null
  const card = await eligibleCard(cardNumber)
  return card ? { cardNumber, ...card } : null
}

/**
 * Émet (ou réémet) le PIN d'une carte. Le PIN en clair n'est renvoyé QU'ICI :
 * il n'existe nulle part ailleurs, l'opérateur doit le remettre au titulaire.
 * Réémettre annule l'ancien et remet les compteurs à zéro.
 */
export async function issueCardPin(rawCardNumber: string, issuedBy: string): Promise<IssueResult> {
  if (!isCardAuthConfigured()) return { ok: false, reason: 'not_configured' }
  const cardNumber = normalizedCardNumber(rawCardNumber)
  if (!cardNumber) return { ok: false, reason: 'invalid_card' }
  const card = await eligibleCard(cardNumber)
  if (!card) return { ok: false, reason: 'invalid_card' }

  const pin = generatePin()
  const salt = randomBytes(16).toString('hex')
  const { error } = await createClient()
    .from('card_pins')
    .upsert({
      card_number: cardNumber,
      member_id: card.memberId,
      pin_hash: await derive(pin, salt),
      salt,
      failed_attempts: 0,
      locked_until: null,
      issued_by: issuedBy,
      issued_at: new Date().toISOString(),
    })
  if (error) {
    log.error('PIN upsert failed', { code: error.code })
    return { ok: false, reason: 'failed' }
  }
  log.info('PIN issued', { card: cardNumber, by: issuedBy })
  return { ok: true, pin, memberId: card.memberId }
}

interface PinRow {
  member_id: string
  pin_hash: string
  salt: string
  failed_attempts: number
  locked_until: string | null
}

export async function loginWithCardPin(rawCardNumber: string, rawPin: string): Promise<PinLoginResult> {
  if (!isCardAuthConfigured()) return { ok: false, reason: 'not_configured' }
  const cardNumber = normalizedCardNumber(rawCardNumber)
  const pin = rawPin.trim()
  if (!cardNumber || !new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    return { ok: false, reason: 'invalid' }
  }

  const supabase = createClient()
  let counted: PinRow | null = null
  let before: PinRow | null = null

  // On COMPTE l'essai avant de comparer (même principe que les codes SMS) :
  // deux requêtes simultanées ne testent pas deux PIN en n'en payant qu'un.
  for (let tries = 0; tries < 4 && !counted; tries++) {
    const { data: row } = await supabase
      .from('card_pins')
      .select('member_id, pin_hash, salt, failed_attempts, locked_until')
      .eq('card_number', cardNumber)
      .maybeSingle<PinRow>()
    if (!row) return { ok: false, reason: 'no_pin' }
    if (row.failed_attempts >= HARD_LOCK_AT) return { ok: false, reason: 'locked' }
    if (row.locked_until && Date.parse(row.locked_until) > Date.now()) {
      return {
        ok: false,
        reason: 'locked',
        retryAfterSeconds: Math.ceil((Date.parse(row.locked_until) - Date.now()) / 1000),
      }
    }
    const next = row.failed_attempts + 1
    // Dès le 5e échec d'un bloc, on ferme la carte avant même de répondre.
    const blocks = Math.floor(next / BLOCK)
    const lockMs =
      next % BLOCK === 0 ? Math.min(BASE_LOCK_MS * 2 ** (blocks - 1), MAX_LOCK_MS) : 0
    const { data } = await supabase
      .from('card_pins')
      .update({
        failed_attempts: next,
        locked_until: lockMs ? new Date(Date.now() + lockMs).toISOString() : null,
      })
      .eq('card_number', cardNumber)
      .eq('failed_attempts', row.failed_attempts)
      .select('member_id')
      .maybeSingle<{ member_id: string }>()
    if (data) {
      counted = { ...row, failed_attempts: next }
      before = row
    }
  }
  if (!counted || !before) return { ok: false, reason: 'locked' }

  const given = Buffer.from(await derive(pin, before.salt), 'hex')
  const stored = Buffer.from(before.pin_hash, 'hex')
  const good = given.length === stored.length && timingSafeEqual(given, stored)

  if (!good) {
    const inBlock = counted.failed_attempts % BLOCK
    return {
      ok: false,
      reason: 'wrong_pin',
      attemptsLeft: inBlock === 0 ? 0 : BLOCK - inBlock,
    }
  }

  // Succès : remise à zéro, mais seulement si personne n'a réémis le PIN entre-temps.
  await supabase
    .from('card_pins')
    .update({ failed_attempts: 0, locked_until: null })
    .eq('card_number', cardNumber)
    .eq('pin_hash', before.pin_hash)

  // La carte a pu être révoquée ou réattribuée depuis l'émission.
  const card = await eligibleCard(cardNumber)
  if (!card || card.memberId !== before.member_id) return { ok: false, reason: 'invalid' }

  const { token, expiresAt } = signCardSession({ cardNumber, memberId: card.memberId })
  return { ok: true, token, expiresAt, memberId: card.memberId }
}
