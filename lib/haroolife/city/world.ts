/**
 * HarooLife city layer: the urban world of Lomé around the player's estate.
 *
 * Pure, deterministic generation from a seed. The world is a grid of WORLD_W × WORLD_H
 * cells (one cell = one estate tile). It holds terrain (land, sand, lagoon, ocean),
 * districts, the road network (avenues, streets, bridges, the beach boulevard), lots
 * with buildings, landmarks, and the rectangle reserved for the player's estate, which
 * stays governed by townsmen-engine (22×22, construction rules, saves).
 *
 * District names are real; the layout is a game simplification, not a survey.
 */
import { SIZE } from '../townsmen-engine'
import { type LocalityId, current } from './locality'
import { hash } from './seed'

export const WORLD_W = 120
export const WORLD_H = 80
export const CELL = 1.35
/** Where the player's 22×22 estate sits in the world (north-west corner). */
export const ESTATE = { x0: 49, y0: 22, size: SIZE }
/** The estate's western driveway joins avenue x=48 at local row 12 ((9,12) is an estate road). */
export const DRIVEWAY_Y = ESTATE.y0 + 12

export type Terrain = 'land' | 'sand' | 'lagoon' | 'ocean' | 'hill'
/** District ids are locality-specific strings (Lomé: agoe, adidogome, tokoin, centre, be, baguida). */
export type DistrictId = string
export interface DistrictDef {
  id: DistrictId
  name: string
  note: string
  /** 1 loose residential, 2 dense, 3 downtown. */
  density: 1 | 2 | 3
  /** Grid bounds, inclusive-exclusive. */
  x0: number
  x1: number
  y0: number
  y1: number
}
/** Districts of the active locality. */
export const districts = (): DistrictDef[] => current().districts
/** Water names of the active locality (lagoon = inland water, ocean = open water, sand = shore). */
export const waterNames = () => current().waterNames

export type LotType =
  | 'house'
  | 'apartment'
  | 'shop'
  | 'market'
  | 'school'
  | 'university'
  | 'bank'
  | 'hospital'
  | 'sport'
  | 'stadium'
  | 'worship'
  | 'park'
  | 'lot'
  | 'hotel'
  | 'station'
  | 'port'
  | 'townhall'
  | 'billboard'
  | 'cooperative'
export type Category =
  | 'homes'
  | 'shops'
  | 'education'
  | 'health'
  | 'transport'
  | 'services'
  | 'leisure'
  | 'worship'
  | 'lots'
export const CATEGORY_OF: Record<LotType, Category> = {
  house: 'homes',
  apartment: 'homes',
  shop: 'shops',
  market: 'shops',
  hotel: 'shops',
  school: 'education',
  university: 'education',
  bank: 'services',
  hospital: 'health',
  station: 'transport',
  townhall: 'services',
  cooperative: 'services',
  sport: 'leisure',
  stadium: 'leisure',
  park: 'leisure',
  port: 'transport',
  billboard: 'leisure',
  worship: 'worship',
  lot: 'lots',
}
export const CATEGORY_LABELS: Record<Category, string> = {
  homes: 'Maisons',
  shops: 'Commerces',
  education: 'Éducation',
  health: 'Santé',
  transport: 'Transport',
  services: 'Services',
  leisure: 'Loisirs',
  worship: 'Cultes',
  lots: 'Terrains',
}
export const TYPE_LABELS: Record<LotType, string> = {
  house: 'Maison',
  apartment: 'Immeuble',
  shop: 'Boutique',
  market: 'Marché',
  school: 'École',
  university: 'Université',
  bank: 'Banque',
  hospital: 'Hôpital',
  sport: 'Salle de sport',
  stadium: 'Stade',
  worship: 'Lieu de culte',
  park: 'Jardin',
  lot: 'Terrain disponible',
  hotel: 'Hôtel',
  station: 'Gare routière',
  port: 'Port de pêche',
  townhall: 'Hôtel de ville',
  billboard: 'Panneau',
  cooperative: 'Maison des coopératives',
}
export const TYPE_ICONS: Record<LotType, string> = {
  house: '🏠',
  apartment: '🏢',
  shop: '🛍️',
  market: '🧺',
  school: '🏫',
  university: '🎓',
  bank: '🏦',
  hospital: '🏥',
  sport: '🏋️',
  stadium: '🏟️',
  worship: '🕌',
  park: '🌳',
  lot: '📐',
  hotel: '🏨',
  station: '🚌',
  port: '⚓',
  townhall: '🏛️',
  billboard: '📢',
  cooperative: '🤝',
}

export interface Lot {
  id: string
  type: LotType
  district: DistrictId
  x: number
  y: number
  w: number
  h: number
  /** Floors, for the box height. */
  floors: number
  /** Named landmark, otherwise null. */
  name: string | null
  /** The road cell to stand on to enter (door side). */
  door: { x: number; y: number }
}

export const key = (x: number, y: number) => `${x}:${y}`
export const within = (x: number, y: number) => x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H
/** Inside the player's estate: only the locality that hosts it (Lomé) has one. */
export const inEstate = (x: number, y: number) =>
  current().estate !== null &&
  x >= ESTATE.x0 &&
  y >= ESTATE.y0 &&
  x < ESTATE.x0 + ESTATE.size &&
  y < ESTATE.y0 + ESTATE.size
export const toLocal = (p: { x: number; y: number }) => ({ x: p.x - ESTATE.x0, y: p.y - ESTATE.y0 })
export const toWorld = (p: { x: number; y: number }) => ({ x: p.x + ESTATE.x0, y: p.y + ESTATE.y0 })

export { hash }

export function terrainAt(x: number, y: number): Terrain {
  if (!within(x, y)) return 'ocean'
  return current().terrain(x, y)
}
export const isWater = (x: number, y: number) => {
  const t = terrainAt(x, y)
  return t === 'lagoon' || t === 'ocean'
}

export function districtAt(x: number, y: number): DistrictDef {
  const ds = current().districts
  for (const d of ds) if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d
  return ds[0]
}
export function placeName(x: number, y: number): string {
  const t = terrainAt(x, y)
  const names = current().waterNames
  if (t === 'lagoon') return names.lagoon
  if (t === 'ocean') return names.ocean
  if (t === 'sand') return `${names.sand} · ${districtAt(x, y).name}`
  if (t === 'hill') return `Collines · ${districtAt(x, y).name}`
  return districtAt(x, y).name
}

/** The road network of the active locality (avenues, streets, bridges, shore road). */
export function isCityRoad(x: number, y: number): boolean {
  if (!within(x, y)) return false
  if (inEstate(x, y)) return false
  return current().road(x, y)
}
/** The estate's driveway: world cells west of the estate on the driveway row, up to the avenue. */
export function isDriveway(x: number, y: number): boolean {
  return current().estate !== null && y === DRIVEWAY_Y && x >= ESTATE.x0 - 1 && x < ESTATE.x0
}

export interface Landmark {
  type: LotType
  name: string
  district: DistrictId
  /** Preferred anchor cell (the generator finds the nearest free 3×3). */
  x: number
  y: number
  w?: number
  h?: number
  floors?: number
}
/** Landmark anchors of the active locality. */
export const landmarkAnchors = (): Landmark[] => current().landmarks

/** Every generated lot of a locality (memoised per locality: each world is immutable). */
type WorldIndex = { lots: Lot[]; byCell: Map<string, Lot>; byId: Map<string, Lot> }
const caches = new Map<LocalityId, WorldIndex>()

function freeFootprint(taken: Set<string>, x: number, y: number, w: number, h: number): boolean {
  for (let i = 0; i < w; i++)
    for (let j = 0; j < h; j++) {
      const cx = x + i
      const cy = y + j
      if (
        !within(cx, cy) ||
        terrainAt(cx, cy) !== 'land' ||
        isCityRoad(cx, cy) ||
        isDriveway(cx, cy)
      )
        return false
      if (inEstate(cx, cy) || taken.has(key(cx, cy))) return false
      // Keep one cell away from the estate so its fence reads.
      if (
        current().estate !== null &&
        cx >= ESTATE.x0 - 1 &&
        cy >= ESTATE.y0 - 1 &&
        cx <= ESTATE.x0 + ESTATE.size &&
        cy <= ESTATE.y0 + ESTATE.size
      )
        return false
    }
  return true
}
/** The road cell touching the footprint, preferring south, then west, east, north. */
function doorOf(x: number, y: number, w: number, h: number): { x: number; y: number } | null {
  const road = (cx: number, cy: number) => isCityRoad(cx, cy) || isDriveway(cx, cy)
  for (let i = 0; i < w; i++) if (road(x + i, y + h)) return { x: x + i, y: y + h }
  for (let j = 0; j < h; j++) if (road(x - 1, y + j)) return { x: x - 1, y: y + j }
  for (let j = 0; j < h; j++) if (road(x + w, y + j)) return { x: x + w, y: y + j }
  for (let i = 0; i < w; i++) if (road(x + i, y - 1)) return { x: x + i, y: y - 1 }
  return null
}
function fillerType(d: DistrictDef, x: number, y: number, onAvenue: boolean): LotType {
  const r = hash(x, y, 11)
  if (r < 0.06) return 'park'
  if (r < 0.1 + (d.density === 1 ? 0.06 : 0)) return 'lot'
  if (onAvenue && r < 0.42) return 'shop'
  if (d.density === 3) return r < 0.8 ? 'apartment' : 'shop'
  if (d.density === 2) return r < 0.55 ? 'apartment' : r < 0.9 ? 'house' : 'shop'
  return r < 0.9 ? 'house' : 'shop'
}

export function worldLots(): Lot[] {
  return worldIndex().lots
}
export function worldIndex(): WorldIndex {
  const loc = current()
  const cached = caches.get(loc.id)
  if (cached) return cached
  // Lot ids of the reference world stay as they were (saves point to them); other
  // localities prefix theirs so a save can never confuse two towns.
  const prefix = loc.id === 'lome' ? '' : `${loc.id}:`
  const taken = new Set<string>()
  const lots: Lot[] = []
  const occupy = (lot: Lot) => {
    for (let i = 0; i < lot.w; i++)
      for (let j = 0; j < lot.h; j++) taken.add(key(lot.x + i, lot.y + j))
    lots.push(lot)
  }
  // 1. Landmarks: nearest free footprint to the anchor, spiralling out.
  for (const lm of loc.landmarks) {
    const w = lm.w ?? 2
    const h = lm.h ?? 2
    let placed = false
    for (let r = 0; r <= 10 && !placed; r++) {
      for (let dx = -r; dx <= r && !placed; dx++)
        for (let dy = -r; dy <= r && !placed; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const x = lm.x + dx
          const y = lm.y + dy
          const door = freeFootprint(taken, x, y, w, h) ? doorOf(x, y, w, h) : null
          if (door && districtAt(x, y).id === lm.district) {
            occupy({
              id: `${prefix}lm-${lots.length}`,
              type: lm.type,
              district: lm.district,
              x,
              y,
              w,
              h,
              floors: lm.floors ?? 1,
              name: lm.name,
              door,
            })
            placed = true
          }
        }
    }
  }
  // 2. Filler lots, row-major, sized by district density.
  for (let y = 0; y < WORLD_H; y++)
    for (let x = 0; x < WORLD_W; x++) {
      if (
        taken.has(key(x, y)) ||
        terrainAt(x, y) !== 'land' ||
        isCityRoad(x, y) ||
        isDriveway(x, y) ||
        inEstate(x, y)
      )
        continue
      const d = districtAt(x, y)
      const big = d.density >= 2 && hash(x, y, 3) < (d.density === 3 ? 0.55 : 0.3)
      const w = big ? 2 : 1
      const h = big ? 2 : 1
      if (!freeFootprint(taken, x, y, w, h)) {
        if (!freeFootprint(taken, x, y, 1, 1)) continue
        const door1 = doorOf(x, y, 1, 1)
        if (!door1) continue
        const t1 = fillerType(
          d,
          x,
          y,
          x % 12 === 1 || y % 10 === 1 || (x + 2) % 12 === 0 || (y + 2) % 10 === 0,
        )
        occupy({
          id: `${prefix}l-${x}-${y}`,
          type: t1,
          district: d.id,
          x,
          y,
          w: 1,
          h: 1,
          floors: t1 === 'apartment' ? 2 + Math.floor(hash(x, y, 5) * 3) : 1,
          name: null,
          door: door1,
        })
        continue
      }
      const door = doorOf(x, y, w, h)
      if (!door) continue
      const onAvenue =
        x % 12 === 1 || y % 10 === 1 || (x + w + 1) % 12 === 0 || (y + h + 1) % 10 === 0
      const type = fillerType(d, x, y, onAvenue)
      const floors =
        type === 'apartment'
          ? d.density === 3
            ? 3 + Math.floor(hash(x, y, 5) * 5)
            : 2 + Math.floor(hash(x, y, 5) * 3)
          : type === 'shop'
            ? 1 + Math.floor(hash(x, y, 5) * 2)
            : 1
      occupy({
        id: `${prefix}l-${x}-${y}`,
        type,
        district: d.id,
        x,
        y,
        w,
        h,
        floors,
        name: null,
        door,
      })
    }
  const byCell = new Map<string, Lot>()
  const byId = new Map<string, Lot>()
  for (const lot of lots) {
    byId.set(lot.id, lot)
    for (let i = 0; i < lot.w; i++)
      for (let j = 0; j < lot.h; j++) byCell.set(key(lot.x + i, lot.y + j), lot)
  }
  const index = { lots, byCell, byId }
  caches.set(loc.id, index)
  return index
}
export const lotAt = (x: number, y: number): Lot | null =>
  worldIndex().byCell.get(key(x, y)) ?? null
export const lotById = (id: string): Lot | null => worldIndex().byId.get(id) ?? null
export const landmarks = (): Lot[] => worldLots().filter((l) => l.name)
export const landmarksIn = (district: DistrictId): Lot[] =>
  landmarks().filter((l) => l.district === district)
export const SIZE_HINT = ESTATE.size
