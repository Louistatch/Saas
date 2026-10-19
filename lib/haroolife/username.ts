/**
 * The HarooLife username: the player's character in the game (shown in the street and the chats),
 * unique (changing it frees the old one). Same rule as the database (supabase/migrations/…_haroolife_usernames.sql):
 * 3 to 20 characters, lowercase letters without accents, digits or « _ », starting with a letter.
 */
import { z } from 'zod'

export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/

/** What the player typed, as it will be stored: trimmed, lowercase, without the « @ ». */
export const normalizeUsername = (raw: string) => raw.trim().replace(/^@+/, '').toLowerCase()

/** Why a username cannot be taken, in the game's words (null when it can). */
export function usernameProblem(raw: string): string | null {
  const u = normalizeUsername(raw)
  if (u.length < 3) return 'Au moins 3 caractères.'
  if (u.length > 20) return '20 caractères au plus.'
  if (!/^[a-z]/.test(u)) return 'Commence par une lettre.'
  if (!USERNAME_PATTERN.test(u)) return 'Lettres sans accent, chiffres et « _ » seulement.'
  return null
}

export const REASON_TEXT: Record<string, string> = {
  format: 'Lettres sans accent, chiffres et « _ », de 3 à 20 caractères.',
  reserved: 'Ce nom est réservé à l’équipe.',
  taken: 'Déjà pris par quelqu’un du quartier. Essaie une variante.',
}

export const claimSchema = z.object({
  username: z.string().min(1).max(40),
  quartier: z.string().max(20).default('tokoin'),
  pagne: z.number().int().min(1).max(8).default(1),
  /** « J'ai 18 ans ou plus » (the birth date stays on the phone). */
  adult: z.literal(true),
})
