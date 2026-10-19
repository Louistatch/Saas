/**
 * The 18+ gate of the arrival: the age a birth date gives on a day. The date itself is never
 * stored; only the declaration (« 18 ans ou plus », with the time it was made) reaches the
 * database (supabase/migrations/…_haroolife_username_adult.sql).
 */
export const ADULT_AGE = 18

export interface BirthDate {
  day: number
  /** 1–12. */
  month: number
  year: number
}

/** Age in full years on `today`, or null when the date does not exist or is in the future. */
export function ageOn(b: BirthDate, today: Date): number | null {
  const { day, month, year } = b
  if (![day, month, year].every(Number.isInteger)) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day)
    return null
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  const dd = today.getDate()
  let age = y - year
  if (m < month || (m === month && dd < day)) age--
  return age < 0 ? null : age
}

export const isAdult = (b: BirthDate, today: Date) => (ageOn(b, today) ?? -1) >= ADULT_AGE

export const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]
