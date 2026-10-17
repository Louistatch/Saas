/**
 * An advance from the neighbourhood tontine (the « bébé tontine » of the birth lottery): the
 * money comes at once, and every game week the president comes for her share. What the wallet
 * cannot cover stays owed, and she says so. Game money only.
 */
import type { CityLife } from './life'

export interface Tontine {
  /** Still owed, in FCFA. */
  left: number
  /** Asked each week. */
  weekly: number
  /** Last week settled (0 = the week of arrival). */
  week: number
}

const WEEK_DAYS = 7
export const weekOf = (day: number) => Math.floor((Math.max(1, day) - 1) / WEEK_DAYS)

export function decodeTontine(v: unknown): Tontine | undefined {
  if (!v || typeof v !== 'object') return undefined
  const t = v as Partial<Tontine>
  const ok = (n: unknown, max: number): n is number =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= max
  if (!ok(t.left, 1_000_000) || !ok(t.weekly, 100_000) || !ok(t.week, 100_000)) return undefined
  return t.left > 0 ? { left: t.left, weekly: t.weekly, week: t.week } : undefined
}

const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`

/** Each new week: the share is paid from the wallet, or what is missing stays owed. */
export function settleTontine(s: CityLife): CityLife {
  const t = s.tontine
  if (!t) return s
  const week = weekOf(s.life.day)
  if (week <= t.week) return s
  let left = t.left
  let wallet = s.life.wallet
  let spent = s.life.spent
  let short = 0
  for (let w = t.week + 1; w <= week && left > 0; w++) {
    const due = Math.min(t.weekly, left)
    const paid = Math.min(due, wallet)
    wallet -= paid
    spent += paid
    left -= paid
    short += due - paid
  }
  const msg =
    left === 0
      ? 'Tontine remboursée jusqu’au dernier franc. La présidente te salue enfin au marché.'
      : short > 0
        ? `La présidente de la tontine est passée : il manque ${fcfa(short)}. Elle reviendra.`
        : `Tontine : ${fcfa(t.weekly)} remboursés cette semaine. Reste ${fcfa(left)}.`
  return {
    ...s,
    tontine: left > 0 ? { ...t, left, week } : undefined,
    life: {
      ...s.life,
      wallet,
      spent,
      lastEvent: msg,
      events: [msg, ...s.life.events].slice(0, 8),
    },
  }
}
