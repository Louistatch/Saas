/**
 * Grid path-finding for the HarooLife rooms (ported from the « Une vie à Lomé » prototype,
 * `sim.js` → `pathfind`). Pure: no renderer, no DOM. Obstacles are axis-aligned rectangles on
 * the floor; the walker keeps `clearance` from their edges. Returns the waypoints after the
 * start (empty when the goal cannot be reached).
 */
export interface Point {
  x: number
  z: number
}
export interface Obstacle {
  x: number
  z: number
  /** Extent along x. */
  w: number
  /** Extent along z. */
  d: number
}
export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** True when a walker standing at (x, z) touches no obstacle and stays within the bounds. */
export function isFree(
  x: number,
  z: number,
  obstacles: readonly Obstacle[],
  bounds: Bounds,
  clearance = 0.22,
): boolean {
  if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return false
  return !obstacles.some(
    (o) =>
      x > o.x - o.w / 2 - clearance &&
      x < o.x + o.w / 2 + clearance &&
      z > o.z - o.d / 2 - clearance &&
      z < o.z + o.d / 2 + clearance,
  )
}

export function pathfind(
  start: Point,
  end: Point,
  obstacles: readonly Obstacle[],
  bounds: Bounds,
  step = 0.45,
  clearance = 0.19,
): Point[] {
  const cols = Math.floor((bounds.maxX - bounds.minX) / step) + 1
  const rows = Math.floor((bounds.maxZ - bounds.minZ) / step) + 1
  type Cell = { x: number; z: number }
  const cell = (p: Point): Cell => ({
    x: clamp(Math.round((p.x - bounds.minX) / step), 0, cols - 1),
    z: clamp(Math.round((p.z - bounds.minZ) / step), 0, rows - 1),
  })
  const world = (c: Cell): Point => ({ x: bounds.minX + c.x * step, z: bounds.minZ + c.z * step })
  const key = (c: Cell) => c.z * cols + c.x
  const blocked = (c: Cell) => {
    const w = world(c)
    return obstacles.some(
      (o) =>
        w.x > o.x - o.w / 2 - clearance &&
        w.x < o.x + o.w / 2 + clearance &&
        w.z > o.z - o.d / 2 - clearance &&
        w.z < o.z + o.d / 2 + clearance,
    )
  }
  const src = cell(start)
  let dst = cell(end)
  // A goal inside furniture moves to the nearest free cell around it (rings of growing size).
  if (blocked(dst)) {
    let found: Cell | null = null
    for (let r = 1; r < 9 && !found; r++)
      for (let dx = -r; dx <= r && !found; dx++)
        for (let dz = -r; dz <= r; dz++) {
          const c = { x: dst.x + dx, z: dst.z + dz }
          if (c.x >= 0 && c.x < cols && c.z >= 0 && c.z < rows && !blocked(c)) {
            found = c
            break
          }
        }
    if (!found) return []
    dst = found
  }
  const h = (c: Cell) => Math.hypot(c.x - dst.x, c.z - dst.z)
  const open: Cell[] = [src]
  const came = new Map<number, Cell>()
  const g = new Map<number, number>([[key(src), 0]])
  const closed = new Set<number>()
  let iterations = 0
  while (open.length > 0 && iterations++ < 5000) {
    let best = 0
    for (let i = 1; i < open.length; i++)
      if ((g.get(key(open[i])) ?? 0) + h(open[i]) < (g.get(key(open[best])) ?? 0) + h(open[best]))
        best = i
    const p = open.splice(best, 1)[0]
    const k = key(p)
    if (k === key(dst)) {
      const out: Point[] = []
      let q: Cell | undefined = p
      while (q && key(q) !== key(src)) {
        out.unshift(world(q))
        q = came.get(key(q))
      }
      return out
    }
    closed.add(k)
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const q = { x: p.x + dx, z: p.z + dz }
      const qk = key(q)
      if (q.x < 0 || q.z < 0 || q.x >= cols || q.z >= rows || closed.has(qk) || blocked(q)) continue
      // No corner cutting: a diagonal step needs both side cells free.
      if (dx && dz && (blocked({ x: p.x + dx, z: p.z }) || blocked({ x: p.x, z: p.z + dz })))
        continue
      const score = (g.get(k) ?? 0) + Math.hypot(dx, dz)
      if (score < (g.get(qk) ?? Number.POSITIVE_INFINITY)) {
        came.set(qk, p)
        g.set(qk, score)
        if (!open.some((n) => key(n) === qk)) open.push(q)
      }
    }
  }
  return []
}
