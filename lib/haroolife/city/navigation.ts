/**
 * Movement across the city: the walkable network is the city roads, the estate's
 * driveway, and the estate's own connected roads (townsmen-engine) shifted into world
 * coordinates. Breadth-first search, bounded by the world size (9 600 cells).
 */
import { type Building, roadNetwork } from '../townsmen-engine'
import { ESTATE, inEstate, isCityRoad, isDriveway, key, toLocal, within } from './world'

export interface WorldPoint {
  x: number
  y: number
}

export function walkable(x: number, y: number, estateRoads: ReadonlySet<string>): boolean {
  if (!within(x, y)) return false
  if (inEstate(x, y)) {
    const l = toLocal({ x, y })
    return estateRoads.has(`${l.x}:${l.y}`)
  }
  return isCityRoad(x, y) || isDriveway(x, y)
}

/**
 * Walkable cells of the estate, in local keys: its connected roads plus the dirt driveway
 * on row 12 from the fence to the first estate road, unless the player built on it.
 */
export function estateRoadsOf(buildings: Building[]): ReadonlySet<string> {
  const roads = new Set(roadNetwork(buildings))
  const built = new Set(buildings.filter((b) => b.type !== 'road').map((b) => `${b.x}:${b.y}`))
  for (let x = 0; x < 9; x++) {
    const k = `${x}:12`
    if (built.has(k)) break
    roads.add(k)
  }
  return roads
}

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/** Shortest walk from `from` to `to` (both walkable), or null when disconnected. */
export function findPath(
  from: WorldPoint,
  to: WorldPoint,
  estateRoads: ReadonlySet<string>,
  limit = 20000,
): WorldPoint[] | null {
  return findPathWhere(from, to, (x, y) => walkable(x, y, estateRoads), limit)
}
/** Breadth-first shortest path over any cell predicate (roads, or roads plus open ground). */
export function findPathWhere(
  from: WorldPoint,
  to: WorldPoint,
  allowed: (x: number, y: number) => boolean,
  limit = 20000,
): WorldPoint[] | null {
  if (!allowed(from.x, from.y) || !allowed(to.x, to.y)) return null
  const start = key(from.x, from.y)
  const goal = key(to.x, to.y)
  if (start === goal) return [from]
  const parent = new Map<string, string | null>([[start, null]])
  const queue: WorldPoint[] = [from]
  for (let i = 0; i < queue.length && i < limit; i++) {
    const p = queue[i]
    for (const [dx, dy] of N4) {
      const n = { x: p.x + dx, y: p.y + dy }
      const k = key(n.x, n.y)
      if (parent.has(k) || !allowed(n.x, n.y)) continue
      parent.set(k, key(p.x, p.y))
      if (k === goal) {
        const out: WorldPoint[] = []
        let cur: string | null = k
        while (cur) {
          const [x, y] = cur.split(':').map(Number)
          out.push({ x, y })
          cur = parent.get(cur) ?? null
        }
        return out.reverse()
      }
      queue.push(n)
    }
  }
  return null
}

/** Nearest walkable cell to a point (for landing at a lot door or recovering a save). */
export function nearestWalkable(
  p: WorldPoint,
  estateRoads: ReadonlySet<string>,
  radius = 6,
): WorldPoint | null {
  if (walkable(p.x, p.y, estateRoads)) return p
  for (let r = 1; r <= radius; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        if (walkable(p.x + dx, p.y + dy, estateRoads)) return { x: p.x + dx, y: p.y + dy }
      }
  return null
}

/** Where the estate meets the city: the driveway cell just outside the fence. */
export const ESTATE_GATE: WorldPoint = { x: ESTATE.x0 - 1, y: ESTATE.y0 + 12 }
