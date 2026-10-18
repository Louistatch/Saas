import {
  CATEGORY_OF,
  ESTATE,
  type Lot,
  type LotType,
  TYPE_ICONS,
  TYPE_LABELS,
  inEstate,
  isCityRoad,
  isDriveway,
  terrainAt,
  within,
  worldLots,
} from '@/lib/haroolife/city/world'
/**
 * The street drawn by the HarooLife engine: the neighbourhood around the player, read from the
 * Saas city (`world.ts`: terrain, roads, lots and their doors, the player's estate). Pure: the
 * renderer draws what this returns; walking, doors, routes and saves stay in the existing
 * PlayerController and CityLife (one source of truth).
 *
 * Units: one city cell = STREET_CELL scene units. Scene x = cell x × STREET_CELL, scene z =
 * cell y × STREET_CELL; cells and lot ids are never changed.
 */
import type { Building } from '@/lib/haroolife/townsmen-engine'

/**
 * Real scale: an adult is 1.15 units (1.75 m), so a cell of 5 units is about 7.6 m — a two-lane
 * street, a plot with its house and yard. Speeds stay in cells per second, so every trip lasts
 * as long as it did with the former 2-unit cell (houses as wide as a person was tall).
 */
export const STREET_CELL = 5
/** The cell before real scale: props and bodies tuned against people keep their size with it. */
export const PERSON_CELL = 2

export type GroundKind = 'land' | 'sand' | 'water' | 'hill' | 'road' | 'estate' | 'estate-road'

export interface StreetCell {
  x: number
  y: number
  kind: GroundKind
}

export interface StreetBuilding {
  /** Lot id (city) or `estate:x:y` (the player's own buildings). */
  id: string
  x: number
  y: number
  w: number
  h: number
  floors: number
  type: LotType | Building['type']
  color: string
  roof: string
  /** Named place with a door (marker in the street); null for anonymous buildings. */
  name: string | null
  /** The city lot (models chosen by the shared catalogue); absent for the player's estate. */
  lot?: Lot
}

export interface StreetDoor {
  lotId: string
  name: string
  icon: string
  /** Road cell in front of the door. */
  x: number
  y: number
}

export interface StreetWindow {
  /** Centre cell the window was built around. */
  cx: number
  cy: number
  radius: number
  cells: StreetCell[]
  buildings: StreetBuilding[]
  doors: StreetDoor[]
  /** Road cells, for the pedestrians. */
  roads: { x: number; y: number }[]
}

/** Façade and roof colours per category (the prototype's soft palette). */
const PALETTE: Record<string, [string, string]> = {
  homes: ['#e8dcc4', '#b5654a'],
  shops: ['#f1c58a', '#c4573f'],
  education: ['#cfe0f0', '#476d8f'],
  health: ['#f4f4f0', '#3f8f74'],
  transport: ['#d9d0c0', '#6d6a63'],
  services: ['#e3d6ef', '#6b5a86'],
  leisure: ['#cfe8c8', '#4b8a4e'],
  worship: ['#f3ead8', '#8a6a3f'],
  lots: ['#d6cdb5', '#a39b85'],
  estate: ['#efe3cc', '#b0593f'],
}

export function groundAt(x: number, y: number): GroundKind {
  if (!within(x, y)) return 'water'
  if (inEstate(x, y)) return 'estate'
  if (isCityRoad(x, y) || isDriveway(x, y)) return 'road'
  const t = terrainAt(x, y)
  if (t === 'lagoon' || t === 'ocean') return 'water'
  if (t === 'sand') return 'sand'
  if (t === 'hill') return 'hill'
  return 'land'
}

/**
 * The cells, buildings and doors within `radius` cells of (cx, cy). `estate` is the player's
 * own city (townsmen-engine buildings, local coordinates), drawn where the locality has one.
 */
export function streetWindow(
  cx: number,
  cy: number,
  radius: number,
  estate: readonly Building[] = [],
): StreetWindow {
  const cells: StreetCell[] = []
  const roads: { x: number; y: number }[] = []
  const estateRoads = new Set(
    estate.filter((b) => b.type === 'road').map((b) => `${b.x + ESTATE.x0}:${b.y + ESTATE.y0}`),
  )
  for (let y = cy - radius; y <= cy + radius; y++)
    for (let x = cx - radius; x <= cx + radius; x++) {
      let kind = groundAt(x, y)
      if (kind === 'estate' && estateRoads.has(`${x}:${y}`)) kind = 'estate-road'
      cells.push({ x, y, kind })
      if (kind === 'road' || kind === 'estate-road') roads.push({ x, y })
    }

  const buildings: StreetBuilding[] = []
  const doors: StreetDoor[] = []
  for (const lot of worldLots()) {
    if (lot.type === 'billboard') continue
    if (lot.x + lot.w < cx - radius || lot.x > cx + radius) continue
    if (lot.y + lot.h < cy - radius || lot.y > cy + radius) continue
    const [color, roof] = PALETTE[CATEGORY_OF[lot.type]] ?? PALETTE.homes
    buildings.push({
      id: lot.id,
      x: lot.x,
      y: lot.y,
      w: lot.w,
      h: lot.h,
      floors: lot.type === 'park' || lot.type === 'lot' ? 0 : lot.floors,
      type: lot.type,
      color,
      roof,
      name: lot.name,
      lot,
    })
    if (lot.name && Math.abs(lot.door.x - cx) <= radius && Math.abs(lot.door.y - cy) <= radius)
      doors.push(doorOf(lot))
  }
  for (const b of estate) {
    if (b.type === 'road') continue
    const x = b.x + ESTATE.x0
    const y = b.y + ESTATE.y0
    if (Math.abs(x - cx) > radius || Math.abs(y - cy) > radius) continue
    const [color, roof] = PALETTE.estate
    buildings.push({
      id: `estate:${b.x}:${b.y}`,
      x,
      y,
      w: 1,
      h: 1,
      floors: b.type === 'house' ? 1 : b.type === 'hall' ? 2 : 1,
      type: b.type,
      color,
      roof,
      name: null,
    })
  }
  return { cx, cy, radius, cells, buildings, doors, roads }
}

/** Buildings are drawn by tiles of TILE × TILE cells, cached and built as the player moves. */
export const TILE = 8

/**
 * The buildings owned by tile (tx, ty): those whose top-left cell lies in it, so a building
 * spanning two tiles is drawn once. Same entries as `streetWindow` (lot ids, estate ids).
 */
export function buildingsInTile(
  tx: number,
  ty: number,
  estate: readonly Building[] = [],
): StreetBuilding[] {
  const x0 = tx * TILE
  const y0 = ty * TILE
  const inside = (x: number, y: number) => x >= x0 && x < x0 + TILE && y >= y0 && y < y0 + TILE
  const out: StreetBuilding[] = []
  for (const lot of worldLots()) {
    if (lot.type === 'billboard' || !inside(lot.x, lot.y)) continue
    const [color, roof] = PALETTE[CATEGORY_OF[lot.type]] ?? PALETTE.homes
    out.push({
      id: lot.id,
      x: lot.x,
      y: lot.y,
      w: lot.w,
      h: lot.h,
      floors: lot.type === 'park' || lot.type === 'lot' ? 0 : lot.floors,
      type: lot.type,
      color,
      roof,
      name: lot.name,
      lot,
    })
  }
  for (const b of estate) {
    if (b.type === 'road') continue
    const x = b.x + ESTATE.x0
    const y = b.y + ESTATE.y0
    if (!inside(x, y)) continue
    const [color, roof] = PALETTE.estate
    out.push({
      id: `estate:${b.x}:${b.y}`,
      x,
      y,
      w: 1,
      h: 1,
      floors: b.type === 'house' ? 1 : b.type === 'hall' ? 2 : 1,
      type: b.type,
      color,
      roof,
      name: null,
    })
  }
  return out
}

export const doorOf = (lot: Lot): StreetDoor => ({
  lotId: lot.id,
  name: lot.name ?? TYPE_LABELS[lot.type],
  icon: TYPE_ICONS[lot.type],
  x: lot.door.x,
  y: lot.door.y,
})
