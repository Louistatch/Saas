import { interact } from '../lome-life-engine'
/** Foreground-only meals. Purchases persist; uncommitted portions stay in the bag on reload. */
import { GOODS, type GoodsId, consume, purchase } from './commerce'
import type { CityLife } from './life'

export type MealItem = GoodsId | 'estate'
export interface Meal {
  id: string
  item: MealItem
  place: string
  phase: 'approach' | 'eating'
  elapsed: number
  committed: boolean
  seat: string | null
}
export const MEAL_SECONDS = 6
export const FIRST_BITE = 1.4
export const mealPlace = (s: CityLife) =>
  `${s.locality}:${s.insideLot ?? s.life.inside ?? 'street'}`
export const mealName = (item: MealItem) =>
  item === 'estate' ? 'Repas du domaine' : (GOODS.find((g) => g.id === item)?.name ?? 'Repas')
const note = (s: CityLife, text: string): CityLife => ({
  ...s,
  life: { ...s.life, lastEvent: text, events: [text, ...s.life.events].slice(0, 8) },
})

export function beginMeal(s: CityLife, item: MealItem, id: string, buy = false): CityLife {
  if (s.meal) return s
  if (item === 'soap') return note(s, 'Le savon se trouve dans Mon sac pour se laver.')
  if (item === 'water') return note(s, 'Choisis Boire dans Mon sac pour utiliser ton eau.')
  if (s.employment?.shift) return note(s, 'Termine ton service avant de prendre une pause repas.')
  const bought = buy && item !== 'estate' ? purchase(s, item) : s
  if (buy && bought.life.wallet === s.life.wallet) return bought
  const portions = item === 'estate' ? bought.life.meals : (bought.commerce?.inventory[item] ?? 0)
  if (!portions) return note(bought, 'Tu n’as pas ce repas. Choisis une portion chez la vendeuse.')
  return note(
    {
      ...bought,
      meal: {
        id,
        item,
        place: mealPlace(bought),
        phase: 'approach',
        elapsed: 0,
        committed: false,
        seat: null,
      },
    },
    `${mealName(item)} prêt. Tu vas t’installer ; la portion reste dans ton sac jusqu’à la première bouchée.`,
  )
}
export function readyMeal(s: CityLife, id: string, seat: string | null): CityLife {
  const m = s.meal
  if (!m || m.id !== id || m.phase !== 'approach' || m.place !== mealPlace(s)) return s
  return {
    ...s,
    meal: { ...m, phase: 'eating', seat },
    activity: { prop: seat ?? `meal:${id}`, anim: seat ? 'eat-seated' : 'eat', mealItem: m.item },
  }
}
export function finishMeal(s: CityLife): CityLife {
  const seat = s.meal?.seat
  return { ...s, meal: undefined, activity: seat ? { prop: seat, anim: 'sit' } : null }
}
export function cancelMeal(s: CityLife): CityLife {
  if (!s.meal) return s
  return note(
    finishMeal(s),
    s.meal.committed
      ? 'Pause interrompue. La portion entamée a été consommée.'
      : 'Pause interrompue. La portion est toujours dans ton sac.',
  )
}
export function advanceMeal(s: CityLife, id: string, seconds: number): CityLife {
  const m = s.meal
  if (!m || m.id !== id || m.phase !== 'eating') return s
  if (m.place !== mealPlace(s)) return { ...cancelMeal(s), activity: null }
  const elapsed = m.elapsed + Math.max(0, Math.min(0.25, Number.isFinite(seconds) ? seconds : 0))
  let next = s
  if (!m.committed && elapsed >= FIRST_BITE) {
    if (m.item === 'estate') {
      if (!s.life.meals) return cancelMeal(s)
      next = { ...s, life: interact(s.life, 'eat') }
    } else {
      if (!(s.commerce?.inventory[m.item] ?? 0)) return cancelMeal(s)
      next = consume(s, m.item)
    }
    next = { ...next, activity: s.activity }
  }
  next = { ...next, meal: { ...m, elapsed, committed: m.committed || elapsed >= FIRST_BITE } }
  return elapsed >= MEAL_SECONDS
    ? note(finishMeal(next), `${mealName(m.item)} terminé. Bon appétit, et bonne reprise !`)
    : next
}
