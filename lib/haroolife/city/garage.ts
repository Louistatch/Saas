/**
 * The player's own moto or car, bought in « Aménager » and driven freely with the joystick: no
 * job, no fare (the zémidjan and taxi of the jobs stay apart, see jobs.ts). Pure: no React, no
 * network. Prices are indicative orders of magnitude of Lomé (2025-2026 listings: a new 110 cc
 * moto about 650 000 FCFA, a 2005 sedan about 2.7 million, a 2020 one about 8 million), not
 * quotes. Resold, a vehicle fetches 60 % of its price.
 */
import type { CityLife } from './life'

export type OwnKind = 'moto' | 'car'

export interface OwnVehicle {
  id: string
  name: string
  kind: OwnKind
  /** FCFA. */
  price: number
  hint: string
}

export const OWN_VEHICLES: readonly OwnVehicle[] = [
  {
    id: 'moto-occasion',
    name: 'Moto d’occasion 110 cm³',
    kind: 'moto',
    price: 350_000,
    hint: 'Révisée par le mécanicien du coin',
  },
  {
    id: 'moto-neuve',
    name: 'Moto neuve 110 cm³, immatriculée',
    kind: 'moto',
    price: 650_000,
    hint: 'La même que les zémidjans du quartier',
  },
  {
    id: 'voiture-occasion',
    name: 'Berline d’occasion (2005, « venue de France »)',
    kind: 'car',
    price: 2_800_000,
    hint: 'Climatisation en option',
  },
  {
    id: 'voiture-recente',
    name: 'Berline récente (2020)',
    kind: 'car',
    price: 8_000_000,
    hint: 'Le quartier va en parler',
  },
]

export const VEHICLE_RESALE = 0.6

export interface Garage {
  /** Vehicles bought (one of each at most). */
  owned: string[]
  /** The vehicle taken out and parked in the street, or none. */
  out: string | null
}

export const ownVehicle = (id: string) => OWN_VEHICLES.find((v) => v.id === id)
export const garageOf = (s: CityLife): Garage => s.garage ?? { owned: [], out: null }
/** The personal vehicle in the street right now (none while a job vehicle is out). */
export const vehicleOut = (s: CityLife): OwnVehicle | undefined =>
  s.duty ? undefined : ownVehicle(garageOf(s).out ?? '')

const money = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`
const tell = (s: CityLife, msg: string): CityLife => ({
  ...s,
  life: { ...s.life, lastEvent: msg, events: [msg, ...s.life.events].slice(0, 8) },
})

export function buyOwnVehicle(s: CityLife, id: string): CityLife {
  const v = ownVehicle(id)
  if (!v) return tell(s, 'Ce véhicule n’est plus en vente.')
  const g = garageOf(s)
  if (g.owned.includes(id)) return tell(s, `Tu as déjà ${v.name.toLowerCase()}.`)
  if (s.life.wallet < v.price)
    return tell(s, `Solde insuffisant : ${money(v.price)} pour ${v.name.toLowerCase()}.`)
  return tell(
    {
      ...s,
      garage: { ...g, owned: [...g.owned, id] },
      life: { ...s.life, wallet: s.life.wallet - v.price, spent: s.life.spent + v.price },
    },
    `${v.name} achetée : −${money(v.price)}. Carte grise à ton nom ! Sors-la depuis Aménager, onglet Véhicules.`,
  )
}

/** Resold second-hand; a vehicle out in the street is put away first by the caller. */
export function resellOwnVehicle(s: CityLife, id: string): CityLife {
  const v = ownVehicle(id)
  const g = garageOf(s)
  if (!v || !g.owned.includes(id)) return s
  const value = Math.round((v.price * VEHICLE_RESALE) / 5000) * 5000
  return tell(
    {
      ...s,
      garage: { owned: g.owned.filter((x) => x !== id), out: g.out === id ? null : g.out },
      ...(g.out === id && !s.duty ? { vehicle: null } : {}),
      life: { ...s.life, wallet: s.life.wallet + value, earned: s.life.earned + value },
    },
    `${v.name} revendue d’occasion : +${money(value)}.`,
  )
}

export function decodeGarage(value: unknown): Garage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Partial<Garage>
  const owned = Array.isArray(v.owned)
    ? [...new Set(v.owned.filter((id): id is string => typeof id === 'string' && !!ownVehicle(id)))]
    : []
  return { owned, out: typeof v.out === 'string' && owned.includes(v.out) ? v.out : null }
}
