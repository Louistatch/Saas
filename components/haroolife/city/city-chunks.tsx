'use client'

import {
  CHUNK,
  type ChunkRef,
  chunkOfCell,
  chunksAround,
  lotsInChunk,
} from '@/lib/haroolife/city/chunks'
import {
  CELL,
  type Lot,
  WORLD_H,
  WORLD_W,
  districtAt,
  hash,
  inEstate,
  isCityRoad,
  isDriveway,
  terrainAt,
} from '@/lib/haroolife/city/world'
/**
 * Streamed city geometry: one merged, vertex-coloured mesh per 16×16 chunk (ground, water,
 * sand, roads, lane marks, every building as a box with a roof slab, parks with trees).
 * Chunks around the camera target are built on demand and destroyed when out of range, so
 * the draw-call count stays near the number of visible chunks whatever the city size.
 * Built with the plain PlayCanvas API through useApp: no per-building React entity.
 */
import { useApp } from '@playcanvas/react/hooks'
import * as pc from 'playcanvas'
import { useEffect, useRef } from 'react'

/** World cell → scene position (cell centre). The whole city is centred on the origin. */
export function worldPos(x: number, y: number, h = 0): [number, number, number] {
  return [(x - WORLD_W / 2 + 0.5) * CELL, h, (y - WORLD_H / 2 + 0.5) * CELL]
}
/** Scene position → world cell. */
export function cellOf(px: number, pz: number): { x: number; y: number } {
  return { x: Math.floor(px / CELL + WORLD_W / 2), y: Math.floor(pz / CELL + WORLD_H / 2) }
}

type RGB = [number, number, number]
const rgb = (hex: string): RGB => [
  Number.parseInt(hex.slice(1, 3), 16) / 255,
  Number.parseInt(hex.slice(3, 5), 16) / 255,
  Number.parseInt(hex.slice(5, 7), 16) / 255,
]
const shade = (c: RGB, k: number): RGB => [
  Math.min(1, c[0] * k),
  Math.min(1, c[1] * k),
  Math.min(1, c[2] * k),
]
const COLORS = {
  grass: {
    agoe: rgb('#8db85f'),
    adidogome: rgb('#86b35a'),
    tokoin: rgb('#7fae57'),
    centre: rgb('#8aa85e'),
    be: rgb('#91b566'),
    baguida: rgb('#9fbb6a'),
  },
  sand: rgb('#e6d3a3'),
  lagoon: rgb('#58b0c8'),
  ocean: rgb('#3f93b8'),
  road: rgb('#4a4f55'),
  street: rgb('#6b6f74'),
  lane: rgb('#e9e2c6'),
  kerb: rgb('#b9b2a4'),
  estate: rgb('#7aa65a'),
  park: rgb('#5f9e4e'),
  tree: rgb('#3f7f3f'),
  trunk: rgb('#7a5230'),
  lot: rgb('#c9ad7d'),
  roof: rgb('#8c4a2f'),
}
const BODY: Record<Lot['type'], RGB> = {
  house: rgb('#f1e6d2'),
  apartment: rgb('#d9d4c7'),
  shop: rgb('#f3c66b'),
  market: rgb('#e8933f'),
  school: rgb('#f0d16a'),
  university: rgb('#d8c9a8'),
  bank: rgb('#9fb4c7'),
  hospital: rgb('#f4f4f4'),
  sport: rgb('#5aa0c8'),
  stadium: rgb('#4f8c6a'),
  worship: rgb('#efe7d6'),
  park: rgb('#5f9e4e'),
  lot: rgb('#c9ad7d'),
  hotel: rgb('#e9b9c5'),
  station: rgb('#c88a4a'),
  port: rgb('#7d9cb5'),
  townhall: rgb('#e4d8b8'),
  billboard: rgb('#333333'),
}
const ROOF: Partial<Record<Lot['type'], RGB>> = {
  house: rgb('#b5541f'),
  shop: rgb('#2f7d4f'),
  market: rgb('#c2410c'),
  school: rgb('#3b82b9'),
  hospital: rgb('#e05a5a'),
  worship: rgb('#8e3b8e'),
  hotel: rgb('#0f766e'),
  townhall: rgb('#1f2a44'),
  bank: rgb('#1f2a44'),
  station: rgb('#7a3b1d'),
}

class MeshBuilder {
  pos: number[] = []
  nrm: number[] = []
  col: number[] = []
  idx: number[] = []
  private n = 0
  quad(a: number[], b: number[], c: number[], d: number[], normal: number[], color: RGB) {
    for (const p of [a, b, c, d]) {
      this.pos.push(p[0], p[1], p[2])
      this.nrm.push(normal[0], normal[1], normal[2])
      this.col.push(color[0], color[1], color[2], 1)
    }
    this.idx.push(this.n, this.n + 2, this.n + 1, this.n, this.n + 3, this.n + 2)
    this.n += 4
  }
  /** Horizontal quad covering [x0,x1]×[z0,z1] at height y. */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, color: RGB) {
    this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0], color)
  }
  /** Axis-aligned box without a bottom face. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: RGB) {
    this.flat(x0, z0, x1, z1, y1, shade(color, 1.0))
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], shade(color, 0.92))
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], shade(color, 0.8))
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], shade(color, 0.86))
    this.quad(
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
      [-1, 0, 0],
      shade(color, 0.74),
    )
  }
  build(device: pc.GraphicsDevice): pc.Mesh | null {
    if (this.idx.length === 0) return null
    const mesh = new pc.Mesh(device)
    mesh.setPositions(this.pos)
    mesh.setNormals(this.nrm)
    mesh.setColors(this.col, 4)
    mesh.setIndices(this.idx)
    mesh.update(pc.PRIMITIVE_TRIANGLES)
    return mesh
  }
}

function buildChunk(device: pc.GraphicsDevice, c: ChunkRef): pc.Mesh | null {
  const b = new MeshBuilder()
  const x0 = c.cx * CHUNK
  const y0 = c.cy * CHUNK
  const near = c.lod === 'near'
  const E = CELL / 2
  for (let y = y0; y < Math.min(y0 + CHUNK, WORLD_H); y++)
    for (let x = x0; x < Math.min(x0 + CHUNK, WORLD_W); x++) {
      const [px, , pz] = worldPos(x, y)
      const t = terrainAt(x, y)
      if (t === 'ocean') {
        b.flat(px - E, pz - E, px + E, pz + E, -0.08, COLORS.ocean)
        continue
      }
      if (t === 'lagoon') {
        if (isCityRoad(x, y)) {
          // Bridge deck over the lagoon.
          b.flat(px - E, pz - E, px + E, pz + E, -0.08, COLORS.lagoon)
          b.box(px - E * 0.8, 0.1, pz - E, px + E * 0.8, 0.22, pz + E, COLORS.road)
        } else b.flat(px - E, pz - E, px + E, pz + E, -0.08, COLORS.lagoon)
        continue
      }
      if (inEstate(x, y)) continue // the estate draws itself
      if (t === 'sand') {
        b.flat(px - E, pz - E, px + E, pz + E, 0, COLORS.sand)
        if (isCityRoad(x, y)) b.flat(px - E, pz - E * 0.7, px + E, pz + E * 0.7, 0.01, COLORS.road)
        else if (near && hash(x, y, 21) < 0.08) {
          b.box(px - 0.06, 0, pz - 0.06, px + 0.06, 1.1, pz + 0.06, COLORS.trunk)
          b.box(px - 0.45, 1.0, pz - 0.45, px + 0.45, 1.3, pz + 0.45, COLORS.tree)
        }
        continue
      }
      const road = isCityRoad(x, y) || isDriveway(x, y)
      if (road) {
        const avenue = x % 12 === 0 || y % 10 === 0 || y === 68
        b.flat(px - E, pz - E, px + E, pz + E, 0, avenue ? COLORS.road : COLORS.street)
        if (avenue && near) {
          if (x % 12 === 0 && !(y % 10 === 0))
            b.flat(px - 0.05, pz - 0.35, px + 0.05, pz + 0.35, 0.01, COLORS.lane)
          else if (y % 10 === 0 || y === 68)
            b.flat(px - 0.35, pz - 0.05, px + 0.35, pz + 0.05, 0.01, COLORS.lane)
        }
        continue
      }
      b.flat(px - E, pz - E, px + E, pz + E, 0, COLORS.grass[districtAt(x, y).id])
    }
  // Buildings owned by this chunk (top-left cell inside it).
  for (const lot of lotsInChunk(c.cx, c.cy)) {
    const own = chunkOfCell(lot.x, lot.y)
    if (own.cx !== c.cx || own.cy !== c.cy) continue
    const [ax, , az] = worldPos(lot.x, lot.y)
    const [bx, , bz] = worldPos(lot.x + lot.w - 1, lot.y + lot.h - 1)
    const inset = lot.w === 1 ? 0.14 : 0.1
    const x0 = ax - E + inset
    const z0 = az - E + inset
    const x1 = bx + E - inset
    const z1 = bz + E - inset
    const v = 0.9 + hash(lot.x, lot.y, 9) * 0.2
    if (lot.type === 'park') {
      b.flat(x0, z0, x1, z1, 0.01, COLORS.park)
      if (near) {
        const n = lot.w * lot.h >= 4 ? 4 : 2
        for (let i = 0; i < n; i++) {
          const tx = x0 + 0.3 + hash(lot.x, lot.y, 30 + i) * (x1 - x0 - 0.6)
          const tz = z0 + 0.3 + hash(lot.x, lot.y, 40 + i) * (z1 - z0 - 0.6)
          b.box(tx - 0.06, 0, tz - 0.06, tx + 0.06, 0.9, tz + 0.06, COLORS.trunk)
          b.box(tx - 0.4, 0.8, tz - 0.4, tx + 0.4, 1.25, tz + 0.4, shade(COLORS.tree, v))
        }
      }
      continue
    }
    if (lot.type === 'lot') {
      b.flat(x0, z0, x1, z1, 0.01, COLORS.lot)
      continue
    }
    const height =
      lot.type === 'stadium'
        ? 1.4
        : lot.type === 'sport' && lot.w >= 3
          ? 0.6
          : 0.55 + lot.floors * 0.55
    const body = shade(BODY[lot.type], v)
    b.box(x0, 0, z0, x1, height, z1, body)
    const roof = ROOF[lot.type]
    if (roof) b.box(x0 - 0.04, height, z0 - 0.04, x1 + 0.04, height + 0.16, z1 + 0.04, roof)
    else b.flat(x0 + 0.08, z0 + 0.08, x1 - 0.08, z1 - 0.08, height + 0.01, shade(body, 0.7))
    if (near && lot.floors >= 2) {
      // Window bands.
      for (let f = 1; f < lot.floors; f++) {
        const yb = 0.55 + f * 0.55 - 0.2
        b.quad(
          [x0 - 0.01, yb, z1 + 0.002],
          [x1 + 0.01, yb, z1 + 0.002],
          [x1 + 0.01, yb + 0.12, z1 + 0.002],
          [x0 - 0.01, yb + 0.12, z1 + 0.002],
          [0, 0, 1],
          rgb('#2c3e50'),
        )
      }
    }
    if (lot.type === 'worship' && near)
      b.box(
        (x0 + x1) / 2 - 0.1,
        height,
        (z0 + z1) / 2 - 0.1,
        (x0 + x1) / 2 + 0.1,
        height + 0.9,
        (z0 + z1) / 2 + 0.1,
        body,
      )
  }
  return b.build(device)
}

export interface ChunkStats {
  chunks: number
  buildings: number
}

export default function CityChunks({
  centerX,
  centerY,
  onStats,
}: {
  centerX: number
  centerY: number
  onStats?: (s: ChunkStats) => void
}) {
  const app = useApp()
  const live = useRef(new Map<string, { entity: pc.Entity; mesh: pc.Mesh; lod: string }>())
  const material = useRef<pc.StandardMaterial | null>(null)

  useEffect(() => {
    if (!app) return
    if (!material.current) {
      const m = new pc.StandardMaterial()
      m.diffuseVertexColor = true
      m.diffuse = new pc.Color(1, 1, 1)
      m.gloss = 0.15
      m.useMetalness = false
      m.update()
      material.current = m
    }
    const wanted = chunksAround(centerX, centerY, 1, 3)
    const keep = new Set(wanted.map((c) => c.key))
    for (const [k, v] of live.current) {
      if (!keep.has(k)) {
        v.entity.destroy()
        v.mesh.destroy()
        live.current.delete(k)
      }
    }
    let buildings = 0
    let budget = 6 // chunks built per effect run; the rest come on the next frames
    for (const c of wanted) {
      const have = live.current.get(c.key)
      if (have && have.lod === c.lod) continue
      if (budget-- <= 0) break
      if (have) {
        have.entity.destroy()
        have.mesh.destroy()
        live.current.delete(c.key)
      }
      const mesh = buildChunk(app.graphicsDevice, c)
      if (!mesh) continue
      const entity = new pc.Entity(`chunk ${c.key}`)
      entity.addComponent('render', {
        meshInstances: [new pc.MeshInstance(mesh, material.current)],
      })
      app.root.addChild(entity)
      live.current.set(c.key, { entity, mesh, lod: c.lod })
    }
    for (const c of wanted)
      if (live.current.has(c.key))
        buildings += lotsInChunk(c.cx, c.cy).filter(
          (l) => l.type !== 'lot' && l.type !== 'park',
        ).length
    onStats?.({ chunks: live.current.size, buildings })
    // Finish the remaining chunks shortly after, so the first frame is not blocked.
    const pending = wanted.some(
      (c) => !live.current.has(c.key) || live.current.get(c.key)?.lod !== c.lod,
    )
    if (!pending) return
    const id = window.setTimeout(() => setTick((t) => t + 1), 30)
    return () => window.clearTimeout(id)
  })

  const [, setTick] = useTick()
  useEffect(
    () => () => {
      for (const v of live.current.values()) {
        v.entity.destroy()
        v.mesh.destroy()
      }
      live.current.clear()
    },
    [],
  )
  return null
}

import { useState } from 'react'
function useTick() {
  return useState(0)
}
