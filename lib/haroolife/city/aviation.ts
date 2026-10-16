import { advanceLifeHour } from '../lome-life-engine'
import { AIR_ROUTES } from '../togo-social-life'
import type { CityLife } from './life'
import { travelTo } from './life'
import type { LocalityId } from './locality'
import { lotById } from './world'

export function airTrip(from: LocalityId, to: LocalityId) {
  return AIR_ROUTES[`${from}>${to}` as keyof typeof AIR_ROUTES] ?? null
}
export function atAirport(s: CityLife): boolean {
  const lot = s.insideLot ? lotById(s.insideLot) : null
  return !!lot && /aéroport/i.test(lot.name ?? '')
}
/** Charter of the simulation, not a scheduled or bookable commercial flight. */
export function takeFlight(s: CityLife, to: LocalityId): CityLife {
  const trip = airTrip(s.locality, to)
  const fail = (msg: string): CityLife => ({ ...s, life: { ...s.life, lastEvent: msg } })
  if (!trip || !atAirport(s)) return fail('Rejoins le terminal de l’aéroport pour embarquer.')
  if (s.duty || s.employment?.shift) return fail('Termine ton service avant d’embarquer.')
  if (s.life.wallet < trip.fare)
    return fail(`Solde insuffisant : le vol du jeu coûte ${trip.fare} FCFA.`)
  let life = { ...s.life, wallet: s.life.wallet - trip.fare, spent: s.life.spent + trip.fare }
  for (let h = 0; h < trip.hours; h++) life = advanceLifeHour(life)
  return travelTo({ ...s, life }, to)
}
