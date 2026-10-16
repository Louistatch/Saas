import {
  type LifeState,
  TRAVEL_COST,
  type Transport,
  decodeLomeLife,
  initialLomeLife,
} from '../lome-life-engine'
/**
 * Life in the city: the player's world position and routes, visits to city lots and their
 * interiors, and the actions each kind of place offers. Wraps the estate engine state
 * (`LifeState`, local coordinates, construction rules, saves) without changing it.
 */
import type { Building } from '../townsmen-engine'
import { type NpcAnim, animFor, layoutFor } from './interiors'
import { restoreServiceVehicle } from './jobs'
import { LOCALITIES, type LocalityId, current, isLocalityId, setLocality } from './locality'
import {
  ESTATE_GATE,
  type WorldPoint,
  estateRoadsOf,
  findPathWhere,
  nearestWalkable,
  walkable,
} from './navigation'
import {
  type Lot,
  type LotType,
  inEstate,
  lotAt,
  lotById,
  terrainAt,
  toLocal,
  toWorld,
  within,
} from './world'

export type Interior =
  | 'house'
  | 'market'
  | 'bakery'
  | 'hall'
  | 'well'
  | 'park'
  | 'gym'
  | 'chapel'
  | 'clinic'
export type CityAction =
  | 'enter'
  | 'leave'
  | 'train'
  | 'pray'
  | 'care'
  | 'learn'
  | 'rest'
  | 'buy-meal'
  | 'relax'
  | 'bank'
  | 'work-city'
  | 'use-treadmill'
  | 'use-bike'
  | 'use-weights'
  | 'use-yoga'
  | 'use-shower'
  | 'coach'
  | 'toilet'
  | 'coop'
  | 'offers'

export interface CityLife {
  v: 1
  life: LifeState
  /** The town the player is in (the estate and home stay in Lomé). */
  locality: LocalityId
  at: WorldPoint
  route: WorldPoint[]
  /** Lot the player is heading to or standing at the door of. */
  target: string | null
  insideLot: string | null
  skills: number
  visited: string[]
  /** Physical condition 0–100, built up by training. */
  fitness: number
  /** Equipment in use right now (drives the player's animation inside a room). */
  activity: { prop: string; anim: NpcAnim } | null
  /** Continuous position (cell units) and heading of the avatar, when known. */
  pose?: { x: number; z: number; heading: number }
  /** The player's service vehicle, parked in vehicleLocality, or absent. */
  vehicle?: { x: number; z: number; heading: number } | null
  /** Old saves without this field parked their vehicle in Lomé. */
  vehicleLocality?: LocalityId
  /**
   * Driver's job in service: zémidjan (the vehicle is a moto-taxi) or taxi; absent when off.
   * Passers-by hail the driver; fares are paid on arrival (see fares.ts).
   */
  duty?: 'moto' | 'taxi' | null
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const note = (s: CityLife, msg: string): CityLife => ({
  ...s,
  life: { ...s.life, lastEvent: msg, events: [msg, ...s.life.events].slice(0, 8) },
})
const bump = (s: CityLife, d: Partial<LifeState['needs']>): CityLife => {
  const needs = { ...s.life.needs }
  for (const k of Object.keys(d) as (keyof typeof needs)[]) needs[k] = clamp(needs[k] + (d[k] ?? 0))
  return { ...s, life: { ...s.life, needs } }
}
const fit = (s: CityLife, gain: number): CityLife => ({
  ...s,
  fitness: Math.max(0, Math.min(100, s.fitness + gain)),
})
const pay = (s: CityLife, amount: number): CityLife | null =>
  s.life.wallet < amount
    ? null
    : {
        ...s,
        life: {
          ...s.life,
          wallet: s.life.wallet - amount,
          spent: s.life.spent + amount,
          city: { ...s.life.city, coins: s.life.city.coins + amount },
        },
      }

/** A new game starts at the estate gate, on the avenue, with the whole city around. */
export function initialCityLife(): CityLife {
  const life = initialLomeLife()
  return {
    v: 1,
    life,
    locality: 'lome',
    at: { ...ESTATE_GATE },
    route: [],
    target: null,
    insideLot: null,
    skills: 0,
    visited: [],
    fitness: 0,
    activity: null,
  }
}
/** A save from before the city layer: the player stands where the estate save left them. */
export function fromLegacy(life: LifeState): CityLife {
  return {
    v: 1,
    life: { ...life, route: [], target: null },
    locality: 'lome',
    at: toWorld(life.pos),
    route: [],
    target: null,
    insideLot: null,
    skills: 0,
    visited: [],
    fitness: 0,
    activity: null,
  }
}
export function decodeCityLife(value: unknown): CityLife | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<CityLife>
  if (v.v !== 1) return null
  const life = decodeLomeLife(v.life)
  if (!life) return null
  // Saves from before the national world have no locality: they are in Lomé.
  const locality: LocalityId = isLocalityId(v.locality) ? v.locality : 'lome'
  setLocality(locality)
  const roads = estateRoadsOf(life.city.buildings)
  if (!v.at || !Number.isInteger(v.at.x) || !Number.isInteger(v.at.y)) return null
  const at = nearestWalkable(v.at, roads) ?? toWorld(life.pos)
  if (!Number.isInteger(v.skills) || v.skills! < 0 || v.skills! > 100000) return null
  if (
    !Array.isArray(v.visited) ||
    v.visited.length > 50 ||
    !v.visited.every((s) => typeof s === 'string')
  )
    return null
  if (v.target !== null && v.target !== undefined && !lotById(v.target)) return null
  if (v.insideLot !== null && v.insideLot !== undefined && !lotById(v.insideLot)) return null
  return restoreServiceVehicle({
    v: 1,
    life: syncEstate(life, at),
    locality,
    at,
    route: Array.isArray(v.route)
      ? v.route.filter((p) => p && walkable(p.x, p.y, roads)).slice(0, 400)
      : [],
    target: v.target ?? null,
    insideLot: v.insideLot ?? null,
    skills: v.skills!,
    visited: v.visited,
    fitness: Number.isInteger(v.fitness) && v.fitness! >= 0 && v.fitness! <= 100 ? v.fitness! : 0,
    activity: null,
    pose:
      v.pose &&
      Number.isFinite(v.pose.x) &&
      Number.isFinite(v.pose.z) &&
      Number.isFinite(v.pose.heading) &&
      Math.abs(v.pose.x - at.x) <= 1 &&
      Math.abs(v.pose.z - at.y) <= 1
        ? { x: v.pose.x, z: v.pose.z, heading: v.pose.heading }
        : undefined,
    vehicle:
      v.vehicle && Number.isFinite(v.vehicle.x) && Number.isFinite(v.vehicle.z)
        ? {
            x: v.vehicle.x,
            z: v.vehicle.z,
            heading: Number.isFinite(v.vehicle.heading) ? v.vehicle.heading : 0,
          }
        : (v.vehicle ?? undefined),
    duty: v.duty === 'moto' || v.duty === 'taxi' ? v.duty : null,
    vehicleLocality: isLocalityId(v.vehicleLocality) ? v.vehicleLocality : 'lome',
  })
}

/** Keep the estate engine's local position in step with the world position while inside the fence. */
function syncEstate(life: LifeState, at: WorldPoint, keepTarget = false): LifeState {
  if (!inEstate(at.x, at.y)) return life
  const l = toLocal(at)
  const roads = estateRoadsOf(life.city.buildings)
  if (!roads.has(`${l.x}:${l.y}`)) return life
  // Walking a route to a chosen building keeps that choice: the door resolver prefers it.
  return life.pos.x === l.x && life.pos.y === l.y
    ? life
    : { ...life, pos: l, route: [], target: keepTarget ? life.target : null }
}

export const roadsOf = (s: CityLife) => estateRoadsOf(s.life.city.buildings)

/** Walk to a city lot: the route ends on its door cell. */
/** Cells the avatar may cross on a route: roads plus open ground (see `freelyWalkable`). */
const openCell = (s: CityLife) => {
  const roads = roadsOf(s)
  const buildings = s.life.city.buildings
  return (x: number, y: number) => freelyWalkable(x, y, roads, buildings)
}
export function goToLot(s: CityLife, lot: Lot): CityLife {
  if (s.insideLot || s.life.inside) return note(s, 'Sors du bâtiment avant de partir.')
  const path = findPathWhere(s.at, lot.door, openCell(s))
  if (!path) return note(s, 'Aucune route ne mène là-bas pour le moment.')
  return note(
    { ...s, route: path.slice(1), target: lot.id, life: { ...s.life, target: null } },
    path.length <= 1
      ? `Tu es devant : ${lot.name ?? 'ce lieu'}.`
      : `En route vers ${lot.name ?? 'ce lieu'} : ${path.length - 1} cases.`,
  )
}
/** Walk to an estate building (local coordinates), ending on a road next to it. */
export function goToEstate(s: CityLife, bx: number, by: number): CityLife {
  if (s.insideLot || s.life.inside) return note(s, 'Sors du bâtiment avant de partir.')
  const roads = roadsOf(s)
  // The avatar may stand on the lawn (joystick): the path crosses open ground like city routes,
  // and ends preferably on the road side of the building (its door), else beside it.
  const open = openCell(s)
  let best: WorldPoint[] | null = null
  let bestCost = Number.POSITIVE_INFINITY
  for (const [dx, dy] of [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ] as const) {
    const door = toWorld({ x: bx + dx, y: by + dy })
    const path = findPathWhere(s.at, door, open)
    if (!path) continue
    const cost = path.length + (walkable(door.x, door.y, roads) ? 0 : 4)
    if (cost < bestCost) {
      best = path
      bestCost = cost
    }
  }
  if (!best) return note(s, 'Lieu inaccessible : il faut le relier aux routes de la mairie.')
  return note(
    {
      ...s,
      route: best.slice(1),
      target: null,
      life: { ...s.life, target: toLocal(toWorld({ x: bx, y: by })) },
    },
    best.length <= 1 ? 'Tu es arrivé.' : `En route : ${best.length - 1} cases.`,
  )
}
/** Walk to any world cell (tap on the ground): the nearest walkable cell. */
export function goToPoint(s: CityLife, p: WorldPoint): CityLife {
  const lot = lotAt(p.x, p.y)
  if (lot) return goToLot(s, lot)
  const roads = roadsOf(s)
  const dest = nearestWalkable(p, roads, 4)
  if (!dest) return note(s, 'Pas de route par ici.')
  // Parks, empty plots and the estate lawn are open ground: the path may cross them.
  const path = findPathWhere(s.at, dest, openCell(s))
  if (!path) return note(s, 'Aucune route ne mène là-bas pour le moment.')
  const route = path.slice(1)
  return note({ ...s, route, target: null }, `En route : ${route.length} cases.`)
}

/** One cell along the route. Never advances the clock; call during visible play only. */
export function walkStep(s: CityLife): CityLife {
  if (s.insideLot || s.life.inside || s.route.length === 0) return s
  const next = s.route[0]
  if (!openCell(s)(next.x, next.y))
    return note({ ...s, route: [], target: null }, 'Le trajet a été interrompu.')
  const at = next
  const life = syncEstate(
    {
      ...s.life,
      trafficStep: s.life.trafficStep + 1,
      needs: { ...s.life.needs, energy: clamp(s.life.needs.energy - 1) },
    },
    at,
    true,
  )
  const out: CityLife = { ...s, at, life, route: s.route.slice(1) }
  if (out.route.length === 0) {
    const lot = out.target ? lotById(out.target) : null
    return note(
      out,
      lot
        ? `Tu es devant : ${lot.name ?? labelOf(lot.type)}. Appuie sur Entrer.`
        : 'Destination atteinte.',
    )
  }
  return out
}
/** Land at the end of the route at once (after a ride, or when skipping). */
export function arrive(s: CityLife): CityLife {
  if (s.route.length === 0) return s
  const last = s.route[s.route.length - 1]
  const life = syncEstate(
    { ...s.life, trafficStep: s.life.trafficStep + s.route.length },
    last,
    true,
  )
  const out: CityLife = { ...s, at: last, life, route: [] }
  const lot = out.target ? lotById(out.target) : null
  return note(out, lot ? `Arrivé : ${lot.name ?? labelOf(lot.type)}.` : 'Arrivé à destination.')
}
/** Pay a ride for the current route (one fee, fictional money to the city treasury). */
export function payRide(s: CityLife, transport: Transport): CityLife {
  if (s.route.length === 0) return note(s, 'Choisis une destination avant un transport.')
  const cost = TRAVEL_COST[transport]
  if (cost === 0) return s
  const paid = pay(s, cost)
  if (!paid) return note(s, 'Solde insuffisant pour ce déplacement.')
  return note(paid, `${transport === 'moto' ? 'Zémidjan' : 'Taxi'} : −${cost} FCFA.`)
}
/** Manual step (arrow keys, on-screen pad). Facing a lot selects it as the target. */
export function stepDir(s: CityLife, dx: -1 | 0 | 1, dy: -1 | 0 | 1): CityLife {
  if (s.insideLot || s.life.inside) return note(s, 'Sors du bâtiment avant de marcher.')
  if (dx === 0 && dy === 0) return s
  const next = { x: s.at.x + dx, y: s.at.y + dy }
  if (walkable(next.x, next.y, roadsOf(s))) {
    const life = syncEstate(
      {
        ...s.life,
        trafficStep: s.life.trafficStep + 1,
        needs: { ...s.life.needs, energy: clamp(s.life.needs.energy - 1) },
      },
      next,
    )
    return { ...s, at: next, life, route: [], target: null }
  }
  const lot = lotAt(next.x, next.y)
  if (lot)
    return note(
      { ...s, route: [], target: lot.id },
      `Tu es devant : ${lot.name ?? labelOf(lot.type)}. Appuie sur Entrer.`,
    )
  if (inEstate(next.x, next.y)) {
    const l = toLocal(next)
    const b = s.life.city.buildings.find((b) => b.x === l.x && b.y === l.y && b.type !== 'road')
    if (b)
      return note(
        { ...s, route: [], life: { ...s.life, target: l } },
        'Tu es devant un bâtiment du quartier. Appuie sur Entrer.',
      )
  }
  return note(s, 'Pas de route dans cette direction.')
}

export const labelOf = (t: LotType) =>
  (
    ({
      house: 'une maison',
      apartment: 'un immeuble',
      shop: 'une boutique',
      market: 'le marché',
      school: 'l’école',
      university: 'l’université',
      bank: 'la banque',
      hospital: 'l’hôpital',
      sport: 'la salle de sport',
      stadium: 'le stade',
      worship: 'le lieu de culte',
      park: 'le jardin',
      lot: 'un terrain',
      hotel: 'l’hôtel',
      station: 'la gare routière',
      port: 'le port',
      townhall: 'l’hôtel de ville',
      billboard: 'le panneau',
      cooperative: 'la maison des coopératives',
      industry: 'l’entrepôt',
    }) as Record<LotType, string>
  )[t]

export function interiorFor(t: LotType): Interior | null {
  switch (t) {
    case 'house':
    case 'apartment':
    case 'hotel':
      return 'house'
    case 'shop':
    case 'market':
      return 'market'
    case 'bank':
    case 'townhall':
    case 'school':
    case 'university':
    case 'station':
    case 'cooperative':
    case 'industry':
      return 'hall'
    case 'sport':
    case 'stadium':
      return 'gym'
    case 'worship':
      return 'chapel'
    case 'hospital':
      return 'clinic'
    case 'park':
    case 'port':
      return 'park'
    default:
      return null
  }
}
/** Actions a lot offers, in display order. */
export function actionsFor(t: LotType): { id: CityAction; label: string; hint: string }[] {
  switch (t) {
    case 'shop':
      return [{ id: 'buy-meal', label: 'Acheter un repas', hint: '650 FCFA' }]
    case 'market':
      return [
        { id: 'buy-meal', label: 'Acheter un repas', hint: '650 FCFA' },
        {
          id: 'offers',
          label: 'Voir les offres de producteurs',
          hint: 'Préventes réelles (Haroo)',
        },
      ]
    case 'sport':
    case 'stadium':
      return [
        {
          id: 'use-treadmill',
          label: 'Tapis de course',
          hint: 'Forme +6 · Énergie −15 · 500 FCFA',
        },
        { id: 'use-weights', label: 'Musculation', hint: 'Forme +8 · Énergie −20 · 500 FCFA' },
        { id: 'use-bike', label: 'Vélo', hint: 'Forme +4 · Énergie −10 · 500 FCFA' },
        { id: 'use-yoga', label: 'Yoga', hint: 'Loisir +12 · Forme +3' },
        { id: 'coach', label: 'Coach', hint: 'Forme +5 · 1 000 FCFA' },
        { id: 'use-shower', label: 'Douche', hint: 'Hygiène +40' },
        { id: 'train', label: 'S’entraîner', hint: 'Loisir +20 · Énergie −15 · 500 FCFA' },
      ]
    case 'worship':
      return [{ id: 'pray', label: 'Prier avec la communauté', hint: 'Social +20 · Loisir +10' }]
    case 'hospital':
      return [
        { id: 'care', label: 'Consultation', hint: 'Énergie +30 · Hygiène +20 · 1 500 FCFA' },
        { id: 'toilet', label: 'Toilettes', hint: 'Vessie 100' },
      ]
    case 'school':
    case 'university':
      return [{ id: 'learn', label: 'Suivre un cours', hint: 'Compétence +1 · 1 000 FCFA' }]
    case 'hotel':
      return [
        {
          id: 'rest',
          label: 'Prendre une chambre',
          hint: 'Énergie 100 · Hygiène 100 · 3 000 FCFA',
        },
      ]
    case 'bank':
      return [{ id: 'bank', label: 'Voir mon compte', hint: 'Solde et dépenses' }]
    case 'cooperative':
      return [
        {
          id: 'coop',
          label: 'Tableau de bord de la coopérative',
          hint: 'Membres, superficies, regroupements, besoins en ouvriers',
        },
      ]
    case 'park':
    case 'port':
      return [{ id: 'relax', label: 'Se détendre', hint: 'Loisir +25' }]
    case 'townhall':
      return [
        {
          id: 'work-city',
          label: 'Service communal',
          hint: '+1 500 FCFA · Énergie −20 · une fois par jour',
        },
      ]
    case 'station':
      return [
        {
          id: 'work-city',
          label: 'Livrer et trier les colis',
          hint: '+2 000 FCFA · Énergie −20 · une fois par jour',
        },
      ]
    case 'industry':
      return [
        {
          id: 'work-city',
          label: 'Charger les produits agricoles',
          hint: '+2 200 FCFA · Énergie −25 · une fois par jour',
        },
      ]
    default:
      return []
  }
}

/** The lot whose door the player stands on (or next to its footprint). */
export function lotAtDoor(s: CityLife): Lot | null {
  const t = s.target ? lotById(s.target) : null
  const near = (lot: Lot) => {
    if (lot.door.x === s.at.x && lot.door.y === s.at.y) return true
    for (let i = 0; i < lot.w; i++)
      for (let j = 0; j < lot.h; j++)
        if (Math.abs(lot.x + i - s.at.x) + Math.abs(lot.y + j - s.at.y) === 1) return true
    return false
  }
  if (t && near(t)) return t
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const) {
    const lot = lotAt(s.at.x + dx, s.at.y + dy)
    if (lot && interiorFor(lot.type)) return lot
  }
  return null
}

/** Enter a city lot the interaction resolver picked from the continuous avatar position. */
export function enterLot(s: CityLife, lot: Lot, pose?: CityLife['pose']): CityLife {
  if (s.insideLot || s.life.inside) return note(s, 'Sors avant de changer de bâtiment.')
  if (!interiorFor(lot.type)) return note(s, 'Rien à visiter ici.')
  const visited = s.visited.includes(lot.id) ? s.visited : [...s.visited, lot.id].slice(-50)
  return note(
    { ...s, insideLot: lot.id, route: [], target: lot.id, visited, pose: pose ?? s.pose },
    `Tu entres : ${lot.name ?? labelOf(lot.type)}.`,
  )
}
export function cityInteract(s: CityLife, action: CityAction): CityLife {
  if (action === 'leave') {
    if (!s.insideLot) return note(s, 'Tu es déjà dehors.')
    return note({ ...s, insideLot: null, activity: null }, 'Tu es sorti.')
  }
  if (action === 'enter') {
    if (s.insideLot || s.life.inside) return note(s, 'Sors avant de changer de bâtiment.')
    const lot = lotAtDoor(s)
    if (!lot) return note(s, 'Approche-toi de la porte d’un bâtiment.')
    return enterLot(s, lot)
  }
  const lot = s.insideLot ? lotById(s.insideLot) : lotAtDoor(s)
  if (!lot) return note(s, 'Entre d’abord dans un lieu.')
  const allowed = actionsFor(lot.type).some((a) => a.id === action)
  if (!allowed) return note(s, 'Ce lieu ne propose pas cette activité.')
  switch (action) {
    case 'buy-meal': {
      const paid = pay(s, 650)
      if (!paid) return note(s, 'Solde insuffisant.')
      if (paid.life.city.food < 1)
        return note(s, 'Rupture de stock : la ville doit produire des repas.')
      return note(
        {
          ...paid,
          life: {
            ...paid.life,
            meals: paid.life.meals + 1,
            city: { ...paid.life.city, food: paid.life.city.food - 1 },
          },
        },
        'Un repas acheté : −650 FCFA.',
      )
    }
    case 'train': {
      const paid = pay(s, 500)
      if (!paid) return note(s, 'Solde insuffisant.')
      return note(
        bump(paid, { fun: 20, energy: -15, hygiene: -10 }),
        'Bonne séance. Une douche s’impose.',
      )
    }
    case 'pray':
      return note(bump(s, { social: 20, fun: 10 }), 'Un moment avec la communauté.')
    case 'care': {
      const paid = pay(s, 1500)
      if (!paid) return note(s, 'Solde insuffisant pour la consultation.')
      return note(bump(paid, { energy: 30, hygiene: 20 }), 'Consultation faite : −1 500 FCFA.')
    }
    case 'learn': {
      const paid = pay(s, 1000)
      if (!paid) return note(s, 'Solde insuffisant pour le cours.')
      return note(
        { ...paid, skills: paid.skills + 1 },
        `Cours suivi : compétence ${paid.skills + 1}. −1 000 FCFA.`,
      )
    }
    case 'rest': {
      const paid = pay(s, 3000)
      if (!paid) return note(s, 'Solde insuffisant pour la chambre.')
      return note(
        {
          ...paid,
          life: { ...paid.life, needs: { ...paid.life.needs, energy: 100, hygiene: 100 } },
        },
        'Nuit à l’hôtel : −3 000 FCFA.',
      )
    }
    case 'bank':
      return note(
        s,
        `Solde : ${s.life.wallet.toLocaleString('fr-FR')} FCFA · gagné ${s.life.earned.toLocaleString('fr-FR')} · dépensé ${s.life.spent.toLocaleString('fr-FR')}.`,
      )
    case 'relax':
      return note(bump(s, { fun: 25 }), 'Un moment au calme.')
    case 'coop':
      return note(s, 'Les données de la coopérative s’affichent dans la fiche.')
    case 'offers':
      return note(s, 'Les offres réelles s’affichent dans la fiche.')
    case 'use-treadmill':
    case 'use-bike':
    case 'use-weights': {
      const paid = pay(s, 500)
      if (!paid) return note(s, 'Solde insuffisant.')
      if (s.life.needs.energy < 15) return note(s, 'Trop fatigué pour cet exercice.')
      const gain = action === 'use-weights' ? 8 : action === 'use-treadmill' ? 6 : 4
      const cost = action === 'use-weights' ? 20 : action === 'use-treadmill' ? 15 : 10
      return note(
        bump(fit(paid, gain), { fun: 15, energy: -cost, hygiene: -10 }),
        `${action === 'use-weights' ? 'Séance de musculation' : action === 'use-treadmill' ? 'Course sur tapis' : 'Vélo'} : forme ${Math.min(100, s.fitness + gain)}. −500 FCFA.`,
      )
    }
    case 'use-yoga':
      return note(bump(fit(s, 3), { fun: 12, energy: -5 }), 'Séance de yoga : le calme revient.')
    case 'use-shower':
      return note(bump(s, { hygiene: 40 }), 'Douche prise.')
    case 'toilet':
      return note(bump(s, { bladder: 100 }), 'Soulagé.')
    case 'coach': {
      const paid = pay(s, 1000)
      if (!paid) return note(s, 'Solde insuffisant pour le coach.')
      return note(
        bump(fit(paid, 5), { energy: -10 }),
        'Le coach corrige ta posture : forme +5. −1 000 FCFA.',
      )
    }
    case 'work-city': {
      if (s.life.workToday) return note(s, 'Tu as déjà travaillé aujourd’hui.')
      if (s.life.hour < 7 || s.life.hour >= 19)
        return note(s, 'Les petits boulots se trouvent entre 7 h et 19 h.')
      if (s.life.needs.energy < 20) return note(s, 'Repose-toi avant de travailler.')
      const wage = lot.type === 'industry' ? 2200 : lot.type === 'station' ? 2000 : 1500
      if (s.life.city.coins < wage)
        return note(s, 'La caisse municipale ne peut pas payer aujourd’hui.')
      return note(
        bump(
          {
            ...s,
            life: {
              ...s.life,
              wallet: s.life.wallet + wage,
              earned: s.life.earned + wage,
              workToday: true,
              city: { ...s.life.city, coins: s.life.city.coins - wage },
            },
          },
          { energy: -20 },
        ),
        `${lot.type === 'industry' ? 'Chargement terminé' : lot.type === 'station' ? 'Livraisons triées' : 'Service communal terminé'} : +${wage.toLocaleString('fr-FR')} FCFA.`,
      )
    }
    default:
      return s
  }
}

export const GATE = ESTATE_GATE

/** Use a piece of equipment in the current room: applies its action and starts the animation. */
export function useProp(s: CityLife, propId: string): CityLife {
  const lot = s.insideLot ? lotById(s.insideLot) : null
  const room: Interior | null = lot ? interiorFor(lot.type) : null
  if (!room) return note(s, 'Entre d’abord dans un lieu.')
  const prop = layoutFor(room).props.find((p) => p.id === propId)
  if (!prop || !prop.action) return note(s, 'Rien à faire avec cet objet.')
  const next = cityInteract(s, prop.action as CityAction)
  if (next === s || next.life.lastEvent === s.life.lastEvent) return next
  const refused =
    next.life.wallet === s.life.wallet &&
    next.fitness === s.fitness &&
    next.life.needs === s.life.needs
  return refused ? next : { ...next, activity: { prop: prop.id, anim: animFor(prop.kind) } }
}
export const stopActivity = (s: CityLife): CityLife => (s.activity ? { ...s, activity: null } : s)

/** Inter-city travel: cost and duration of the bush taxi, indicative and fictional. */
export const TRIPS: Record<`${LocalityId}>${LocalityId}`, { hours: number; fare: number }> = {
  'lome>lome': { hours: 0, fare: 0 },
  'kara>kara': { hours: 0, fare: 0 },
  'lome>kara': { hours: 7, fare: 4000 },
  'kara>lome': { hours: 7, fare: 4000 },
}
export const tripTo = (s: CityLife, to: LocalityId) => TRIPS[`${s.locality}>${to}`]

/**
 * Arrive in another town: the player steps out at its bus station gate, the estate and
 * the home stay where they are (Lomé). Paying and the hours on the road are the caller's,
 * so the HUD can show the ride first. Switches the active locality synchronously.
 */
export function travelTo(s: CityLife, to: LocalityId): CityLife {
  if (to === s.locality) return s
  const loc = setLocality(to)
  return note(
    {
      ...s,
      locality: to,
      at: { ...loc.gate },
      route: [],
      target: null,
      insideLot: null,
      activity: null,
      pose: undefined,
      life: { ...s.life, inside: null, route: [], target: null },
    },
    `Arrivée à ${loc.name} (${LOCALITIES[to].region}).`,
  )
}
/** The locality a save is in, applied to the generators before anything reads them. */
export const ensureLocality = (s: CityLife) => {
  if (current().id !== s.locality) setLocality(s.locality)
}

/**
 * Where the continuous avatar may stand: the walkable network (city roads, driveway, estate
 * roads), open lots (parks, empty plots) and the free cells of the estate. Buildings, water
 * and hills block.
 */
export function freelyWalkable(
  x: number,
  y: number,
  estateRoads: ReadonlySet<string>,
  buildings: Building[],
): boolean {
  if (walkable(x, y, estateRoads)) return true
  if (!within(x, y) || terrainAt(x, y) !== 'land') return false
  if (inEstate(x, y)) {
    const l = toLocal({ x, y })
    return !buildings.some((b) => b.x === l.x && b.y === l.y && b.type !== 'road')
  }
  const lot = lotAt(x, y)
  return lot !== null && (lot.type === 'park' || lot.type === 'lot')
}

/** The avatar reached another cell on its own (joystick or vehicle): record it, no path check. */
export function moveTo(s: CityLife, cell: WorldPoint, pose?: CityLife['pose']): CityLife {
  if (s.at.x === cell.x && s.at.y === cell.y) return pose ? { ...s, pose } : s
  const life = syncEstate(
    {
      ...s.life,
      trafficStep: s.life.trafficStep + 1,
      needs: { ...s.life.needs, energy: clamp(s.life.needs.energy - 1) },
    },
    cell,
  )
  return { ...s, at: { ...cell }, life, route: [], target: null, pose }
}
