/**
 * Vertex-clustering simplification for the baked models: every vertex snaps to a cell of
 * a grid laid over the model's bounding box, vertices sharing a cell merge (position
 * averaged, colour of the first, normal re-derived per face), triangles that collapse
 * are dropped and duplicate faces removed. Fast, deterministic, and good enough for the
 * middle distance: the silhouette, roof and dominant colours survive, window frames and
 * door handles disappear. Pure; used by the model bank for the low level of detail.
 */
import type { Model } from './pack'

export function simplifyModel(m: Model, cells = 10): Model {
  const n = m.pos.length / 3
  if (n === 0 || m.idx.length < 3) return m
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (let i = 0; i < n; i++) {
    const x = m.pos[i * 3]
    const y = m.pos[i * 3 + 1]
    const z = m.pos[i * 3 + 2]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }
  const step = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / Math.max(1, cells)
  if (!(step > 0)) return m
  // Cluster id per original vertex.
  const cluster = new Int32Array(n)
  const clusters = new Map<string, number>()
  const sum: number[] = []
  const count: number[] = []
  const col: number[] = []
  for (let i = 0; i < n; i++) {
    const x = m.pos[i * 3]
    const y = m.pos[i * 3 + 1]
    const z = m.pos[i * 3 + 2]
    const key = `${Math.floor((x - minX) / step)}:${Math.floor((y - minY) / step)}:${Math.floor((z - minZ) / step)}`
    let id = clusters.get(key)
    if (id === undefined) {
      id = sum.length / 3
      clusters.set(key, id)
      sum.push(0, 0, 0)
      count.push(0)
      col.push(m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2])
    }
    cluster[i] = id
    sum[id * 3] += x
    sum[id * 3 + 1] += y
    sum[id * 3 + 2] += z
    count[id] += 1
  }
  const k = count.length
  const cpos = new Float32Array(k * 3)
  for (let c = 0; c < k; c++) {
    cpos[c * 3] = sum[c * 3] / count[c]
    cpos[c * 3 + 1] = sum[c * 3 + 1] / count[c]
    cpos[c * 3 + 2] = sum[c * 3 + 2] / count[c]
  }
  // Faces: drop collapsed and duplicate ones; keep a flat normal per face (unwelded output).
  const seen = new Set<string>()
  const pos: number[] = []
  const nrm: number[] = []
  const outCol: number[] = []
  const idx: number[] = []
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = cluster[m.idx[t]]
    const b = cluster[m.idx[t + 1]]
    const c = cluster[m.idx[t + 2]]
    if (a === b || b === c || a === c) continue
    const key = [a, b, c].sort((p, q) => p - q).join(':')
    if (seen.has(key)) continue
    seen.add(key)
    const ax = cpos[a * 3]
    const ay = cpos[a * 3 + 1]
    const az = cpos[a * 3 + 2]
    const ux = cpos[b * 3] - ax
    const uy = cpos[b * 3 + 1] - ay
    const uz = cpos[b * 3 + 2] - az
    const vx = cpos[c * 3] - ax
    const vy = cpos[c * 3 + 1] - ay
    const vz = cpos[c * 3 + 2] - az
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-9) continue
    nx /= len
    ny /= len
    nz /= len
    // Colour: the original face's first vertex colour keeps roofs and walls distinct.
    const src = m.idx[t]
    const base = pos.length / 3
    for (const v of [a, b, c]) {
      pos.push(cpos[v * 3], cpos[v * 3 + 1], cpos[v * 3 + 2])
      nrm.push(nx, ny, nz)
      outCol.push(m.col[src * 3], m.col[src * 3 + 1], m.col[src * 3 + 2])
    }
    idx.push(base, base + 1, base + 2)
  }
  if (idx.length === 0) return m
  return {
    ...m,
    pos: Float32Array.from(pos),
    nrm: Float32Array.from(nrm),
    col: Float32Array.from(outCol),
    idx: Uint32Array.from(idx),
  }
}
