/**
 * Earning a living at the wheel: the zémidjan (moto-taxi) or the taxi of the street. A passer-by
 * hails the driver, climbs on, names a place of the town; the driver takes them there and is paid
 * on arrival, by distance. Game money only (FCFA of the game, never real money).
 *
 * Fares follow the order of magnitude of Lomé's street prices (a short zémidjan ride a few hundred
 * francs, the taxi dearer), scaled to the game's distances; indicative, not a tariff.
 */
import type { CityLife } from './life'
import { type Lot, landmarks } from './world'

export type VehicleKind = 'taxi' | 'moto'

export interface Fare {
  /** The passer-by on board. */
  passenger: string
  /** Where they asked to go: a named place of the town and its door (road cell). */
  to: { lotId: string; name: string; x: number; y: number }
  /** Distance in cells at pick-up, and the price agreed for it. */
  cells: number
  price: number
}

/** Pick-up: the passer-by must be this close to the vehicle (cells), and the vehicle nearly still. */
export const HAIL_RADIUS = 2.6
/** Drop-off: this close to the door, nearly still. */
export const DROP_RADIUS = 2.2
export const STILL = 1.2

/** Minimum fare, per-cell rate and rounding, per vehicle. */
const RATE: Record<VehicleKind, { base: number; perCell: number }> = {
  moto: { base: 200, perCell: 25 },
  taxi: { base: 400, perCell: 40 },
}

export function fareFor(cells: number, kind: VehicleKind): number {
  const r = RATE[kind]
  const raw = r.base + Math.max(0, cells) * r.perCell
  return Math.round(raw / 50) * 50
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

/**
 * A destination the passer-by asks for: a named place neither next door nor across the whole
 * town (8 to 40 cells), chosen with the given random source. Null when the town has none.
 */
export function pickDestination(
  from: { x: number; y: number },
  rand: () => number,
  places: Lot[] = landmarks(),
): Fare['to'] | null {
  const named = places.filter((l) => l.name)
  if (!named.length) return null
  const fair = named.filter((l) => {
    const d = dist(from, l.door)
    return d >= 8 && d <= 40
  })
  const pool = fair.length ? fair : named
  const lot = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]
  return { lotId: lot.id, name: lot.name as string, x: lot.door.x, y: lot.door.y }
}

/** A new fare for a passer-by picked up at `from`. */
export function startFare(
  passenger: string,
  from: { x: number; y: number },
  kind: VehicleKind,
  rand: () => number,
  places?: Lot[],
): Fare | null {
  const to = pickDestination(from, rand, places)
  if (!to) return null
  const cells = Math.round(dist(from, to))
  return { passenger, to, cells, price: fareFor(cells, kind) }
}

/** The vehicle is at the door and nearly still: the passenger can get off. */
export const canDrop = (fare: Fare, at: { x: number; z: number }, speed: number) =>
  Math.abs(speed) < STILL && dist({ x: at.x, y: at.z }, fare.to) <= DROP_RADIUS

/** Distance left to the destination, in cells. */
export const remaining = (fare: Fare, at: { x: number; z: number }) =>
  Math.max(0, Math.round(dist({ x: at.x, y: at.z }, fare.to)))

/**
 * Bearing of the destination seen from `at`, in degrees, in the controller's convention
 * (heading 0 is +Z, angles grow towards +X).
 */
export const bearingTo = (fare: Fare, at: { x: number; z: number }) =>
  (Math.atan2(fare.to.x - at.x, fare.to.y - at.z) * 180) / Math.PI

/** The passenger got off at the door: the driver is paid, the day remembers it. */
export function completeFare(s: CityLife, fare: Fare, kind: VehicleKind): CityLife {
  const msg = `${fare.passenger} est arrivé·e à ${fare.to.name} : +${fare.price} FCFA (${
    kind === 'moto' ? 'zémidjan' : 'taxi'
  }).`
  return {
    ...s,
    life: {
      ...s.life,
      wallet: s.life.wallet + fare.price,
      earned: s.life.earned + fare.price,
      lastEvent: msg,
      events: [msg, ...s.life.events].slice(0, 8),
    },
  }
}
