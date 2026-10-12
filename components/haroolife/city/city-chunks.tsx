'use client'

import { type Extra, buildingFor, streetFor } from '@/lib/haroolife/city/catalogue'
import {
  CHUNK,
  type ChunkRef,
  chunkOfCell,
  chunksAround,
  lotsInChunk,
} from '@/lib/haroolife/city/chunks'
import { releaseEntity, releaseMesh } from '@/lib/haroolife/city/gpu'
import { current } from '@/lib/haroolife/city/locality'
import { type Geometry, appendModel } from '@/lib/haroolife/city/pack'
import { bump } from '@/lib/haroolife/city/perf'
import {
  CELL,
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
 * Streamed city geometry: one merged, vertex-coloured mesh per 16×16 chunk. Near the
 * camera, every lot carries a real baked Kenney model from the catalogue (houses, shops,
 * offices, stalls), its props (fences, awnings, trees, parked cars) and procedural
 * details (domes, minarets, steeples, canopies, pitches, signs); roads get sidewalks,
 * crosswalks, lamp posts and trees. Far chunks fall back to light procedural volumes
 * with the same colours and roof shapes. Everything in a chunk is a single draw call.
 */
import { useApp } from '@playcanvas/react/hooks'
import * as pc from 'playcanvas'
import { useEffect, useRef, useState } from 'react'
import { type Bank, bakedMaterial, loadBank } from './model-bank'

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
  road: rgb('#4a4f55'),
  street: rgb('#676b70'),
  lane: rgb('#e9e2c6'),
  kerb: rgb('#c9c2b4'),
  pavement: rgb('#b8b1a3'),
  white: rgb('#f5f5f0'),
  park: rgb('#5f9e4e'),
  wood: rgb('#8a5a32'),
  trunk: rgb('#6b4423'),
  tree: rgb('#3f7f3f'),
  seat: rgb('#1f7a4d'),
  concrete: rgb('#9a9a94'),
}
/** Ground palette of the active locality (memoised per locality). */
const palettes = new Map<string, Palette>()
interface Palette {
  grass: Record<string, RGB>
  earth: RGB
  sand: RGB
  lagoon: RGB
  ocean: RGB
  hill: RGB
  shoreRow: number | null
  shoreTree: string
}
function palette(): Palette {
  const loc = current()
  const cached = palettes.get(loc.id)
  if (cached) return cached
  const d = loc.decor
  const grass: Record<string, RGB> = {}
  for (const [id, hex] of Object.entries(d.grass)) grass[id] = rgb(hex)
  const p: Palette = {
    grass,
    earth: rgb(d.earth),
    sand: rgb(d.sand),
    lagoon: rgb(d.lagoon),
    ocean: rgb(d.ocean),
    hill: rgb(d.hill),
    shoreRow: d.shoreRow,
    shoreTree: d.shoreTree,
  }
  palettes.set(loc.id, p)
  return p
}

export class MeshBuilder implements Geometry {
  pos: number[] = []
  nrm: number[] = []
  col: number[] = []
  idx: number[] = []
  get n() {
    return this.pos.length / 3
  }
  quad(a: number[], b: number[], c: number[], d: number[], normal: number[], color: RGB) {
    const n = this.n
    for (const p of [a, b, c, d]) {
      this.pos.push(p[0], p[1], p[2])
      this.nrm.push(normal[0], normal[1], normal[2])
      this.col.push(color[0], color[1], color[2], 1)
    }
    this.idx.push(n, n + 2, n + 1, n, n + 3, n + 2)
  }
  tri(a: number[], b: number[], c: number[], color: RGB) {
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    const n = this.n
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2])
      this.nrm.push(nx / l, ny / l, nz / l)
      this.col.push(color[0], color[1], color[2], 1)
    }
    this.idx.push(n, n + 2, n + 1)
  }
  /** Horizontal quad covering [x0,x1]×[z0,z1] at height y. */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, color: RGB) {
    this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0], color)
  }
  /** Axis-aligned box without a bottom face. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: RGB) {
    this.flat(x0, z0, x1, z1, y1, color)
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
  /** Gable roof over [x0,x1]×[z0,z1], ridge along x when `alongX`. */
  gable(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y0: number,
    h: number,
    color: RGB,
    alongX: boolean,
  ) {
    if (alongX) {
      const zm = (z0 + z1) / 2
      this.quad(
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y0 + h, zm],
        [x0, y0 + h, zm],
        [0, 0.7, 0.7],
        color,
      )
      this.quad(
        [x1, y0, z0],
        [x0, y0, z0],
        [x0, y0 + h, zm],
        [x1, y0 + h, zm],
        [0, 0.7, -0.7],
        shade(color, 0.85),
      )
      this.tri([x0, y0, z0], [x0, y0, z1], [x0, y0 + h, zm], shade(color, 0.7))
      this.tri([x1, y0, z1], [x1, y0, z0], [x1, y0 + h, zm], shade(color, 0.7))
    } else {
      const xm = (x0 + x1) / 2
      this.quad(
        [x1, y0, z0],
        [x1, y0, z1],
        [xm, y0 + h, z1],
        [xm, y0 + h, z0],
        [0.7, 0.7, 0],
        color,
      )
      this.quad(
        [x0, y0, z1],
        [x0, y0, z0],
        [xm, y0 + h, z0],
        [xm, y0 + h, z1],
        [-0.7, 0.7, 0],
        shade(color, 0.85),
      )
      this.tri([x0, y0, z0], [x1, y0, z0], [xm, y0 + h, z0], shade(color, 0.7))
      this.tri([x1, y0, z1], [x0, y0, z1], [xm, y0 + h, z1], shade(color, 0.7))
    }
  }
  cylinder(cx: number, y0: number, cz: number, r: number, h: number, color: RGB, seg = 8) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2
      const a1 = ((i + 1) / seg) * Math.PI * 2
      const p0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r]
      const p1 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r]
      const nm = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]
      this.quad(
        p1,
        p0,
        [p0[0], y0 + h, p0[2]],
        [p1[0], y0 + h, p1[2]],
        nm,
        shade(color, 0.8 + 0.2 * Math.abs(Math.cos((a0 + a1) / 2))),
      )
      this.tri([cx, y0 + h, cz], [p1[0], y0 + h, p1[2]], [p0[0], y0 + h, p0[2]], color)
    }
  }
  cone(cx: number, y0: number, cz: number, r: number, h: number, color: RGB, seg = 8) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2
      const a1 = ((i + 1) / seg) * Math.PI * 2
      this.tri(
        [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r],
        [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r],
        [cx, y0 + h, cz],
        shade(color, 0.8 + 0.2 * Math.abs(Math.cos((a0 + a1) / 2))),
      )
    }
  }
  dome(cx: number, y0: number, cz: number, r: number, color: RGB, rings = 5, seg = 10) {
    for (let j = 0; j < rings; j++) {
      const t0 = (j / rings) * (Math.PI / 2)
      const t1 = ((j + 1) / rings) * (Math.PI / 2)
      const r0 = Math.cos(t0) * r
      const r1 = Math.cos(t1) * r
      const h0 = Math.sin(t0) * r
      const h1 = Math.sin(t1) * r
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2
        const a1 = ((i + 1) / seg) * Math.PI * 2
        const c = shade(
          color,
          0.75 + 0.25 * Math.max(0, Math.sin(t0) * 0.5 + Math.cos((a0 + a1) / 2) * 0.5),
        )
        const p00 = [cx + Math.cos(a0) * r0, y0 + h0, cz + Math.sin(a0) * r0]
        const p10 = [cx + Math.cos(a1) * r0, y0 + h0, cz + Math.sin(a1) * r0]
        const p01 = [cx + Math.cos(a0) * r1, y0 + h1, cz + Math.sin(a0) * r1]
        const p11 = [cx + Math.cos(a1) * r1, y0 + h1, cz + Math.sin(a1) * r1]
        this.tri(p00, p01, p10, c)
        this.tri(p10, p01, p11, c)
      }
    }
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

const E = CELL / 2
/** Cell-space (fractional) → scene x/z. */
const sx = (cx: number) => (cx - WORLD_W / 2 + 0.5) * CELL
const sz = (cy: number) => (cy - WORLD_H / 2 + 0.5) * CELL

function drawExtra(b: MeshBuilder, e: Extra) {
  const px = sx(e.cx)
  const pz = sz(e.cy)
  switch (e.kind) {
    case 'ground':
      b.flat(
        px - (e.w * CELL) / 2 + 0.06,
        pz - (e.d * CELL) / 2 + 0.06,
        px + (e.w * CELL) / 2 - 0.06,
        pz + (e.d * CELL) / 2 - 0.06,
        0.012,
        e.color,
      )
      return
    case 'wall': {
      const hw = (e.w * CELL) / 2 - 0.08
      const hd = (e.d * CELL) / 2 - 0.08
      const t = 0.05
      const gap = 0.55
      const seg = (x0: number, z0: number, x1: number, z1: number) =>
        b.box(x0, 0, z0, x1, e.h, z1, e.color)
      // North / south walls (gap in the middle when the gate is on that side).
      for (const [side, z] of [
        ['n', pz - hd],
        ['s', pz + hd],
      ] as const) {
        if (e.gap === side) {
          seg(px - hw, z - t, px - gap, z + t)
          seg(px + gap, z - t, px + hw, z + t)
          b.box(
            px - gap - 0.06,
            0,
            z - 0.06,
            px - gap + 0.06,
            e.h + 0.14,
            z + 0.06,
            shade(e.color, 0.9),
          )
          b.box(
            px + gap - 0.06,
            0,
            z - 0.06,
            px + gap + 0.06,
            e.h + 0.14,
            z + 0.06,
            shade(e.color, 0.9),
          )
        } else seg(px - hw, z - t, px + hw, z + t)
      }
      for (const [side, x] of [
        ['w', px - hw],
        ['e', px + hw],
      ] as const) {
        if (e.gap === side) {
          seg(x - t, pz - hd, x + t, pz - gap)
          seg(x - t, pz + gap, x + t, pz + hd)
        } else seg(x - t, pz - hd, x + t, pz + hd)
      }
      return
    }
    case 'canopy': {
      const hw = (e.w * CELL) / 2
      const hd = (e.d * CELL) / 2
      for (const [x, z] of [
        [px - hw, pz - hd],
        [px + hw, pz - hd],
        [px - hw, pz + hd],
        [px + hw, pz + hd],
      ])
        b.box(x - 0.025, 0, z - 0.025, x + 0.025, e.h, z + 0.025, COLORS.wood)
      b.box(
        px - hw - 0.06,
        e.h,
        pz - hd - 0.06,
        px + hw + 0.06,
        e.h + 0.05,
        pz + hd + 0.06,
        e.stripe,
      )
      // Light stripes across the awning.
      for (let i = 0; i < 3; i++) {
        const z0 = pz - hd + ((i * 2 + 1) * (hd * 2)) / 7
        b.flat(
          px - hw - 0.06,
          z0 - 0.03,
          px + hw + 0.06,
          z0 + 0.03 + (hd * 2) / 7,
          e.h + 0.052,
          COLORS.white,
        )
      }
      return
    }
    case 'field': {
      const hw = (e.w * CELL) / 2 - 0.08
      const hd = (e.d * CELL) / 2 - 0.08
      b.flat(px - hw, pz - hd, px + hw, pz + hd, 0.015, rgb('#4f9e4c'))
      const w = 0.035
      const ix = hw - 0.25
      const iz = hd - 0.25
      b.flat(px - ix, pz - iz, px + ix, pz - iz + w, 0.02, COLORS.white)
      b.flat(px - ix, pz + iz - w, px + ix, pz + iz, 0.02, COLORS.white)
      b.flat(px - ix, pz - iz, px - ix + w, pz + iz, 0.02, COLORS.white)
      b.flat(px + ix - w, pz - iz, px + ix, pz + iz, 0.02, COLORS.white)
      b.flat(px - w / 2, pz - iz, px + w / 2, pz + iz, 0.02, COLORS.white)
      if (e.stands) {
        for (let s = 0; s < 3; s++) {
          const y = 0.22 + s * 0.2
          b.box(
            px - hw,
            0,
            pz - hd - 0.3 - s * 0.22,
            px + hw,
            y,
            pz - hd - s * 0.22,
            s % 2 ? COLORS.seat : COLORS.concrete,
          )
          b.box(
            px - hw,
            0,
            pz + hd + s * 0.22,
            px + hw,
            y,
            pz + hd + 0.3 + s * 0.22,
            s % 2 ? COLORS.seat : COLORS.concrete,
          )
        }
      } else {
        // A small pitch: goal frames.
        for (const x of [px - ix, px + ix])
          b.box(x - 0.03, 0, pz - 0.35, x + 0.03, 0.3, pz + 0.35, COLORS.white)
      }
      return
    }
    case 'pier': {
      const hw = (e.w * CELL) / 2 - 0.05
      const hd = (e.d * CELL) / 2 - 0.05
      b.box(px - hw, 0, pz - hd, px + hw, 0.12, pz + hd, COLORS.wood)
      for (let i = 0; i < 4; i++) {
        const x = px - hw + 0.2 + i * ((hw * 2 - 0.4) / 3)
        b.box(x - 0.05, 0, pz + hd - 0.1, x + 0.05, 0.5, pz + hd, COLORS.trunk)
      }
      // Two fishing pirogues.
      for (const [x, c] of [
        [px - hw * 0.5, rgb('#2c6fb3')],
        [px + hw * 0.4, rgb('#d94a3a')],
      ] as const) {
        b.box(x - 0.55, 0.05, pz + hd + 0.15, x + 0.55, 0.22, pz + hd + 0.5, c)
        b.box(x - 0.45, 0.22, pz + hd + 0.2, x + 0.45, 0.26, pz + hd + 0.45, COLORS.wood)
      }
      return
    }
    case 'dome':
      b.dome(px, e.h, pz, e.r * CELL, e.color)
      b.box(
        px - 0.03,
        e.h + e.r * CELL,
        pz - 0.03,
        px + 0.03,
        e.h + e.r * CELL + 0.28,
        pz + 0.03,
        rgb('#d4af37'),
      )
      return
    case 'minaret':
      b.cylinder(px, 0, pz, e.r * CELL, e.h, e.color, 8)
      b.cylinder(px, e.h, pz, e.r * CELL * 1.3, 0.12, shade(e.color, 0.9), 8)
      b.dome(px, e.h + 0.12, pz, e.r * CELL * 1.1, rgb('#2f9e8f'))
      return
    case 'steeple': {
      const hw = (e.w * CELL) / 2
      b.box(px - hw, 0, pz - hw, px + hw, e.h, pz + hw, e.color)
      b.cone(px, e.h, pz, hw * 1.2, 0.7, rgb('#7a4a2a'), 4)
      return
    }
    case 'cross':
      b.box(px - 0.03, e.h + 0.7, pz - 0.03, px + 0.03, e.h + 1.2, pz + 0.03, e.color)
      b.box(px - 0.16, e.h + 1.0, pz - 0.03, px + 0.16, e.h + 1.06, pz + 0.03, e.color)
      return
    case 'sign': {
      const hw = (e.w * CELL) / 2
      b.box(px - hw, e.h, pz - 0.03, px + hw, e.h + 0.24, pz + 0.03, e.color)
      b.box(
        px - hw + 0.08,
        e.h + 0.06,
        pz - 0.035,
        px + hw - 0.08,
        e.h + 0.18,
        pz + 0.035,
        COLORS.white,
      )
      return
    }
    case 'bench':
      b.box(px - 0.35, 0.18, pz - 0.12, px + 0.35, 0.24, pz + 0.12, COLORS.wood)
      b.box(px - 0.3, 0, pz - 0.1, px - 0.24, 0.18, pz + 0.1, COLORS.trunk)
      b.box(px + 0.24, 0, pz - 0.1, px + 0.3, 0.18, pz + 0.1, COLORS.trunk)
      return
    case 'flag':
      b.box(px - 0.02, 0, pz - 0.02, px + 0.02, 1.6, pz + 0.02, COLORS.concrete)
      b.box(px + 0.02, 1.25, pz - 0.01, px + 0.42, 1.55, pz + 0.01, e.color)
      return
  }
}

const SMALL_EXTRAS = new Set(['sign', 'bench', 'flag', 'wall', 'cross'])

function buildChunk(
  device: pc.GraphicsDevice,
  c: ChunkRef,
  bank: Bank | null,
): { mesh: pc.Mesh | null; tris: number } {
  const b = new MeshBuilder()
  const x0 = c.cx * CHUNK
  const y0 = c.cy * CHUNK
  const near = c.lod === 'near' && bank !== null
  const mid = c.lod === 'mid' && bank !== null
  const place = (
    key: string,
    cx: number,
    cy: number,
    rot: number,
    scale: number,
    lift = 0,
    tint?: RGB,
  ) => {
    if (!bank) return
    appendModel(b, bank.model(key), { x: sx(cx), y: lift, z: sz(cy), rot, scale, tint })
  }
  const ground = palette()
  for (let y = y0; y < Math.min(y0 + CHUNK, WORLD_H); y++)
    for (let x = x0; x < Math.min(x0 + CHUNK, WORLD_W); x++) {
      const [px, , pz] = worldPos(x, y)
      const t = terrainAt(x, y)
      if (t === 'ocean') {
        b.flat(px - E, pz - E, px + E, pz + E, -0.08, ground.ocean)
        continue
      }
      if (t === 'hill') {
        // Savanna hills: a mound per cell, taller towards the grid's edge, with sparse trees.
        const rise = 0.5 + hash(x, y, 26) * 0.9 + (y < 3 ? 0.6 : 0)
        b.flat(px - E, pz - E, px + E, pz + E, 0, ground.hill)
        b.dome(px, -0.2, pz, E * 1.25, shade(ground.hill, 0.9 + hash(x, y, 27) * 0.2), 4, 8)
        if (near && hash(x, y, 28) < 0.12)
          place('tree', x, y, Math.floor(hash(x, y, 29) * 360), 0.8, rise * 0.4)
        continue
      }
      if (t === 'lagoon') {
        b.flat(px - E, pz - E, px + E, pz + E, -0.08, ground.lagoon)
        if (isCityRoad(x, y)) {
          b.box(px - E * 0.8, 0.1, pz - E, px + E * 0.8, 0.22, pz + E, COLORS.road)
          b.box(px - E * 0.8, 0.22, pz - E, px - E * 0.7, 0.34, pz + E, COLORS.kerb)
          b.box(px + E * 0.7, 0.22, pz - E, px + E * 0.8, 0.34, pz + E, COLORS.kerb)
        }
        continue
      }
      if (inEstate(x, y)) continue // the estate draws itself
      if (t === 'sand') {
        b.flat(px - E, pz - E, px + E, pz + E, 0, ground.sand)
        if (isCityRoad(x, y)) b.flat(px - E, pz - E * 0.7, px + E, pz + E * 0.7, 0.01, COLORS.road)
        else if (near && hash(x, y, 21) < 0.1)
          place(
            ground.shoreTree,
            x + hash(x, y, 22) * 0.6 - 0.3,
            y + hash(x, y, 23) * 0.6 - 0.3,
            Math.floor(hash(x, y, 24) * 360),
            0.9 + hash(x, y, 25) * 0.4,
          )
        continue
      }
      const road = isCityRoad(x, y) || isDriveway(x, y)
      if (road) {
        const st = streetFor(x, y)
        b.flat(px - E, pz - E, px + E, pz + E, 0, st.avenue ? COLORS.road : COLORS.street)
        if (near) {
          // Sidewalks along every edge that touches a non-road land cell.
          const kerb = 0.16
          const land = (ax: number, ay: number) =>
            !isCityRoad(ax, ay) &&
            !isDriveway(ax, ay) &&
            terrainAt(ax, ay) === 'land' &&
            !inEstate(ax, ay)
          if (land(x, y - 1)) b.box(px - E, 0, pz - E, px + E, 0.04, pz - E + kerb, COLORS.pavement)
          if (land(x, y + 1)) b.box(px - E, 0, pz + E - kerb, px + E, 0.04, pz + E, COLORS.pavement)
          if (land(x - 1, y)) b.box(px - E, 0, pz - E, px - E + kerb, 0.04, pz + E, COLORS.pavement)
          if (land(x + 1, y)) b.box(px + E - kerb, 0, pz - E, px + E, 0.04, pz + E, COLORS.pavement)
          if (st.crosswalk) {
            for (let i = 0; i < 5; i++) {
              const o = -0.44 + i * 0.22
              if (st.crosswalk === 'ew')
                b.flat(px - 0.38, pz + o, px + 0.38, pz + o + 0.11, 0.012, COLORS.white)
              else b.flat(px + o, pz - 0.38, px + o + 0.11, pz + 0.38, 0.012, COLORS.white)
            }
          } else if (st.avenue) {
            if (x % 12 === 0 && !(y % 10 === 0))
              b.flat(px - 0.05, pz - 0.35, px + 0.05, pz + 0.35, 0.011, COLORS.lane)
            else if (y % 10 === 0 || y === ground.shoreRow)
              b.flat(px - 0.35, pz - 0.05, px + 0.35, pz + 0.05, 0.011, COLORS.lane)
          }
          if (st.lamp)
            place(st.lamp.model, st.lamp.cx, st.lamp.cy, st.lamp.rot, st.lamp.scale, 0.04)
          if (st.tree)
            place(st.tree.model, st.tree.cx, st.tree.cy, st.tree.rot, st.tree.scale, 0.04)
        } else if (st.avenue) {
          if (x % 12 === 0 && !(y % 10 === 0))
            b.flat(px - 0.05, pz - 0.35, px + 0.05, pz + 0.35, 0.011, COLORS.lane)
          else if (y % 10 === 0 || y === ground.shoreRow)
            b.flat(px - 0.35, pz - 0.05, px + 0.35, pz + 0.05, 0.011, COLORS.lane)
        }
        continue
      }
      b.flat(px - E, pz - E, px + E, pz + E, 0, ground.grass[districtAt(x, y).id] ?? ground.earth)
    }
  // Buildings owned by this chunk (top-left cell inside it).
  let tris = 0
  for (const lot of lotsInChunk(c.cx, c.cy)) {
    const own = chunkOfCell(lot.x, lot.y)
    if (own.cx !== c.cx || own.cy !== c.cy) continue
    const spec = buildingFor(lot, bank?.sizes ?? {})
    const [ax, , az] = worldPos(lot.x, lot.y)
    const [bx, , bz] = worldPos(lot.x + lot.w - 1, lot.y + lot.h - 1)
    const inset = lot.w === 1 ? 0.14 : 0.1
    const fx0 = ax - E + inset
    const fz0 = az - E + inset
    const fx1 = bx + E - inset
    const fz1 = bz + E - inset
    if (lot.type === 'billboard') {
      b.box(fx0 + 0.2, 0, fz0 + 0.5, fx1 - 0.2, 1.3, fz0 + 0.6, rgb('#333333'))
      b.box(fx0 + 0.26, 0.45, fz0 + 0.47, fx1 - 0.26, 1.22, fz0 + 0.5, rgb('#f0b429'))
      continue
    }
    if (near || mid) {
      for (const e of spec.extras) if (e.kind === 'ground') drawExtra(b, e)
      if (spec.main)
        place(
          spec.main.model,
          spec.main.cx,
          spec.main.cy,
          spec.main.rot,
          spec.main.scale,
          spec.main.lift ?? 0,
          spec.main.tint,
        )
      // Middle ring: the building and its silhouette features, without small props.
      if (near)
        for (const p of spec.props) place(p.model, p.cx, p.cy, p.rot, p.scale, p.lift ?? 0, p.tint)
      for (const e of spec.extras)
        if (e.kind !== 'ground' && (near || !SMALL_EXTRAS.has(e.kind))) drawExtra(b, e)
      continue
    }
    // Far level of detail: a coloured volume with the right roof silhouette.
    const f = spec.far
    if (f.height < 0.05) {
      b.flat(fx0, fz0, fx1, fz1, 0.01, f.body)
      continue
    }
    const v = 0.92 + hash(lot.x, lot.y, 9) * 0.16
    const body = shade(f.body, v)
    b.box(fx0, 0, fz0, fx1, f.height, fz1, body)
    switch (f.style) {
      case 'gable':
        b.gable(
          fx0 - 0.04,
          fz0 - 0.04,
          fx1 + 0.04,
          fz1 + 0.04,
          f.height,
          0.45,
          f.roof,
          lot.w >= lot.h,
        )
        break
      case 'parapet':
        b.box(
          fx0 - 0.03,
          f.height,
          fz0 - 0.03,
          fx1 + 0.03,
          f.height + 0.1,
          fz1 + 0.03,
          shade(body, 0.8),
        )
        break
      case 'dome':
        b.dome((fx0 + fx1) / 2, f.height, (fz0 + fz1) / 2, (fx1 - fx0) * 0.4, f.roof, 3, 8)
        break
      case 'steeple':
        b.box(fx0, f.height, fz0 + 0.2, fx0 + 0.45, f.height + 1.3, fz0 + 0.65, body)
        break
      default:
        b.flat(fx0 + 0.06, fz0 + 0.06, fx1 - 0.06, fz1 - 0.06, f.height + 0.01, f.roof)
    }
  }
  tris = b.idx.length / 3
  return { mesh: b.build(device), tris }
}

export interface ChunkStats {
  chunks: number
  buildings: number
  /** Triangles currently in chunk meshes. */
  tris: number
  /** True once the baked model pack is in use (real buildings, not volumes). */
  detailed: boolean
}

export interface Rings {
  near: number
  mid: number
  far: number
}
export const DEFAULT_RINGS: Rings = { near: 1, mid: 2, far: 3 }

export default function CityChunks({
  centerX,
  centerY,
  onStats,
  rings = DEFAULT_RINGS,
  hidden = false,
}: {
  centerX: number
  centerY: number
  onStats?: (s: ChunkStats) => void
  /** Chunk rings per level of detail (from the quality preset). */
  rings?: Rings
  /** Keep the chunks alive but invisible (interiors, rides): no rebuild on return. */
  hidden?: boolean
}) {
  bump('chunks')
  const app = useApp()
  const live = useRef(
    new Map<string, { entity: pc.Entity; mesh: pc.Mesh | null; lod: string; tris: number }>(),
  )
  const [bank, setBank] = useState<Bank | null>(null)
  const [, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    loadBank()
      .then((b) => alive && setBank(b))
      .catch(() => alive && setBank(null))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!app) return
    for (const v of live.current) v[1].entity.enabled = !hidden
    if (hidden) return
    const wanted = chunksAround(centerX, centerY, rings.near, rings.far, rings.mid)
    const keep = new Set(wanted.map((c) => c.key))
    for (const [k, v] of live.current) {
      if (!keep.has(k)) {
        releaseEntity(v.entity)
        releaseMesh(v.mesh)
        live.current.delete(k)
      }
    }
    let buildings = 0
    let budget = bank ? 4 : 6 // chunks built per effect run; the rest come on the next frames
    for (const c of wanted) {
      const lodKey = c.lod === 'far' ? 'far' : bank ? c.lod : `${c.lod}-plain`
      const have = live.current.get(c.key)
      if (have && have.lod === lodKey) continue
      if (budget-- <= 0) break
      if (have) {
        releaseEntity(have.entity)
        releaseMesh(have.mesh)
        live.current.delete(c.key)
      }
      const { mesh, tris } = buildChunk(app.graphicsDevice, c, bank)
      const entity = new pc.Entity(`chunk ${c.key}`)
      if (mesh)
        entity.addComponent('render', {
          meshInstances: [new pc.MeshInstance(mesh, bakedMaterial())],
        })
      app.root.addChild(entity)
      live.current.set(c.key, { entity, mesh, lod: lodKey, tris })
    }
    let tris = 0
    for (const c of wanted) {
      const have = live.current.get(c.key)
      if (!have) continue
      tris += have.tris
      buildings += lotsInChunk(c.cx, c.cy).filter(
        (l) => l.type !== 'lot' && l.type !== 'park',
      ).length
    }
    onStats?.({ chunks: live.current.size, buildings, tris, detailed: bank !== null })
    // Finish the remaining chunks shortly after, so the first frame is not blocked.
    const pending = wanted.some((c) => {
      const lodKey = c.lod === 'far' ? 'far' : bank ? c.lod : `${c.lod}-plain`
      return live.current.get(c.key)?.lod !== lodKey
    })
    if (!pending) return
    const id = window.setTimeout(() => setTick((t) => t + 1), 30)
    return () => window.clearTimeout(id)
  })

  useEffect(
    () => () => {
      // The application may already be destroyed (route change): release is a no-op then.
      for (const v of live.current.values()) {
        releaseEntity(v.entity)
        releaseMesh(v.mesh)
      }
      live.current.clear()
    },
    [],
  )
  return null
}
