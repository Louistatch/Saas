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

export const WORLD_W = 120
export const WORLD_H = 80
export const CELL = 1.35
/** Where the player's 22×22 estate sits in the world (north-west corner). */
export const ESTATE = { x0: 49, y0: 22, size: SIZE }
/** The estate's western driveway joins avenue x=48 at local row 12 ((9,12) is an estate road). */
export const DRIVEWAY_Y = ESTATE.y0 + 12

export type Terrain = 'land' | 'sand' | 'lagoon' | 'ocean'
export type DistrictId = 'agoe' | 'adidogome' | 'tokoin' | 'centre' | 'be' | 'baguida'
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
export const DISTRICTS: DistrictDef[] = [
  {
    id: 'agoe',
    name: 'Agoè',
    note: 'Le nord qui grandit : gare routière, stade et lotissements.',
    density: 1,
    x0: 0,
    x1: 120,
    y0: 0,
    y1: 14,
  },
  {
    id: 'adidogome',
    name: 'Adidogomé',
    note: 'Résidentiel à l’ouest, écoles et petits commerces.',
    density: 1,
    x0: 0,
    x1: 36,
    y0: 14,
    y1: 68,
  },
  {
    id: 'tokoin',
    name: 'Tokoin',
    note: 'Université, CHU et les quartiers de la classe moyenne.',
    density: 2,
    x0: 36,
    x1: 70,
    y0: 14,
    y1: 40,
  },
  {
    id: 'centre',
    name: 'Centre-ville · Dékon',
    note: 'Le grand marché d’Assigamé, les banques et l’hôtel de ville.',
    density: 3,
    x0: 36,
    x1: 70,
    y0: 40,
    y1: 68,
  },
  {
    id: 'be',
    name: 'Bè',
    note: 'Le vieux Lomé entre lagune et océan, port de pêche et cultes.',
    density: 2,
    x0: 70,
    x1: 100,
    y0: 14,
    y1: 68,
  },
  {
    id: 'baguida',
    name: 'Baguida',
    note: 'La côte vers l’est : cocotiers, plage et hôtels.',
    density: 1,
    x0: 100,
    x1: 120,
    y0: 14,
    y1: 68,
  },
]
export const WATER_NAMES = { lagoon: 'Lagune de Bè', ocean: 'Océan Atlantique', sand: 'Plage' }

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
export const inEstate = (x: number, y: number) =>
  x >= ESTATE.x0 && y >= ESTATE.y0 && x < ESTATE.x0 + ESTATE.size && y < ESTATE.y0 + ESTATE.size
export const toLocal = (p: { x: number; y: number }) => ({ x: p.x - ESTATE.x0, y: p.y - ESTATE.y0 })
export const toWorld = (p: { x: number; y: number }) => ({ x: p.x + ESTATE.x0, y: p.y + ESTATE.y0 })

/** Deterministic 32-bit hash → [0, 1). */
export function hash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export function terrainAt(x: number, y: number): Terrain {
  if (!within(x, y)) return 'ocean'
  if (y >= 72) return 'ocean'
  if (y >= 68) return 'sand'
  // Lagoon: a band north of Bè and Baguida with a wavy bank, plus an arm towards Tokoin.
  if (x >= 66) {
    const bank = 16 + Math.round(Math.sin(x / 5) * 1.5)
    const south = 26 + Math.round(Math.cos(x / 7) * 1.5)
    if (y >= bank && y <= south) return 'lagoon'
  }
  if (x >= 60 && x < 66 && y >= 19 && y <= 23) return 'lagoon'
  return 'land'
}
export const isWater = (x: number, y: number) => {
  const t = terrainAt(x, y)
  return t === 'lagoon' || t === 'ocean'
}

export function districtAt(x: number, y: number): DistrictDef {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d
  return DISTRICTS[0]
}
export function placeName(x: number, y: number): string {
  const t = terrainAt(x, y)
  if (t === 'lagoon') return WATER_NAMES.lagoon
  if (t === 'ocean') return WATER_NAMES.ocean
  if (t === 'sand') return `${WATER_NAMES.sand} · ${districtAt(x, y).name}`
  return districtAt(x, y).name
}

const BRIDGES = new Set([84, 108])
/** Avenues every 12 columns and 10 rows, the beach boulevard, two bridges over the lagoon,
 * and district streets that split the blocks. Water is never road except on a bridge. */
export function isCityRoad(x: number, y: number): boolean {
  if (!within(x, y)) return false
  if (inEstate(x, y)) return false
  const t = terrainAt(x, y)
  if (t === 'ocean') return false
  if (t === 'sand') return y === 68 // beach boulevard
  if (t === 'lagoon') return BRIDGES.has(x) // bridges only
  if (x % 12 === 0 || y % 10 === 0) return true
  if (y === 68) return true
  const d = districtAt(x, y)
  // Streets inside blocks: downtown gets both, dense gets one, loose gets a few.
  if (d.density === 3 && (x % 12 === 6 || y % 10 === 5)) return true
  if (d.density === 2 && x % 12 === 6) return true
  if (d.density === 1 && y % 10 === 5 && hash(Math.floor(x / 12), Math.floor(y / 10), 7) > 0.3)
    return true
  return false
}
/** The estate's driveway: world cells west of the estate on the driveway row, up to the avenue. */
export function isDriveway(x: number, y: number): boolean {
  return y === DRIVEWAY_Y && x >= ESTATE.x0 - 1 && x < ESTATE.x0
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
export const LANDMARKS: Landmark[] = [
  // Houses of cooperatives: the buildings real organisations are mapped onto (one per district).
  {
    type: 'cooperative',
    name: 'Maison des coopératives de Tokoin',
    district: 'tokoin',
    x: 43,
    y: 27,
    w: 3,
    h: 2,
    floors: 2,
  },
  {
    type: 'cooperative',
    name: 'Maison des coopératives d’Adidogomé',
    district: 'adidogome',
    x: 20,
    y: 40,
    w: 3,
    h: 2,
    floors: 2,
  },
  {
    type: 'cooperative',
    name: 'Maison des coopératives d’Agoè',
    district: 'agoe',
    x: 50,
    y: 8,
    w: 3,
    h: 2,
    floors: 2,
  },
  {
    type: 'cooperative',
    name: 'Maison des coopératives du Centre',
    district: 'centre',
    x: 46,
    y: 46,
    w: 3,
    h: 2,
    floors: 3,
  },
  {
    type: 'cooperative',
    name: 'Maison des coopératives de Bè',
    district: 'be',
    x: 84,
    y: 36,
    w: 3,
    h: 2,
    floors: 2,
  },
  {
    type: 'cooperative',
    name: 'Maison des coopératives de Baguida',
    district: 'baguida',
    x: 106,
    y: 46,
    w: 3,
    h: 2,
    floors: 2,
  },
  { type: 'market', name: 'Grand marché d’Assigamé', district: 'centre', x: 50, y: 52, w: 4, h: 3 },
  { type: 'townhall', name: 'Hôtel de ville de Lomé', district: 'centre', x: 62, y: 44, floors: 3 },
  { type: 'bank', name: 'Banque de Dékon', district: 'centre', x: 40, y: 44, floors: 5 },
  {
    type: 'university',
    name: 'Université de Lomé',
    district: 'tokoin',
    x: 40,
    y: 32,
    w: 4,
    h: 3,
    floors: 2,
  },
  {
    type: 'hospital',
    name: 'CHU de Tokoin',
    district: 'tokoin',
    x: 40,
    y: 18,
    w: 3,
    h: 3,
    floors: 3,
  },
  { type: 'port', name: 'Port de pêche de Bè', district: 'be', x: 74, y: 64, w: 3, h: 2 },
  { type: 'market', name: 'Marché de Bè', district: 'be', x: 88, y: 46, w: 3, h: 2 },
  {
    type: 'worship',
    name: 'Cathédrale du Sacré-Cœur',
    district: 'centre',
    x: 56,
    y: 60,
    floors: 2,
  },
  { type: 'worship', name: 'Grande mosquée de Lomé', district: 'tokoin', x: 52, y: 16, floors: 2 },
  { type: 'station', name: 'Gare routière d’Agoè', district: 'agoe', x: 38, y: 4, w: 4, h: 2 },
  { type: 'stadium', name: 'Stade de Kégué', district: 'agoe', x: 86, y: 4, w: 5, h: 4 },
  { type: 'school', name: 'Lycée d’Adidogomé', district: 'adidogome', x: 14, y: 32, w: 3, h: 2 },
  {
    type: 'hospital',
    name: 'Clinique d’Adidogomé',
    district: 'adidogome',
    x: 26,
    y: 54,
    floors: 2,
  },
  { type: 'market', name: 'Marché d’Adidogomé', district: 'adidogome', x: 8, y: 44, w: 3, h: 2 },
  { type: 'sport', name: 'Salle Fitness Tokoin', district: 'tokoin', x: 44, y: 24, floors: 2 },
  { type: 'sport', name: 'Terrain de Bè', district: 'be', x: 92, y: 34, w: 3, h: 3 },
  {
    type: 'hotel',
    name: 'Hôtel de la plage de Baguida',
    district: 'baguida',
    x: 110,
    y: 62,
    w: 3,
    h: 2,
    floors: 3,
  },
  { type: 'park', name: 'Plage de Baguida', district: 'baguida', x: 104, y: 56, w: 4, h: 3 },
  { type: 'school', name: 'École de Baguida', district: 'baguida', x: 112, y: 36, w: 3, h: 2 },
  { type: 'bank', name: 'Caisse d’épargne d’Agoè', district: 'agoe', x: 62, y: 4, floors: 3 },
  { type: 'worship', name: 'Temple de Bè', district: 'be', x: 80, y: 56, floors: 2 },
  { type: 'market', name: 'Marché d’Agoè-Assiyéyé', district: 'agoe', x: 14, y: 4, w: 3, h: 2 },
  { type: 'bank', name: 'Banque de Bè', district: 'be', x: 94, y: 62, floors: 4 },
  { type: 'school', name: 'École de Tokoin', district: 'tokoin', x: 44, y: 38, w: 2, h: 2 },
  { type: 'hospital', name: 'Centre de santé d’Agoè', district: 'agoe', x: 26, y: 8, floors: 2 },
  { type: 'worship', name: 'Église d’Agoè', district: 'agoe', x: 74, y: 8, floors: 2 },
  { type: 'sport', name: 'Gymnase de Dékon', district: 'centre', x: 38, y: 50, w: 3, h: 2 },
  { type: 'bank', name: 'Banque de Baguida', district: 'baguida', x: 110, y: 50, floors: 3 },
  { type: 'hospital', name: 'Dispensaire de Bè', district: 'be', x: 98, y: 28, floors: 2 },
  { type: 'park', name: 'Jardin de Dékon', district: 'centre', x: 46, y: 64, w: 3, h: 2 },
  { type: 'sport', name: 'Gym d’Agoè', district: 'agoe', x: 110, y: 10, floors: 2 },
  { type: 'worship', name: 'Mosquée d’Adidogomé', district: 'adidogome', x: 30, y: 20, floors: 2 },
  { type: 'bank', name: 'Microfinance d’Adidogomé', district: 'adidogome', x: 4, y: 60, floors: 2 },
  {
    type: 'hospital',
    name: 'Centre de santé de Baguida',
    district: 'baguida',
    x: 116,
    y: 48,
    floors: 2,
  },
  { type: 'school', name: 'École d’Agoè', district: 'agoe', x: 100, y: 8, w: 3, h: 2 },
  { type: 'worship', name: 'Église de Baguida', district: 'baguida', x: 104, y: 42, floors: 2 },
  { type: 'sport', name: 'Stade d’Adidogomé', district: 'adidogome', x: 20, y: 62, w: 4, h: 3 },
  { type: 'bank', name: 'Banque de Tokoin', district: 'tokoin', x: 68, y: 26, floors: 4 },
  { type: 'market', name: 'Marché de Tokoin', district: 'tokoin', x: 38, y: 36, w: 3, h: 2 },
  { type: 'school', name: 'École du centre', district: 'centre', x: 66, y: 56, w: 2, h: 2 },
  { type: 'market', name: 'Marché de Baguida', district: 'baguida', x: 108, y: 30, w: 3, h: 2 },
  { type: 'hospital', name: 'Clinique du centre', district: 'centre', x: 44, y: 58, floors: 3 },
  { type: 'school', name: 'Collège de Bè', district: 'be', x: 76, y: 40, w: 3, h: 2 },
  { type: 'sport', name: 'Piscine de Baguida', district: 'baguida', x: 114, y: 20, w: 3, h: 2 },
  { type: 'hotel', name: 'Hôtel du centre', district: 'centre', x: 60, y: 50, floors: 6 },
  { type: 'station', name: 'Gare de Baguida', district: 'baguida', x: 102, y: 66, w: 3, h: 2 },
]

/** Every generated lot of the world (memoised: the world is immutable). */
let cache: { lots: Lot[]; byCell: Map<string, Lot>; byId: Map<string, Lot> } | null = null

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
export function worldIndex() {
  if (cache) return cache
  const taken = new Set<string>()
  const lots: Lot[] = []
  const occupy = (lot: Lot) => {
    for (let i = 0; i < lot.w; i++)
      for (let j = 0; j < lot.h; j++) taken.add(key(lot.x + i, lot.y + j))
    lots.push(lot)
  }
  // 1. Landmarks: nearest free footprint to the anchor, spiralling out.
  for (const lm of LANDMARKS) {
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
              id: `lm-${lots.length}`,
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
          id: `l-${x}-${y}`,
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
      occupy({ id: `l-${x}-${y}`, type, district: d.id, x, y, w, h, floors, name: null, door })
    }
  const byCell = new Map<string, Lot>()
  const byId = new Map<string, Lot>()
  for (const lot of lots) {
    byId.set(lot.id, lot)
    for (let i = 0; i < lot.w; i++)
      for (let j = 0; j < lot.h; j++) byCell.set(key(lot.x + i, lot.y + j), lot)
  }
  cache = { lots, byCell, byId }
  return cache
}
export const lotAt = (x: number, y: number): Lot | null =>
  worldIndex().byCell.get(key(x, y)) ?? null
export const lotById = (id: string): Lot | null => worldIndex().byId.get(id) ?? null
export const landmarks = (): Lot[] => worldLots().filter((l) => l.name)
export const landmarksIn = (district: DistrictId): Lot[] =>
  landmarks().filter((l) => l.district === district)
export const SIZE_HINT = ESTATE.size
