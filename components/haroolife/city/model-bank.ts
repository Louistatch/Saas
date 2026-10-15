'use client'

import type { SizeTable } from '@/lib/haroolife/city/catalogue'
import { type Model, type PackManifest, decodeModel } from '@/lib/haroolife/city/pack'
import { PACK_BUILD } from '@/lib/haroolife/city/pack-version'
import { simplifyModel } from '@/lib/haroolife/city/simplify'
import * as pc from 'playcanvas'

/** Where the baked Kenney pack is served from (see scripts/haroolife-bake-models.mjs). */
export const PACK_BASE = '/haroolife/city/'
/** Grid cells across a model's bounding box for the low level of detail. */
export const LOW_DETAIL_CELLS = 12

export interface Bank {
  manifest: PackManifest
  sizes: SizeTable
  model: (key: string) => Model
  /** The same model simplified for the middle distance (about a fifth of the triangles). */
  lowModel: (key: string) => Model
}

function emptyModel(key: string): Model {
  return {
    key,
    pos: new Float32Array(0),
    nrm: new Float32Array(0),
    col: new Float32Array(0),
    idx: new Uint32Array(0),
    min: [0, 0, 0],
    max: [0, 0, 0],
    size: [0, 0, 0],
  }
}

let loading: Promise<Bank> | null = null
/** Loads the pack once per page; models decode lazily and stay cached. */
export function loadBank(): Promise<Bank> {
  if (loading) return loading
  loading = (async () => {
    // The pack is cached for a day by browsers and the CDN: after a re-bake an old manifest
    // would meet new code (« Unknown model » in production). Load it under its build, and if a
    // cache still answers with another build, fetch both files again past every cache.
    const get = (init?: RequestInit) =>
      Promise.all([
        fetch(`${PACK_BASE}kenney-pack.json?v=${PACK_BUILD}`, init).then(
          (r) => r.json() as Promise<PackManifest>,
        ),
        fetch(`${PACK_BASE}kenney-pack.bin?v=${PACK_BUILD}`, init).then((r) => r.arrayBuffer()),
      ])
    let [manifest, bin] = await get()
    if (manifest.build !== PACK_BUILD) [manifest, bin] = await get({ cache: 'reload' })
    const sizes: SizeTable = {}
    for (const [k, m] of Object.entries(manifest.models))
      sizes[k] = [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]]
    const cache = new Map<string, Model>()
    const lowCache = new Map<string, Model>()
    // Audit hook: triangles per model of the pack (from the manifest, nothing decoded).
    if (typeof window !== 'undefined') {
      const tris: Record<string, number> = {}
      for (const [k, m] of Object.entries(manifest.models)) tris[k] = m.tris
      ;(window as unknown as { __LOME_BANK?: unknown }).__LOME_BANK = tris
    }
    // A model the pack does not hold (a pack of another build that slipped through) is drawn as
    // nothing, once reported, rather than taking the whole game down.
    const decode = (key: string): Model => {
      if (manifest.models[key]) return decodeModel(manifest, bin, key)
      console.warn(`HarooLife: model « ${key} » missing from pack build ${manifest.build ?? '?'}`)
      return emptyModel(key)
    }
    return {
      manifest,
      sizes,
      model: (key: string) => {
        let m = cache.get(key)
        if (!m) {
          m = decode(key)
          cache.set(key, m)
        }
        return m
      },
      lowModel: (key: string) => {
        let m = lowCache.get(key)
        if (!m) {
          const full = cache.get(key) ?? decode(key)
          cache.set(key, full)
          m = simplifyModel(full, LOW_DETAIL_CELLS)
          lowCache.set(key, m)
        }
        return m
      },
    }
  })()
  loading.catch(() => {
    loading = null
  })
  return loading
}

const meshes = new WeakMap<pc.GraphicsDevice, Map<string, pc.Mesh>>()
/** A GPU mesh for one baked model (vehicles, characters' props), cached per device. */
export function meshFor(device: pc.GraphicsDevice, bank: Bank, key: string): pc.Mesh {
  let map = meshes.get(device)
  if (!map) {
    map = new Map()
    meshes.set(device, map)
  }
  let mesh = map.get(key)
  if (mesh) return mesh
  const m = bank.model(key)
  mesh = new pc.Mesh(device)
  mesh.setPositions(m.pos)
  mesh.setNormals(m.nrm)
  const col = new Float32Array((m.pos.length / 3) * 4)
  for (let i = 0; i < m.pos.length / 3; i++) {
    col[i * 4] = m.col[i * 3]
    col[i * 4 + 1] = m.col[i * 3 + 1]
    col[i * 4 + 2] = m.col[i * 3 + 2]
    col[i * 4 + 3] = 1
  }
  mesh.setColors(col, 4)
  mesh.setIndices(m.idx)
  mesh.update(pc.PRIMITIVE_TRIANGLES)
  // Keep one reference ourselves: mesh instances that come and go must not free the cache.
  mesh.incRefCount()
  map.set(key, mesh)
  return mesh
}

let shared: pc.StandardMaterial | null = null
/** One vertex-colour material for everything baked. */
export function bakedMaterial(): pc.StandardMaterial {
  if (shared) return shared
  const m = new pc.StandardMaterial()
  m.diffuseVertexColor = true
  m.diffuse = new pc.Color(1, 1, 1)
  m.gloss = 0.18
  m.useMetalness = false
  m.update()
  shared = m
  return m
}
