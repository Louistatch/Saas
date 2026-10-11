/**
 * Chunk partition of the city world for streaming: 16×16 cells per chunk. The renderer
 * keeps the chunks around the camera target, builds one merged mesh per chunk, and drops
 * chunks that drift out of range. Everything here is pure and memoised.
 */
import { type Lot, WORLD_H, WORLD_W, worldLots } from './world'

export const CHUNK = 16
export const CHUNKS_X = Math.ceil(WORLD_W / CHUNK)
export const CHUNKS_Y = Math.ceil(WORLD_H / CHUNK)
export type Lod = 'near' | 'far'
export interface ChunkRef {
  cx: number
  cy: number
  key: string
  lod: Lod
}

export const chunkKey = (cx: number, cy: number) => `${cx}:${cy}`
export const chunkOfCell = (x: number, y: number) => ({
  cx: Math.floor(x / CHUNK),
  cy: Math.floor(y / CHUNK),
})

let lotsByChunk: Map<string, Lot[]> | null = null
/** Lots whose footprint touches the chunk (a 2×2 lot across a border is listed in both). */
export function lotsInChunk(cx: number, cy: number): Lot[] {
  if (!lotsByChunk) {
    lotsByChunk = new Map()
    for (const lot of worldLots()) {
      const seen = new Set<string>()
      for (let i = 0; i < lot.w; i++)
        for (let j = 0; j < lot.h; j++) {
          const c = chunkOfCell(lot.x + i, lot.y + j)
          const k = chunkKey(c.cx, c.cy)
          if (seen.has(k)) continue
          seen.add(k)
          const list = lotsByChunk.get(k) ?? []
          list.push(lot)
          lotsByChunk.set(k, list)
        }
    }
  }
  return lotsByChunk.get(chunkKey(cx, cy)) ?? []
}

/**
 * Chunks to keep loaded around a world cell: a near ring (full detail) and a far ring
 * (merged boxes only). Sorted nearest first so the first frames fill the centre.
 */
export function chunksAround(x: number, y: number, near = 1, far = 3): ChunkRef[] {
  const c = chunkOfCell(x, y)
  const out: ChunkRef[] = []
  for (let dy = -far; dy <= far; dy++)
    for (let dx = -far; dx <= far; dx++) {
      const cx = c.cx + dx
      const cy = c.cy + dy
      if (cx < 0 || cy < 0 || cx >= CHUNKS_X || cy >= CHUNKS_Y) continue
      const ring = Math.max(Math.abs(dx), Math.abs(dy))
      out.push({ cx, cy, key: chunkKey(cx, cy), lod: ring <= near ? 'near' : 'far' })
    }
  return out.sort(
    (a, b) => Math.hypot(a.cx - c.cx, a.cy - c.cy) - Math.hypot(b.cx - c.cx, b.cy - c.cy),
  )
}
