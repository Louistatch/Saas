/**
 * Entering HarooLife from a FaîtiereHub member card (the QR page /verify/[card_number]).
 *
 * The card's holder, once the card session is open (the PIN given with the card, or the SMS
 * code), enters the game as a visitor under their own name: the arrival opens with their first
 * name and a username drawn from it, and says which village the card comes from. Without the
 * card session the game opens as for anyone (a plain visitor, no name filled in): the card number
 * is printed on the card and read by everyone who scans it, it proves nothing.
 *
 * Pure helpers, shared by the card page, the game entry and app/api/verify/[card_number]/haroolife.
 */
import { normalizedCardNumber } from '@/lib/security/card-number'
import { USERNAME_PATTERN } from './username'

/** The game address parameter that carries the card number. */
export const CARD_ENTRY_PARAM = 'carte'

/** What the server gives the card's holder to fill in the arrival (nothing else leaves). */
export interface CardIdentity {
  first_name: string | null
  village: string | null
}

/** The game, opened for the holder of this card. */
export const cardEntryHref = (cardNumber: string) =>
  `/haroolife?${CARD_ENTRY_PARAM}=${encodeURIComponent(cardNumber)}`

/** The card number asked for in a game address, or null (absent or malformed). */
export function cardFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get(CARD_ENTRY_PARAM)
  return raw ? normalizedCardNumber(raw) : null
}

/** « KODJO  ama » → « Kodjo Ama »: a name as typed on the register, written as said. */
export function displayName(raw: string | null | undefined, max = 40): string | null {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  if (!s) return null
  return s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase())
}

/** Letters without accents, digits and « _ » (the username alphabet). */
const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

/**
 * A username to start from: the first name, with the village when it fits (« kodjo_agou »). Only
 * a suggestion: the arrival still checks that it is free, and the player can change it.
 */
export function suggestedUsername(firstName: string | null, village: string | null): string {
  const first = plain(firstName ?? '').split('_')[0] ?? ''
  if (!/^[a-z]/.test(first)) return ''
  const place = plain(village ?? '').replace(/_/g, '')
  const both = (place ? `${first}_${place}` : first).slice(0, 20).replace(/_+$/, '')
  if (USERNAME_PATTERN.test(both)) return both
  return USERNAME_PATTERN.test(first.slice(0, 20)) ? first.slice(0, 20) : ''
}
