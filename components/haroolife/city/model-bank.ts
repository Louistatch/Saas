'use client'

import * as pc from 'playcanvas'

export { type Bank, LOW_DETAIL_CELLS, PACK_BASE, loadBank } from '@/lib/haroolife/city/bank'
import type { Bank } from '@/lib/haroolife/city/bank'

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
