import { type LocalityId, current } from './locality'
/**
 * Life on the streets: vehicles on a deterministic closed walk over the road network, and
 * pedestrians who walk real routes between the doors of real places (home → market,
 * school → clinic…), turning back at the end. Every position derives from a single step
 * counter, so nothing is stored per agent and the city moves even while the player waits.
 */
import { findPath } from './navigation'
import { WORLD_H, WORLD_W, hash, isCityRoad, isDriveway, landmarks, worldLots } from './world'

export type VehicleKind =
  | 'taxi'
  | 'sedan'
  | 'van'
  | 'suv'
  | 'hatchback'
  | 'delivery'
  | 'truck'
  | 'police'
  | 'zem'
/** Real-time length of one traffic step (the street clock of HarooLife). */
export const TRAFFIC_STEP_MS = 700

export interface Agent {
  id: number
  kind: VehicleKind | 'walker'
  x: number
  y: number
  /** Fractional progress towards the next cell, for smooth motion. */
  fx: number
  fy: number
  heading: number
  /** Adult avatar id from the shared catalogue. */
  model?: string
  /** What the pedestrian is doing. */
  activity?: 'walk' | 'run'
  /**
   * Traffic steps one cell takes (walkers: 2 when walking, 1 when running) and how many of
   * them have already elapsed: the renderer interpolates over the whole cell, not per step.
   */
  steps?: number
  sub?: number
}

const loops = new Map<LocalityId, { x: number; y: number }[]>()
export function cityLoop(): { x: number; y: number }[] {
  const loopCache = loops.get(current().id)
  if (loopCache) return loopCache
  const road = (x: number, y: number) => isCityRoad(x, y) || isDriveway(x, y)
  // Start on the first avenue crossing found.
  let start: { x: number; y: number } | null = null
  for (let y = 0; y < WORLD_H && !start; y++)
    for (let x = 0; x < WORLD_W && !start; x++) if (road(x, y)) start = { x, y }
  if (!start) {
    loops.set(current().id, [])
    return []
  }
  const seen = new Set<string>()
  const walk: { x: number; y: number }[] = []
  const stack: { p: { x: number; y: number }; i: number }[] = [{ p: start, i: 0 }]
  seen.add(`${start.x}:${start.y}`)
  walk.push(start)
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ] as const
  // Iterative DFS so the 2 000+ cell network never overflows the call stack.
  while (stack.length) {
    const top = stack[stack.length - 1]
    if (top.i >= 4) {
      stack.pop()
      if (stack.length) walk.push(stack[stack.length - 1].p)
      continue
    }
    const [dx, dy] = dirs[top.i++]
    const n = { x: top.p.x + dx, y: top.p.y + dy }
    const k = `${n.x}:${n.y}`
    if (!road(n.x, n.y) || seen.has(k)) continue
    seen.add(k)
    walk.push(n)
    stack.push({ p: n, i: 0 })
  }
  if (walk.length > 1) walk.pop()
  loops.set(current().id, walk)
  return walk
}

const FLEET: VehicleKind[] = [
  'taxi',
  'sedan',
  'van',
  'zem',
  'suv',
  'taxi',
  'hatchback',
  'sedan',
  'zem',
  'delivery',
  'van',
  'truck',
  'taxi',
  'police',
  'zem',
  'sedan',
  'suv',
  'hatchback',
  'van',
  'zem',
  'taxi',
  'zem',
  'delivery',
  'sedan',
  'taxi',
  'suv',
  'zem',
  'hatchback',
  'truck',
  'taxi',
]
const heading = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.round((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI)

/** Vehicles within `radius` cells of a centre at a given traffic step. */
export function vehiclesNear(step: number, cx: number, cy: number, radius = 26): Agent[] {
  const loop = cityLoop()
  if (loop.length < 2) return []
  const out: Agent[] = []
  const stride = Math.floor(loop.length / FLEET.length)
  FLEET.forEach((kind, i) => {
    const speed = kind === 'zem' ? 3 : kind === 'truck' || kind === 'delivery' ? 1 : 2
    const idx = (step * speed + i * stride) % loop.length
    const here = loop[idx]
    if (Math.abs(here.x - cx) > radius || Math.abs(here.y - cy) > radius) return
    const next = loop[(idx + 1) % loop.length]
    out.push({
      id: i,
      kind,
      x: here.x,
      y: here.y,
      fx: next.x - here.x,
      fy: next.y - here.y,
      heading: heading(here, next),
    })
  })
  return out
}

const CH = ['afi', 'abra', 'afi', 'kossi', 'koffi', 'kossi']
const WALKERS = 48
interface Route {
  path: { x: number; y: number }[]
  minX: number
  maxX: number
  minY: number
  maxY: number
}
const routes = new Map<string, Route | null>()
/** The i-th pedestrian's route: between the doors of two real places, deterministic. */
function routeOf(i: number): Route | null {
  const routeKey = `${current().id}:${i}`
  const cached = routes.get(routeKey)
  if (cached !== undefined) return cached
  const lm = landmarks()
  const lots = worldLots().filter((l) => l.type === 'house' || l.type === 'apartment')
  const from = lots[Math.floor(hash(i, 1, 101) * lots.length)]
  const to = lm[Math.floor(hash(i, 2, 102) * lm.length)]
  const path = from && to ? findPath(from.door, to.door, new Set()) : null
  let route: Route | null = null
  if (path && path.length > 6 && path.length < 160) {
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const p of path) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    route = { path, minX, maxX, minY, maxY }
  }
  routes.set(routeKey, route)
  return route
}
/** Pedestrians within `radius` cells of a centre: each walks its route there and back. */
export function walkersNear(
  step: number,
  cx: number,
  cy: number,
  radius = 22,
  limit = 18,
): Agent[] {
  const out: Agent[] = []
  for (let i = 0; i < WALKERS && out.length < limit; i++) {
    // Cheap bounding-box reject before touching the route.
    const r = routeOf(i)
    if (!r) continue
    if (
      r.maxX < cx - radius ||
      r.minX > cx + radius ||
      r.maxY < cy - radius ||
      r.minY > cy + radius
    )
      continue
    const n = r.path.length
    const run = hash(i, 3, 103) < 0.15
    // One cell per step when running, one per two steps when walking (V3: about 1 render
    // unit/s, the pace at which the walk clip's feet match the ground).
    const steps = run ? 1 : 2
    const period = 2 * (n - 1)
    const t = (Math.floor(step / steps) + Math.floor(hash(i, 4, 104) * period)) % period
    const idx = t < n ? t : period - t
    const here = r.path[idx]
    if (Math.abs(here.x - cx) > radius || Math.abs(here.y - cy) > radius) continue
    const nextIdx = t < n - 1 ? idx + 1 : idx - 1
    const next = r.path[Math.max(0, Math.min(n - 1, nextIdx))]
    out.push({
      id: 1000 + i,
      kind: 'walker',
      x: here.x,
      y: here.y,
      fx: next.x - here.x,
      fy: next.y - here.y,
      heading: heading(here, next),
      model: CH[i % CH.length],
      activity: run ? 'run' : 'walk',
      steps,
      sub: step % steps,
    })
  }
  return out
}
/** Everyone moving near a point. */
export function agentsNear(
  step: number,
  cx: number,
  cy: number,
  radius = 26,
  maxWalkers = 18,
): Agent[] {
  return [
    ...vehiclesNear(step, cx, cy, radius),
    ...walkersNear(step, cx, cy, Math.min(radius, 22), maxWalkers),
  ]
}
