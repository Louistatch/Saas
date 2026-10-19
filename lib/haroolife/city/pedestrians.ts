/** Shared pavement graph, crossing geometry and signals, in city-cell units.
 * No SVG/map substitution: the street renderer draws this very geometry in Three.js.
 */
import { SIDEWALK, WALK_SIDE } from '../game/core/sidewalks'
import type { Vec2 } from './player'

export type RoadQuery = (x: number, z: number) => boolean
/** A driver picks a person up from the kerb, not from the plot under their pavement. */
export function pickupRoad(p: Vec2, road: RoadQuery): Vec2 | null {
  const candidates: Vec2[] = []
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const x = Math.round(p.x) + dx
      const z = Math.round(p.z) + dz
      if (road(x, z)) candidates.push({ x, z })
    }
  candidates.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))
  return candidates[0] ?? null
}
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const
export const isJunction = (x: number, z: number, road: RoadQuery) =>
  road(x, z) && (road(x - 1, z) || road(x + 1, z)) && (road(x, z - 1) || road(x, z + 1))
export type Crossing = { x: number; z: number; axis: 'x' | 'z'; junction: Vec2 }
/** Matches the zebra bands painted by streetDressing: .56–.90 beyond the junction. */
export function crossingAt(p: Vec2, road: RoadQuery): Crossing | null {
  const cx = Math.round(p.x)
  const cz = Math.round(p.z)
  for (let x = cx - 1; x <= cx + 1; x++)
    for (let z = cz - 1; z <= cz + 1; z++) {
      if (!isJunction(x, z, road)) continue
      for (const [dx, dz] of DIRS) {
        if (!road(x + dx, z + dz)) continue
        const along = dx ? (p.x - x) * dx : (p.z - z) * dz
        const across = dx ? Math.abs(p.z - z) : Math.abs(p.x - x)
        if (along >= 0.54 && along <= 0.92 && across <= WALK_SIDE + 0.02)
          return {
            x: x + dx * WALK_SIDE,
            z: z + dz * WALK_SIDE,
            axis: dx ? 'z' : 'x',
            junction: { x, z },
          }
      }
    }
  return null
}
export function onCarriageway(p: Vec2, road: RoadQuery) {
  // Adjacent road cells are continuous: tiny gaps at each integer boundary would reset
  // a stop timer and let a walker evade every control by crossing the grid seams.
  return road(Math.round(p.x), Math.round(p.z))
}
/** The pavement ring outside road cells; never grants entry into buildings. */
export function onPavement(p: Vec2, road: RoadQuery) {
  const x = Math.round(p.x)
  const z = Math.round(p.z)
  if (onCarriageway(p, road)) return false
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++)
      if (
        road(x + dx, z + dz) &&
        Math.abs(p.x - x - dx) <= 0.5 + SIDEWALK &&
        Math.abs(p.z - z - dz) <= 0.5 + SIDEWALK
      )
        return true
  return false
}
/** A subset starts in blinking amber: the municipal report repairs these lights. */
export const signalWorks = (junction: Vec2, repaired: boolean) =>
  repaired || (((junction.x * 31 + junction.z * 17) % 4) + 4) % 4 !== 0
export function signalPhase(seconds: number) {
  const t = ((seconds % 20) + 20) % 20
  return {
    pedestrian: t >= 14,
    x: t < 6 ? 'green' : t < 7 ? 'amber' : 'red',
    z: t >= 7 && t < 13 ? 'green' : t >= 13 && t < 14 ? 'amber' : 'red',
  } as const
}
export function mayCross(p: Vec2, road: RoadQuery, seconds: number, repaired: boolean) {
  const crossing = crossingAt(p, road)
  return !crossing || !signalWorks(crossing.junction, repaired) || signalPhase(seconds).pedestrian
}
/**
 * Stop before the zebra; once committed to a junction, clear it without braking inside. The
 * vehicle's front (`halfLength` ahead of its centre, the drawn car by default) decides: still
 * before the zebra (0.92 from the junction centre), it stops; already on it when the light
 * turns, it clears the junction instead of stopping across the crossing.
 */
export function vehicleAtRed(
  p: Vec2,
  heading: number,
  road: RoadQuery,
  seconds: number,
  repaired: boolean,
  halfLength = 0.27,
) {
  const a = (heading * Math.PI) / 180
  const dx = Math.sin(a)
  const dz = Math.cos(a)
  const jx = Math.round(p.x + dx * 1.05)
  const jz = Math.round(p.z + dz * 1.05)
  if (!isJunction(jx, jz, road) || !signalWorks({ x: jx, z: jz }, repaired)) return false
  const ahead = (jx - p.x) * dx + (jz - p.z) * dz
  return (
    ahead - halfLength > 0.92 &&
    ahead < 1.55 &&
    signalPhase(seconds)[Math.abs(dx) > 0.5 ? 'x' : 'z'] !== 'green'
  )
}

type Node = Vec2 & { edges: number[] }
const id = (p: Vec2) => `${p.x.toFixed(2)}:${p.z.toFixed(2)}`
/** Only sidewalk edges and painted crossings connect the four corners of each road cell. */
export class PavementGraph {
  readonly nodes: Node[] = []
  private readonly index = new Map<string, number>()
  private readonly spatial = new Map<string, number[]>()
  /** Serial BFS workspaces, reused by every walker instead of allocating a large Map per route. */
  private readonly parents: Int32Array
  private readonly queue: Int32Array
  private readonly visited: Uint32Array
  private search = 0
  constructor(
    readonly road: RoadQuery,
    width: number,
    height: number,
  ) {
    const lines = new Map<
      string,
      { points: Set<number>; ranges: [number, number][]; axis: 'x' | 'z' }
    >()
    const node = (p: Vec2) => {
      const key = id(p)
      let n = this.index.get(key)
      if (n === undefined) {
        n = this.nodes.length
        this.nodes.push({ ...p, edges: [] })
        this.index.set(key, n)
      }
      return n
    }
    const edge = (a: Vec2, b: Vec2) => {
      const i = node(a)
      const j = node(b)
      const axis = a.x === b.x ? 'z' : 'x'
      const key = `${axis}:${(axis === 'x' ? a.z : a.x).toFixed(2)}`
      const line = lines.get(key) ?? { points: new Set<number>(), ranges: [], axis }
      line.points.add(i)
      line.points.add(j)
      line.ranges.push([Math.min(a[axis], b[axis]), Math.max(a[axis], b[axis])])
      lines.set(key, line)
    }
    const k = WALK_SIDE
    for (let x = 0; x < width; x++)
      for (let z = 0; z < height; z++) {
        if (!road(x, z)) continue
        const junction = isJunction(x, z, road)
        for (const [dx, dz] of DIRS) {
          const a = dx ? { x: x + dx * k, z: z - k } : { x: x - k, z: z + dz * k }
          const b = dx ? { x: x + dx * k, z: z + k } : { x: x + k, z: z + dz * k }
          if (!road(x + dx, z + dz) || junction) edge(a, b)
          if (road(x + dx, z + dz)) {
            // Overlapping end caps join adjacent sidewalk strips, without cutting a corner.
            if (dx)
              for (const side of [-1, 1])
                edge({ x: x + dx * k, z: z + side * k }, { x: x + dx * (1 - k), z: z + side * k })
            else
              for (const side of [-1, 1])
                edge({ x: x + side * k, z: z + dz * k }, { x: x + side * k, z: z + dz * (1 - k) })
          }
        }
      }
    // Split overlapping strips into a monotonically ordered graph. Connecting overlapping
    // endpoints directly makes a walker turn back .24 cell at every seam of a straight road.
    for (const line of lines.values()) {
      const ranges = line.ranges.sort((a, b) => a[0] - b[0])
      const merged: [number, number][] = []
      for (const range of ranges) {
        const previous = merged.at(-1)
        if (previous && range[0] <= previous[1] + 0.001)
          previous[1] = Math.max(previous[1], range[1])
        else merged.push([...range])
      }
      const points = [...line.points].sort(
        (a, b) => this.nodes[a][line.axis] - this.nodes[b][line.axis],
      )
      let range = 0
      for (let n = 1; n < points.length; n++) {
        const i = points[n - 1]
        const j = points[n]
        const middle = (this.nodes[i][line.axis] + this.nodes[j][line.axis]) / 2
        while (range < merged.length && merged[range][1] < middle) range++
        if (range < merged.length && merged[range][0] <= middle) {
          this.nodes[i].edges.push(j)
          this.nodes[j].edges.push(i)
        }
      }
    }
    this.parents = new Int32Array(this.nodes.length)
    this.queue = new Int32Array(this.nodes.length)
    this.visited = new Uint32Array(this.nodes.length)
    this.nodes.forEach((p, n) => {
      const key = `${Math.floor(p.x)}:${Math.floor(p.z)}`
      const bin = this.spatial.get(key) ?? []
      bin.push(n)
      this.spatial.set(key, bin)
    })
  }
  nearest(p: Vec2): number {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return -1
    let best = -1
    let distance = Number.POSITIVE_INFINITY
    const cx = Math.floor(p.x)
    const cz = Math.floor(p.z)
    // Huge imported coordinates cannot make x++/z++ stop advancing in floating point.
    if (Math.abs(cx) < 1_000_000 && Math.abs(cz) < 1_000_000)
      for (let x = cx - 2; x <= cx + 2; x++)
        for (let z = cz - 2; z <= cz + 2; z++) {
          const bin = this.spatial.get(`${x}:${z}`)
          if (!bin) continue
          for (const n of bin) {
            const at = this.nodes[n]
            const d = Math.hypot(at.x - p.x, at.z - p.z)
            // Preserve the original global traversal's deterministic tie breaking.
            if (d < distance || (d === distance && n < best)) {
              distance = d
              best = n
            }
          }
        }
    // Outside the searched bins every point is at least two cells away.
    if (distance <= 2) return best
    best = -1
    distance = Number.POSITIVE_INFINITY
    for (let n = 0; n < this.nodes.length; n++) {
      const at = this.nodes[n]
      const d = Math.hypot(at.x - p.x, at.z - p.z)
      if (d < distance) {
        distance = d
        best = n
      }
    }
    return best
  }
  route(from: Vec2, to: Vec2): Vec2[] | null {
    const start = this.nearest(from)
    const goal = this.nearest(to)
    if (
      start < 0 ||
      goal < 0 ||
      Math.hypot(this.nodes[start].x - from.x, this.nodes[start].z - from.z) > 2 ||
      Math.hypot(this.nodes[goal].x - to.x, this.nodes[goal].z - to.z) > 2
    )
      return null
    this.search = (this.search + 1) >>> 0
    if (this.search === 0) {
      this.visited.fill(0)
      this.search = 1
    }
    const epoch = this.search
    const parents = this.parents
    const queue = this.queue
    const visited = this.visited
    parents[start] = -1
    visited[start] = epoch
    queue[0] = start
    let count = 1
    for (let i = 0; i < count; i++) {
      const n = queue[i]
      if (n === goal) {
        const path: Vec2[] = []
        let at = n
        while (at !== -1) {
          const p: Node = this.nodes[at]
          path.push({ x: p.x, z: p.z })
          at = parents[at]
        }
        return path.reverse().filter((p, i, all) => {
          if (i === 0 || i === all.length - 1) return true
          const a = all[i - 1]
          const b = all[i + 1]
          return Math.abs((p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x)) > 0.001
        })
      }
      for (const next of this.nodes[n].edges)
        if (visited[next] !== epoch) {
          visited[next] = epoch
          parents[next] = n
          queue[count++] = next
        }
    }
    return null
  }
}

/** Keep the estate's existing walkable paths while routing the city portion over pavements.
 * The actual destination may be deep inside the estate, beyond the pavement graph's reach. */
export function guidedCellRoute(graph: PavementGraph, from: Vec2, cells: Vec2[]): Vec2[] | null {
  if (!cells.length) return []
  const destination = cells[cells.length - 1]
  const direct = graph.road(Math.round(destination.x), Math.round(destination.z))
    ? graph.route(from, destination)
    : null
  if (direct) return direct
  const first = cells.findIndex((p) => graph.road(Math.round(p.x), Math.round(p.z)))
  const last = cells.findLastIndex((p) => graph.road(Math.round(p.x), Math.round(p.z)))
  if (first < 0) return cells
  const prefix = cells.slice(0, first)
  const suffix = cells.slice(last + 1)
  const middle = graph.route(prefix.at(-1) ?? from, suffix[0] ?? cells[last])
  return middle ? [...prefix, ...middle, ...suffix] : null
}

/** A continuous excursion, not a penalty per frame. Reset on a safe pavement, not a reload. */
export class PedestrianWatch {
  private unsafe = 0
  private grace = 3
  private cooldown = 0
  private armed = true
  private legalCrossing: string | null = null
  reset() {
    this.unsafe = 0
    this.grace = 3
    this.legalCrossing = null
  }
  step(
    dt: number,
    p: Vec2,
    moving: boolean,
    road: RoadQuery,
    seconds: number,
    repaired: boolean,
  ): 'outside-crossing' | 'red-light' | null {
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.grace = Math.max(0, this.grace - dt)
    if (!onCarriageway(p, road)) {
      this.unsafe = 0
      this.legalCrossing = null
      if (!this.cooldown) this.armed = true
      return null
    }
    const crossing = crossingAt(p, road)
    const key = crossing ? `${crossing.x}:${crossing.z}` : null
    if (key && mayCross(p, road, seconds, repaired)) this.legalCrossing = key
    const reason =
      crossing && key === this.legalCrossing
        ? null
        : crossing
          ? mayCross(p, road, seconds, repaired)
            ? null
            : 'red-light'
          : 'outside-crossing'
    if (!reason || !moving || this.grace || this.cooldown || !this.armed) {
      this.unsafe = 0
      return null
    }
    this.unsafe += dt
    if (this.unsafe < 0.65) return null
    this.unsafe = 0
    this.cooldown = 60
    this.armed = false
    return reason
  }
}
