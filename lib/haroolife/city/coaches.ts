/**
 * Intercity coaches between the game's six towns, on the real roads (RN1 from Lomé to Dapaong
 * through Tsévié, Notsé, Atakpamé, Blitta, Sokodé, Kara, Kandé and Mango; the Kpalimé road), with
 * real companies and real fares.
 *
 * Fares (FCFA, the game's money but real amounts):
 * - the official ceilings from Lomé set by the arrêté n° 011/2024 of 10 December 2024 (Kpalimé
 *   2 000, Atakpamé 2 700, Sokodé 5 000, Kara 5 850, Dapaong 8 500);
 * - what the companies actually charge, observed in 2025-2026: LK Transport 7 000 to Kara and
 *   10 000 to Dapaong, CTT Rakieta about 6 000 and Solim 7 000 to 7 500 to Kara. Each company's
 *   ratio to the ceiling gives its fare on the other sections.
 * Between two inland towns the ceiling follows the grid's rate, about 14 FCFA per km of road.
 * Prices rise with fuel (super at 817 F/L in September 2026): indicative.
 * Departure hours and road times are the game's, close to the real ones (Lomé – Kara ≈ 7 h).
 */
import type { LocalityId } from './locality'

export type CompanyId = 'solim' | 'nagode' | 'rakieta' | 'lk' | 'minibus'

export interface Company {
  id: CompanyId
  name: string
  /** Lomé – Kara fare (or its line's reference fare), FCFA. */
  fare: number
  /** The company's fare over the official ceiling. */
  ratio: number
  /** Departure hours of the game (0–23), from either end of the line. */
  departures: number[]
  /** Extra hours on the road (longer stops). */
  slower: number
  /** The towns it serves. */
  serves: LocalityId[]
  /** One line about the service, for the choice sheet. */
  note: string
}

const RN1_TOWNS: LocalityId[] = ['lome', 'atakpame', 'sokode', 'kara', 'dapaong']

export const COMPANIES: Company[] = [
  {
    id: 'lk',
    name: 'LK Transport',
    fare: 7000,
    ratio: 7000 / 5850,
    departures: [6, 8, 12, 19],
    slower: 0,
    serves: RN1_TOWNS,
    note: 'Jusqu’à Dapaong, départs matin et soir',
  },
  {
    id: 'solim',
    name: 'Solim',
    fare: 7500,
    ratio: 7500 / 5850,
    departures: [6, 9, 13, 20],
    slower: 0,
    serves: ['lome', 'atakpame', 'sokode', 'kara'],
    note: 'Bus neufs, plusieurs départs par jour',
  },
  {
    id: 'nagode',
    name: 'Nagodé Transfert',
    fare: 7000,
    ratio: 7000 / 5850,
    departures: [7, 14, 21],
    slower: 0,
    serves: ['lome', 'atakpame', 'sokode', 'kara'],
    note: 'La compagnie née à Sokodé',
  },
  {
    id: 'rakieta',
    name: 'CTT Rakieta',
    fare: 6000,
    ratio: 6000 / 5850,
    departures: [6, 12],
    slower: 1,
    serves: ['lome', 'atakpame', 'sokode', 'kara'],
    note: 'Le moins cher, arrêts plus longs',
  },
  {
    id: 'minibus',
    name: 'Minibus de la gare routière',
    fare: 2000,
    ratio: 1,
    departures: [6, 8, 10, 12, 14, 16, 18],
    slower: 0,
    serves: ['lome', 'kpalime', 'atakpame', 'sokode', 'kara', 'dapaong'],
    note: 'Taxi-brousse : part quand il est plein, au tarif officiel',
  },
]
export const companyById = (id: string) => COMPANIES.find((c) => c.id === id) ?? null

/** Official ceiling from Lomé (arrêté n° 011/2024 of 10 December 2024), FCFA. */
export const OFFICIAL_FROM_LOME: Record<LocalityId, number> = {
  lome: 0,
  kpalime: 2000,
  atakpame: 2700,
  sokode: 5000,
  kara: 5850,
  dapaong: 8500,
}
/** Fares observed with a company, used as they are (FCFA). */
const OBSERVED: Partial<Record<string, number>> = {
  'lk:lome>kara': 7000,
  'lk:lome>dapaong': 10000,
}

export interface Stop {
  name: string
  lat: number
  lon: number
  /** Approximate distance by road from Lomé (km). */
  km: number
  /** The game's town at this stop, if any. */
  town?: LocalityId
}

/** The RN1 from Lomé to Kara, its main towns (approximate distances by road). */
export const RN1: Stop[] = [
  { name: 'Lomé', lat: 6.137, lon: 1.212, km: 0, town: 'lome' },
  { name: 'Tsévié', lat: 6.426, lon: 1.213, km: 35 },
  { name: 'Notsé', lat: 6.95, lon: 1.168, km: 95 },
  { name: 'Atakpamé', lat: 7.527, lon: 1.126, km: 161, town: 'atakpame' },
  { name: 'Blitta', lat: 8.317, lon: 0.983, km: 267 },
  { name: 'Sokodé', lat: 8.983, lon: 1.133, km: 339, town: 'sokode' },
  { name: 'Kara', lat: 9.551, lon: 1.186, km: 413, town: 'kara' },
]
/** The RN1 beyond Kara, to Dapaong (approximate distances by road). */
export const RN1_NORTH: Stop[] = [
  { name: 'Kandé', lat: 9.957, lon: 1.044, km: 470 },
  { name: 'Mango', lat: 10.359, lon: 0.471, km: 560 },
  { name: 'Dapaong', lat: 10.862, lon: 0.207, km: 640, town: 'dapaong' },
]
/** The Kpalimé road from Lomé, then on to Atakpamé (approximate distances by road). */
export const KPALIME_ROAD: Stop[] = [
  { name: 'Lomé', lat: 6.137, lon: 1.212, km: 0, town: 'lome' },
  { name: 'Assahoun', lat: 6.457, lon: 0.932, km: 60 },
  { name: 'Kpalimé', lat: 6.9, lon: 0.63, km: 120, town: 'kpalime' },
  { name: 'Adéta', lat: 7.135, lon: 0.733, km: 150 },
  { name: 'Atakpamé', lat: 7.527, lon: 1.126, km: 230, town: 'atakpame' },
]

/** The stops from one town to another, in travel order; null for the same town. */
export function routeOf(from: LocalityId, to: LocalityId): Stop[] | null {
  if (from === to) return null
  const pick = (line: Stop[]) => {
    const a = line.findIndex((s) => s.town === from)
    const b = line.findIndex((s) => s.town === to)
    if (a < 0 || b < 0) return null
    return a < b ? line.slice(a, b + 1) : line.slice(b, a + 1).reverse()
  }
  const kpalime = pick(KPALIME_ROAD)
  if (kpalime && (from === 'kpalime' || to === 'kpalime')) return kpalime
  const north = pick([...RN1, ...RN1_NORTH])
  if (north) return north
  // Kpalimé and a town north of Atakpamé: the Kpalimé road, then the RN1.
  const other = from === 'kpalime' ? to : from
  const atakpame = KPALIME_ROAD[4].km
  const viaRn1 = pick([
    ...KPALIME_ROAD.slice(2),
    ...[...RN1, ...RN1_NORTH].slice(4).map((st) => ({ ...st, km: st.km - 161 + atakpame })),
  ])
  if (viaRn1 && other !== 'lome') return viaRn1
  return null
}

const kmOf = (stops: Stop[]) => {
  // Distances are counted along each road: add the legs.
  let km = 0
  for (let i = 1; i < stops.length; i++) km += Math.abs(stops[i].km - stops[i - 1].km)
  return km
}

/** The official ceiling between two towns (FCFA): from Lomé, or by distance between two others. */
export function officialFare(from: LocalityId, to: LocalityId): number {
  if (from === 'lome' || to === 'lome') return OFFICIAL_FROM_LOME[from === 'lome' ? to : from]
  const stops = routeOf(from, to)
  // The grid charges about 14 FCFA per km (Lomé – Kara 5 850 for 413 km).
  return stops ? Math.max(1000, Math.round((kmOf(stops) * 14.2) / 100) * 100) : 0
}

/** Companies running between two towns. */
export const companiesBetween = (from: LocalityId, to: LocalityId) =>
  from === to ? [] : COMPANIES.filter((c) => c.serves.includes(from) && c.serves.includes(to))

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
  if (!stops || !company.serves.includes(from) || !company.serves.includes(to)) return null
  const dep = nextDeparture(company, hour)
  const km = kmOf(stops)
  const observed =
    OBSERVED[`${company.id}:${from}>${to}`] ?? OBSERVED[`${company.id}:${to}>${from}`]
  return {
    company,
    stops,
    km,
    fare:
      observed ??
      (company.ratio === 1
        ? officialFare(from, to)
        : Math.round((officialFare(from, to) * company.ratio) / 100) * 100),
    wait: dep.wait,
    hours: Math.max(1, Math.round(km / 58)) + company.slower,
    departs: dep.at,
  }
}

export const hh = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, '0')}h`
