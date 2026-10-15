/**
 * Intercity coaches between the game's towns, with the real companies that run Lomé – Kara and
 * the real road (RN1 through Tsévié, Notsé, Atakpamé, Blitta and Sokodé).
 *
 * What is real: the companies (Solim / Solim Serou Trans, Nagodé Transfert, CTT Rakieta all serve
 * Lomé – Kara), the towns along the RN1, their order and their approximate distance by road from
 * Lomé. What is the game's: the departure hours and the fares, which are indicative (the press
 * reported Solim's Lomé – Kara ticket at 7 500 FCFA in 2026; prices change with fuel). The money
 * is the game's FCFA, never real money.
 */
import type { LocalityId } from './locality'

export type CompanyId = 'solim' | 'nagode' | 'rakieta'

export interface Company {
  id: CompanyId
  name: string
  /** Fare of the game, indicative. */
  fare: number
  /** Departure hours of the game (0–23), from either end of the line. */
  departures: number[]
  /** Hours on the road between Lomé and Kara. */
  hours: number
  /** One line about the service, for the choice sheet. */
  note: string
}

export const COMPANIES: Company[] = [
  {
    id: 'solim',
    name: 'Solim',
    fare: 7500,
    departures: [6, 9, 13, 20],
    hours: 7,
    note: 'Bus neufs, plusieurs départs par jour',
  },
  {
    id: 'nagode',
    name: 'Nagodé Transfert',
    fare: 7000,
    departures: [7, 14, 21],
    hours: 7,
    note: 'La compagnie née à Sokodé',
  },
  {
    id: 'rakieta',
    name: 'CTT Rakieta',
    fare: 6500,
    departures: [6, 12],
    hours: 8,
    note: 'Par Atakpamé et Sokodé, arrêts plus longs',
  },
]
export const companyById = (id: string) => COMPANIES.find((c) => c.id === id) ?? null

export interface Stop {
  name: string
  lat: number
  lon: number
  /** Approximate distance by road from Lomé (km). */
  km: number
}

/** The RN1 from Lomé to Kara, its main towns (approximate distances by road). */
export const RN1: Stop[] = [
  { name: 'Lomé', lat: 6.137, lon: 1.212, km: 0 },
  { name: 'Tsévié', lat: 6.426, lon: 1.213, km: 35 },
  { name: 'Notsé', lat: 6.95, lon: 1.168, km: 95 },
  { name: 'Atakpamé', lat: 7.527, lon: 1.126, km: 161 },
  { name: 'Blitta', lat: 8.317, lon: 0.983, km: 267 },
  { name: 'Sokodé', lat: 8.983, lon: 1.133, km: 339 },
  { name: 'Kara', lat: 9.551, lon: 1.186, km: 413 },
]

/** The stops of a trip, in travel order; null when there is no coach line between the towns. */
export function routeOf(from: LocalityId, to: LocalityId): Stop[] | null {
  if (from === 'lome' && to === 'kara') return RN1
  if (from === 'kara' && to === 'lome') return [...RN1].reverse()
  return null
}

/** Next departure at or after the game's hour (whole hours), and the wait before it. */
export function nextDeparture(c: Company, hour: number): { at: number; wait: number } {
  const h = ((Math.floor(hour) % 24) + 24) % 24
  let best = { at: c.departures[0], wait: 24 + c.departures[0] - h }
  for (const d of c.departures) {
    const wait = (d - h + 24) % 24
    if (wait < best.wait) best = { at: d, wait }
  }
  return best
}

export interface CoachTrip {
  company: Company
  stops: Stop[]
  km: number
  fare: number
  /** Hours waiting at the station, then on the road. */
  wait: number
  hours: number
  departs: number
}

/** The trip with a company from one town to another, at the game's hour. */
export function coachTrip(
  from: LocalityId,
  to: LocalityId,
  company: Company,
  hour: number,
): CoachTrip | null {
  const stops = routeOf(from, to)
  if (!stops) return null
  const dep = nextDeparture(company, hour)
  return {
    company,
    stops,
    km: Math.abs(stops[stops.length - 1].km - stops[0].km),
    fare: company.fare,
    wait: dep.wait,
    hours: company.hours,
    departs: dep.at,
  }
}

export const hh = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, '0')}h`
