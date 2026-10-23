/**
 * The street's buildings from the baked Kenney pack, chosen by the same catalogue as the
 * PlayCanvas city (`buildingFor`: model, door orientation, footprint scale, tint, props and
 * extras such as domes or market canopies), merged into one vertex-coloured geometry.
 *
 * Units: the catalogue places in PlayCanvas scene units (1 cell = CELL = 1.35); the HarooLife
 * street uses STREET_CELL units per cell, so positions in cells × STREET_CELL and every height,
 * radius and scale × STREET_CELL / CELL.
 */
import type { Bank } from '@/lib/haroolife/city/bank'
import { type Extra, buildingFor, isLomeModel } from '@/lib/haroolife/city/catalogue'
import type { Geometry, Instance, Model } from '@/lib/haroolife/city/pack'
import { CELL } from '@/lib/haroolife/city/world'
import { PERSON_CELL, STREET_CELL, type StreetBuilding } from '@/lib/haroolife/game/core/street'
import * as THREE from 'three'
import { SWAY, swayWeight } from './street-wind'

const U = STREET_CELL
const K = STREET_CELL / CELL
/**
 * Height of the buildings against their footprint. The catalogue fits a model's footprint to its
 * lot; Kenney's stylised storeys are squat, so they are drawn a little taller (not wider, so they
 * keep to their lots): about 3 m a storey against a 1.75 m adult.
 */
export const BUILDING_HEIGHT = 1.3
const HK = K * BUILDING_HEIGHT
/**
 * Props sized against people (fences, stalls, parasols, lamps) keep the size they had when a
 * cell was PERSON_CELL units; trees, awnings (fitted to their shop) and industrial props grow
 * with the city like the buildings.
 */
const PK = PERSON_CELL / CELL
const PERSON_PROPS = new Set([
  'parasol-a',
  'parasol-b',
  'fence-2',
  'fence-3',
  'fence-4',
  'fence-low',
  'planter',
  'lamp-curved',
  'lamp-double',
  'lamp-square',
  'cone',
  'barrier',
  'road-sign',
  'display-fruit',
  'display-bread',
  'cash-register',
  'freezer',
  'shopping-cart',
])
type RGB = [number, number, number]

/**
 * Models are planned first: one allocation per typed buffer, no growing JS arrays of buildings.
 * `own`: the model's colours are final (Lomé's models); the vertex alpha tells the street's
 * colour grade to leave them as they are (it regrades the pastel kit only).
 */
type Part = { model: Model; instance: Instance; own?: boolean }
function mergedParts(parts: Part[], extras: Geometry): THREE.BufferGeometry {
  let vertices = extras.pos.length / 3
  let indices = extras.idx.length
  for (const p of parts) {
    vertices += p.model.pos.length / 3
    indices += p.model.idx.length
  }
  const pos = new Float32Array(vertices * 3)
  const nrm = new Float32Array(vertices * 3)
  const col = new Float32Array(vertices * 4)
  // Trees bend in the wind (street-wind.ts); everything else, and the extras, stay at 0.
  const sway = new Uint8Array(vertices)
  const idx = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)
  pos.set(extras.pos)
  nrm.set(extras.nrm)
  col.set(extras.col)
  idx.set(extras.idx)
  let base = extras.pos.length / 3
  let offset = extras.idx.length
  for (const { model: m, instance: inst, own } of parts) {
    const angle = ((inst.rot ?? 0) * Math.PI) / 180
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const scale = inst.scale ?? 1
    const sx = typeof scale === 'number' ? scale : scale[0]
    const sy = typeof scale === 'number' ? scale : scale[1]
    const sz = typeof scale === 'number' ? scale : scale[2]
    const tint = inst.tint ?? [1, 1, 1]
    const species = SWAY[m.key] ?? 0
    const tall = m.size[1] || 1
    for (let i = 0; i < m.pos.length / 3; i++) {
      const v = (base + i) * 3
      const px = m.pos[i * 3] * sx
      const py = m.pos[i * 3 + 1] * sy
      const pz = m.pos[i * 3 + 2] * sz
      pos[v] = px * c + pz * s + inst.x
      pos[v + 1] = py + inst.y
      pos[v + 2] = -px * s + pz * c + inst.z
      const nx = m.nrm[i * 3] / sx
      const ny = m.nrm[i * 3 + 1] / sy
      const nz = m.nrm[i * 3 + 2] / sz
      const length = Math.hypot(nx, ny, nz) || 1
      nrm[v] = (nx / length) * c + (nz / length) * s
      nrm[v + 1] = ny / length
      nrm[v + 2] = -(nx / length) * s + (nz / length) * c
      const ci = (base + i) * 4
      col[ci] = m.col[i * 3] * tint[0]
      col[ci + 1] = m.col[i * 3 + 1] * tint[1]
      col[ci + 2] = m.col[i * 3 + 2] * tint[2]
      col[ci + 3] = own ? 0 : 1
      if (species > 0)
        sway[base + i] = Math.round(swayWeight(species, (m.pos[i * 3 + 1] - m.min[1]) / tall) * 255)
    }
    for (let i = 0; i < m.idx.length; i++) idx[offset++] = base + m.idx[i]
    base += m.pos.length / 3
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 4))
  g.setAttribute('sway', new THREE.BufferAttribute(sway, 1, true))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  g.computeBoundingSphere()
  return g
}

/** The player's own buildings (townsmen-engine types) → models of the same pack. */
const ESTATE_MODEL: Record<string, string | null> = {
  house: 'sub-a',
  lumberyard: 'sub-t',
  mill: 'sub-f',
  bakery: 'com-d',
  market: 'com-a',
  hall: 'com-a',
  farm: 'bush',
  park: 'tree',
  well: null,
}

/** Appends a Three primitive (transformed) in one colour. */
function pushShape(out: Geometry, g: THREE.BufferGeometry, m: THREE.Matrix4, color: RGB) {
  const geo = (g.index ? g.toNonIndexed() : g).applyMatrix4(m)
  const pos = geo.attributes.position
  const nrm = geo.attributes.normal
  const base = out.pos.length / 3
  for (let i = 0; i < pos.count; i++) {
    out.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    out.nrm.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i))
    out.col.push(color[0], color[1], color[2], 1)
    out.idx.push(base + i)
  }
  geo.dispose()
  if (geo !== g) g.dispose()
}
const at = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
    new THREE.Vector3(sx, sy, sz),
  )
const box = (
  out: Geometry,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  c: RGB,
) => pushShape(out, new THREE.BoxGeometry(1, 1, 1), at(x, y + h / 2, z, w, h, d), c)

function drawExtra(out: Geometry, e: Extra) {
  const x = e.cx * U
  const z = e.cy * U
  switch (e.kind) {
    case 'ground':
      box(out, x, 0, z, e.w * U - 0.12, 0.03, e.d * U - 0.12, e.color)
      return
    case 'field':
      box(out, x, 0, z, e.w * U - 0.2, 0.04, e.d * U - 0.2, [0.55, 0.68, 0.36])
      return
    case 'pier':
      box(out, x, 0, z, e.w * U, 0.12, e.d * U, [0.55, 0.42, 0.3])
      return
    case 'dome':
      pushShape(
        out,
        new THREE.SphereGeometry(e.r * K, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        at(x, e.h * HK, z),
        e.color,
      )
      return
    case 'minaret':
      pushShape(
        out,
        new THREE.CylinderGeometry(e.r * K, e.r * K, e.h * HK, 10),
        at(x, (e.h * HK) / 2, z),
        e.color,
      )
      pushShape(
        out,
        new THREE.ConeGeometry(e.r * K * 1.3, e.r * K * 2.4, 10),
        at(x, e.h * HK + e.r * K * 1.2, z),
        e.color,
      )
      return
    case 'steeple':
      box(out, x, 0, z, e.w * K, e.h * HK, e.w * K, e.color)
      pushShape(
        out,
        new THREE.ConeGeometry(e.w * K * 0.75, e.w * K * 1.6, 4),
        at(x, e.h * HK + e.w * K * 0.8, z, 1, 1, 1, Math.PI / 4),
        e.color,
      )
      return
    case 'cross':
      box(out, x, e.h * HK, z, 0.08, 0.7, 0.08, e.color)
      box(out, x, e.h * HK + 0.4, z, 0.42, 0.08, 0.08, e.color)
      return
    case 'canopy': {
      const w = e.w * U
      const d = e.d * U
      const h = e.h * K
      for (const [px, pz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        box(out, x + (px * w) / 2.2, 0, z + (pz * d) / 2.2, 0.08, h, 0.08, [0.35, 0.3, 0.25])
      box(out, x, h, z, w, 0.1, d, e.stripe)
      return
    }
    case 'wall': {
      const hw = (e.w * U) / 2 - 0.1
      const hd = (e.d * U) / 2 - 0.1
      const h = e.h * K
      const gap = 0.9
      const seg = (x0: number, z0: number, x1: number, z1: number) =>
        box(
          out,
          (x0 + x1) / 2,
          0,
          (z0 + z1) / 2,
          Math.max(0.1, x1 - x0),
          h,
          Math.max(0.1, z1 - z0),
          e.color,
        )
      for (const [side, zz] of [
        ['n', z - hd],
        ['s', z + hd],
      ] as const) {
        if (e.gap === side) {
          seg(x - hw, zz, x - gap, zz)
          seg(x + gap, zz, x + hw, zz)
        } else seg(x - hw, zz, x + hw, zz)
      }
      for (const [side, xx] of [
        ['w', x - hw],
        ['e', x + hw],
      ] as const) {
        if (e.gap === side) {
          seg(xx, z - hd, xx, z - gap)
          seg(xx, z + gap, xx, z + hd)
        } else seg(xx, z - hd, xx, z + hd)
      }
      return
    }
    case 'sign':
      box(out, x, e.h * HK, z, e.w * K, 0.5, 0.08, e.color)
      return
    case 'bench':
      pushShape(
        out,
        new THREE.BoxGeometry(1, 1, 1),
        at(x, 0.3, z, 1.2, 0.12, 0.4, (e.rot * Math.PI) / 180),
        [0.5, 0.36, 0.24],
      )
      return
    case 'flag':
      box(out, x, 0, z, 0.06, 3, 0.06, [0.3, 0.3, 0.3])
      box(out, x + 0.35, 2.4, z, 0.7, 0.45, 0.04, e.color)
      return
  }
}

/** Tiles whose centre is within this many cells of the player get full models and props. */
export const DETAIL_CELLS = 8

/**
 * One merged geometry for the buildings, props and extras of a tile (one draw call). Like the
 * PlayCanvas city: full models near the player (`detail`), simplified models (about a fifth of
 * the triangles) and no small props farther away.
 */
export function buildCityGeometry(
  bank: Bank,
  buildings: readonly StreetBuilding[],
  detail: boolean,
  liveAmbulance = false,
): THREE.BufferGeometry {
  const out: Geometry = { pos: [], nrm: [], col: [], idx: [] }
  const parts: Part[] = []
  const near = detail
  // `tall`: a building (drawn taller); props (trees, benches, vehicles, fences) keep their size.
  const place = (
    key: string,
    cx: number,
    cy: number,
    rot: number,
    scale: number,
    lift = 0,
    tint?: RGB,
    tall = false,
  ) => {
    const k = !tall && PERSON_PROPS.has(key) ? PK : K
    // Lomé's models are modelled at real proportions: never drawn taller.
    const own = isLomeModel(key)
    const hk = own ? K : HK
    parts.push({
      model: near ? bank.model(key) : bank.lowModel(key),
      instance: {
        x: cx * U,
        y: lift * (tall ? hk : k),
        z: cy * U,
        rot,
        scale: tall ? [scale * K, scale * hk, scale * K] : scale * k,
        tint,
      },
      own,
    })
  }
  for (const b of buildings) {
    if (b.lot) {
      const spec = buildingFor(b.lot, bank.sizes)
      for (const e of spec.extras) if (e.kind === 'ground' || e.kind === 'field') drawExtra(out, e)
      const m = spec.main
      if (m) place(m.model, m.cx, m.cy, m.rot, m.scale, m.lift ?? 0, m.tint, true)
      if (near)
        for (const p of spec.props) {
          // Street dispatch owns this vehicle; baking a parked copy into the road would
          // leave a second, non-colliding ambulance in the way of the moving one.
          if (liveAmbulance && p.model === 'ambulance') continue
          place(p.model, p.cx, p.cy, p.rot, p.scale, p.lift ?? 0, p.tint)
        }
      for (const e of spec.extras) if (e.kind !== 'ground' && e.kind !== 'field') drawExtra(out, e)
      continue
    }
    // The player's estate: one model per building, fitted to its cell.
    const key = ESTATE_MODEL[String(b.type)]
    if (key === null) {
      box(out, b.x * U, 0, b.y * U, 0.9, 0.6, 0.9, [0.55, 0.52, 0.48])
      continue
    }
    if (!key) continue
    const model = bank.model(key)
    const fit = Math.min(
      (U * 0.9) / Math.max(0.01, model.size[0]),
      (U * 0.9) / Math.max(0.01, model.size[2]),
    )
    const tall = key === 'bush' || key === 'tree' ? fit : fit * BUILDING_HEIGHT
    parts.push({
      model,
      instance: { x: b.x * U, y: 0, z: b.y * U, rot: 180, scale: [fit, tall, fit] },
    })
  }
  return mergedParts(parts, out)
}
