/**
 * Vehicles and pedestrians on the city streets. A deterministic closed walk over the
 * city road network (depth-first with backtracking, like the estate's traffic loop) gives
 * every agent a position from a single step counter, so nothing is stored per agent.
 */
import { WORLD_H, WORLD_W, isCityRoad, isDriveway } from './world'

export interface Agent {
  id: number
  kind: 'taxi' | 'sedan' | 'van' | 'walker' | 'zem'
  x: number
  y: number
  heading: number
}

let loopCache: { x: number; y: number }[] | null = null
export function cityLoop(): { x: number; y: number }[] {
  if (loopCache) return loopCache
  const road = (x: number, y: number) => isCityRoad(x, y) || isDriveway(x, y)
  // Start on the first avenue crossing found.
  let start: { x: number; y: number } | null = null
  for (let y = 0; y < WORLD_H && !start; y++)
    for (let x = 0; x < WORLD_W && !start; x++) if (road(x, y)) start = { x, y }
  if (!start) return (loopCache = [])
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
  return (loopCache = walk)
}

const FLEET: Agent['kind'][] = [
  'taxi',
  'sedan',
  'van',
  'zem',
  'walker',
  'taxi',
  'walker',
  'sedan',
  'zem',
  'walker',
  'van',
  'walker',
  'taxi',
  'walker',
  'zem',
  'sedan',
  'walker',
  'walker',
  'van',
  'walker',
  'taxi',
  'zem',
  'walker',
  'sedan',
]
/** Agents within `radius` cells of a centre at a given traffic step. */
export function agentsNear(step: number, cx: number, cy: number, radius = 26): Agent[] {
  const loop = cityLoop()
  if (loop.length < 2) return []
  const out: Agent[] = []
  const stride = Math.floor(loop.length / FLEET.length)
  FLEET.forEach((kind, i) => {
    const speed = kind === 'walker' ? 1 : kind === 'zem' ? 3 : 2
    const idx = (step * speed + i * stride) % loop.length
    const here = loop[idx]
    if (Math.abs(here.x - cx) > radius || Math.abs(here.y - cy) > radius) return
    const next = loop[(idx + 1) % loop.length]
    const heading = Math.round((Math.atan2(next.x - here.x, next.y - here.y) * 180) / Math.PI)
    out.push({ id: i, kind, x: here.x, y: here.y, heading })
  })
  return out
}
