/**
 * Where the furniture bought in « Aménager » may stand in the player's house, and what it adds
 * to the room: obstacles for walking, and a « Regarder la télé » point in front of a television.
 * Pure: no renderer, no DOM; the same rules for the placing preview and the tests.
 *
 * A piece stands inside the walls, on free floor (not across another piece or the house's own
 * furniture), leaves the door and every interaction point clear, and the player can still walk
 * from the spawn to every interaction point.
 */
import {
  type FurnitureItem,
  type Piece,
  footprint,
  furnitureItem,
  isPlaced,
} from '@/lib/haroolife/city/furnishing'
import { type Obstacle, type Point, isFree, pathfind } from './pathfind'
import { HOUSE_SCENE, type Hotspot, type RoomScene } from './scene'

/** Inside the walls of the house (the walkable bounds keep a little more margin). */
const INSIDE = { minX: -6.05, maxX: 6.05, minZ: -5.05, maxZ: 5.05 }
/** Kept clear in front of the door, so the way out stays open. */
const DOORWAY = { w: 1.6, d: 1.6 }
/** Room around an interaction point where the player stands. */
const SPOT = 0.45

export interface PlacedFurniture {
  uid: string
  item: FurnitureItem
  x: number
  z: number
  /** Yaw in radians (quarter turns). */
  rotation: number
  w: number
  d: number
}

export function placedFurniture(pieces: readonly Piece[]): PlacedFurniture[] {
  return pieces.flatMap((p) => {
    const item = furnitureItem(p.item)
    if (!item || !isPlaced(p)) return []
    const f = footprint(item, p.rot ?? 0)
    return [{ uid: p.uid, item, x: p.x, z: p.z, rotation: ((p.rot ?? 0) * Math.PI) / 2, ...f }]
  })
}

export const furnitureObstacles = (placed: readonly PlacedFurniture[]): Obstacle[] =>
  placed.map((p) => ({ x: p.x, z: p.z, w: p.w, d: p.d }))

const overlaps = (a: Obstacle, b: Obstacle, gap = 0.02) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + gap

const covers = (o: Obstacle, p: Point, margin: number) =>
  Math.abs(o.x - p.x) < o.w / 2 + margin && Math.abs(o.z - p.z) < o.d / 2 + margin

/**
 * In front of a television (its screen faces the piece's +Z), where the player stands to watch:
 * the first free and reachable spot, straight ahead first, then a little further or aside.
 */
function tvSpot(
  p: PlacedFurniture,
  blocked: readonly Obstacle[],
  scene: RoomScene,
): Hotspot | null {
  const fx = Math.sin(p.rotation)
  const fz = Math.cos(p.rotation)
  for (const ahead of [1.5, 1.2, 1.9, 2.4])
    for (const aside of [0, 0.5, -0.5, 1, -1]) {
      const at = { x: p.x + fx * ahead + fz * aside, z: p.z + fz * ahead - fx * aside }
      if (!isFree(at.x, at.z, blocked, scene.bounds)) continue
      if (!pathfind(scene.spawn, at, blocked, scene.bounds).length) continue
      return {
        id: 'tv',
        kind: 'prop',
        ref: 'tv',
        at,
        faces: { x: p.x, z: p.z },
        icon: '📺',
        label: 'Regarder la télé',
        markerY: 1.9,
      }
    }
  return null
}

/** The interaction points the furniture brings (one television). */
export function furnitureHotspots(
  placed: readonly PlacedFurniture[],
  scene: RoomScene = HOUSE_SCENE,
): Hotspot[] {
  const tv = placed.find((p) => p.item.watch)
  if (!tv) return []
  const spot = tvSpot(tv, [...scene.obstacles, ...furnitureObstacles(placed)], scene)
  return spot ? [spot] : []
}

export type PlaceCheck = { ok: true } | { ok: false; reason: string }

/** Whether piece `uid` may stand at (x, z), turned by `rot` quarter turns. */
export function canPlace(
  pieces: readonly Piece[],
  uid: string,
  x: number,
  z: number,
  rot: number,
  scene: RoomScene = HOUSE_SCENE,
): PlaceCheck {
  const piece = pieces.find((p) => p.uid === uid)
  const item = piece && furnitureItem(piece.item)
  if (!piece || !item) return { ok: false, reason: 'Ce meuble n’existe pas.' }
  const f = footprint(item, rot)
  const box = { x, z, w: f.w, d: f.d }
  if (
    x - f.w / 2 < INSIDE.minX ||
    x + f.w / 2 > INSIDE.maxX ||
    z - f.d / 2 < INSIDE.minZ ||
    z + f.d / 2 > INSIDE.maxZ
  )
    return { ok: false, reason: 'Il dépasse du mur.' }
  if (scene.obstacles.some((o) => overlaps(o, box)))
    return { ok: false, reason: 'Un autre meuble est déjà là.' }
  const others = placedFurniture(pieces.filter((p) => p.uid !== uid))
  if (furnitureObstacles(others).some((o) => overlaps(o, box)))
    return { ok: false, reason: 'Un autre meuble est déjà là.' }
  const door = { x: scene.door.x, z: scene.door.z + DOORWAY.d / 2, ...DOORWAY }
  if (overlaps(door, box)) return { ok: false, reason: 'Il bloquerait la porte.' }
  if (covers(box, scene.spawn, SPOT))
    return { ok: false, reason: 'Laisse libre l’entrée de la pièce.' }
  const blocked = [...scene.obstacles, ...furnitureObstacles(others), box]
  for (const h of scene.hotspots) {
    if (covers(box, h.at, SPOT))
      return { ok: false, reason: `Il gênerait : ${h.label.toLowerCase()}.` }
    if (!pathfind(scene.spawn, h.at, blocked, scene.bounds).length)
      return { ok: false, reason: `On ne pourrait plus atteindre : ${h.label.toLowerCase()}.` }
  }
  return { ok: true }
}

/**
 * A free spot near (x, z) for a piece just taken out of its box, searched in rings around the
 * point; the point itself when nothing is free (the preview then shows it in red).
 */
export function freeSpotNear(
  pieces: readonly Piece[],
  uid: string,
  x: number,
  z: number,
  rot: number,
  scene: RoomScene = HOUSE_SCENE,
): Point {
  const snap = (v: number) => Math.round(v * 4) / 4
  for (let r = 0; r <= 6; r += 0.5)
    for (let a = 0; a < 16; a++) {
      const px = snap(x + Math.cos((a * Math.PI) / 8) * r)
      const pz = snap(z + Math.sin((a * Math.PI) / 8) * r)
      if (canPlace(pieces, uid, px, pz, rot, scene).ok) return { x: px, z: pz }
      if (r === 0) break
    }
  return { x: snap(x), z: snap(z) }
}
