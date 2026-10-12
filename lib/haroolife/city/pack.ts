/**
 * Baked model pack: CC0 Kenney models reduced to vertex-coloured geometry by
 * `scripts/haroolife-bake-models.mjs`. Decoding and instancing into a merged mesh are pure
 * array operations, so chunks can hold hundreds of real buildings in one draw call.
 */
export interface PackModel {
  off: number
  verts: number
  tris: number
  /** Position quantisation step (Int16 × scale = model units). */
  scale: number
  min: [number, number, number]
  max: [number, number, number]
  src: string
  layout: { pos: number; nrm: number; col: number; idx: number }
  wide: boolean
}
export interface PackManifest {
  version: 1
  license: string
  models: Record<string, PackModel>
}
export interface Model {
  key: string
  pos: Float32Array
  nrm: Float32Array
  /** RGB in [0, 1]. */
  col: Float32Array
  idx: Uint32Array
  min: [number, number, number]
  max: [number, number, number]
  /** Extents in model units. */
  size: [number, number, number]
}
export interface Geometry {
  pos: number[]
  nrm: number[]
  /** RGBA, four per vertex. */
  col: number[]
  idx: number[]
}
export interface Instance {
  x: number
  y: number
  z: number
  /** Rotation around Y, degrees. */
  rot?: number
  scale?: number | [number, number, number]
  /** Multiplies the baked colours (material variation). */
  tint?: [number, number, number]
}

export function decodeModel(manifest: PackManifest, bin: ArrayBuffer, key: string): Model {
  const m = manifest.models[key]
  if (!m) throw new Error(`Unknown model: ${key}`)
  const n = m.verts
  const P = new Int16Array(bin, m.layout.pos, n * 3)
  const N = new Int8Array(bin, m.layout.nrm, n * 3)
  const C = new Uint8Array(bin, m.layout.col, n * 3)
  const I = m.wide
    ? new Uint32Array(bin, m.layout.idx, m.tris * 3)
    : new Uint16Array(bin, m.layout.idx, m.tris * 3)
  const pos = new Float32Array(n * 3)
  const nrm = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n * 3; i++) {
    pos[i] = P[i] * m.scale
    nrm[i] = N[i] / 127
    col[i] = C[i] / 255
  }
  return {
    key,
    pos,
    nrm,
    col,
    idx: Uint32Array.from(I),
    min: m.min,
    max: m.max,
    size: [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]],
  }
}

/** Appends a transformed copy of a model into a geometry buffer (merged mesh). */
export function appendModel(out: Geometry, m: Model, inst: Instance): void {
  const base = out.pos.length / 3
  const a = ((inst.rot ?? 0) * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const [sx, sy, sz] =
    typeof inst.scale === 'number'
      ? [inst.scale, inst.scale, inst.scale]
      : (inst.scale ?? [1, 1, 1])
  const [tr, tg, tb] = inst.tint ?? [1, 1, 1]
  const n = m.pos.length / 3
  for (let i = 0; i < n; i++) {
    const px = m.pos[i * 3] * sx
    const py = m.pos[i * 3 + 1] * sy
    const pz = m.pos[i * 3 + 2] * sz
    out.pos.push(px * c + pz * s + inst.x, py + inst.y, -px * s + pz * c + inst.z)
    const nx = m.nrm[i * 3]
    const ny = m.nrm[i * 3 + 1]
    const nz = m.nrm[i * 3 + 2]
    out.nrm.push(nx * c + nz * s, ny, -nx * s + nz * c)
    out.col.push(m.col[i * 3] * tr, m.col[i * 3 + 1] * tg, m.col[i * 3 + 2] * tb, 1)
  }
  for (let i = 0; i < m.idx.length; i++) out.idx.push(base + m.idx[i])
}

/** Uniform scale so the model's ground footprint fits inside w × d (scene units). */
export function fitScale(m: Model, w: number, d: number, min = 0.5, max = 3): number {
  const k = Math.min(w / Math.max(0.01, m.size[0]), d / Math.max(0.01, m.size[2]))
  return Math.max(min, Math.min(max, k))
}
