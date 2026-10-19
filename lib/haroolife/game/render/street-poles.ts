/**
 * CEET poles along Lomé's streets and the wires between them. The pole is a model of the pack
 * (`lome-poteau`, tools/blender): on the sidewalk at the kerb, its street lamp leaning over the
 * carriageway, one every three cells of a straight road; never at a crossroads (the traffic
 * lights stand there) nor in front of a door. One instanced mesh for the poles, one line set for
 * the sagging wires: two draw calls for the whole neighbourhood.
 */
import type { Model } from '@/lib/haroolife/city/pack'
import { CELL, worldLots } from '@/lib/haroolife/city/world'
import * as THREE from 'three'
import type { GroundKind } from '../core/street'

const SPACING = 3
/** From the road cell's centre to the pole: just past the road's edge, on the kerb side. */
const KERB = 0.54
/** Wire attachments on the pole's crossarm (metres): height, then across the street. */
const WIRE_HEIGHT = 8.55
const WIRE_SPAN = [-0.8, 0.8]
const SAG = 0.55

export interface PolePlace {
  /** Road cell the pole stands beside, and the side of its plot. */
  x: number
  y: number
  dx: number
  dy: number
}

const isRoad = (k: GroundKind | undefined) => k === 'road' || k === 'estate-road'
const isPlot = (k: GroundKind | undefined) =>
  k === 'land' || k === 'estate' || k === 'sand' || k === 'hill'

let doorCells: Set<string> | null = null
/** Road cells in front of a lot's door (every lot of the town, computed once). */
function doors(): Set<string> {
  doorCells ??= new Set(worldLots().map((l) => `${l.door.x}:${l.door.y}`))
  return doorCells
}

/** Where the poles stand around the player (pure, in cells). */
export function polePlaces(
  cells: readonly { x: number; y: number; kind: GroundKind }[],
): PolePlace[] {
  const kind = new Map(cells.map((c) => [`${c.x}:${c.y}`, c.kind]))
  const at = (x: number, y: number) => kind.get(`${x}:${y}`)
  const out: PolePlace[] = []
  for (const c of cells) {
    if (c.kind !== 'road') continue
    const ns = isRoad(at(c.x, c.y - 1)) || isRoad(at(c.x, c.y + 1))
    const ew = isRoad(at(c.x - 1, c.y)) || isRoad(at(c.x + 1, c.y))
    if (ns === ew || doors().has(`${c.x}:${c.y}`)) continue
    // Along the road, one pole every SPACING cells; on each side that has a plot.
    if ((ns ? c.y : c.x) % SPACING !== 0) continue
    for (const [dx, dy] of ns
      ? ([
          [1, 0],
          [-1, 0],
        ] as const)
      : ([
          [0, 1],
          [0, -1],
        ] as const))
      if (isPlot(at(c.x + dx, c.y + dy))) out.push({ x: c.x, y: c.y, dx, dy })
  }
  return out
}

/** Geometry of a pack model, in its own units (shared by every pole). */
export function modelGeometry(m: Model): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3))
  g.setAttribute('color', new THREE.BufferAttribute(m.col, 3))
  g.setIndex(new THREE.BufferAttribute(m.idx, 1))
  g.computeBoundingSphere()
  return g
}

/**
 * The poles and their wires. `unit`: scene units per cell; `metre`: scene units per metre (the
 * adult's 1.75 m is the figure's height). The poles' geometry and material are the caller's
 * (shared); the wires' geometry belongs to the returned line set (`userData.ownsGeometry`).
 */
export function buildPoles(
  places: readonly PolePlace[],
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  wireMaterial: THREE.LineBasicMaterial,
  unit: number,
  metre: number,
): THREE.Object3D[] {
  if (!places.length) return []
  const poles = new THREE.InstancedMesh(geometry, material, places.length)
  poles.name = 'Poteaux CEET'
  const k = unit / CELL
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const s = new THREE.Vector3(k, k, k)
  const base = (p: PolePlace) =>
    new THREE.Vector3((p.x + p.dx * KERB) * unit, 0, (p.y + p.dy * KERB) * unit)
  // The lamp's arm (+Z of the model) over the road: towards (-dx, -dy).
  const yaw = (p: PolePlace) => Math.atan2(-p.dx, -p.dy)
  places.forEach((p, i) => {
    m.compose(base(p), q.setFromAxisAngle(up, yaw(p)), s)
    poles.setMatrixAt(i, m)
  })
  poles.castShadow = true
  poles.computeBoundingSphere()
  // Wires: from each pole to the next one along the same side of the road, sagging.
  const byKey = new Map(places.map((p) => [`${p.x}:${p.y}:${p.dx}:${p.dy}`, p]))
  const points: number[] = []
  const steps = 6
  for (const p of places) {
    const next = byKey.get(
      `${p.x + (p.dy ? SPACING : 0)}:${p.y + (p.dx ? SPACING : 0)}:${p.dx}:${p.dy}`,
    )
    if (!next) continue
    for (const across of WIRE_SPAN) {
      const end = (o: PolePlace) =>
        base(o).add(
          new THREE.Vector3(0, WIRE_HEIGHT * metre, -across * metre).applyAxisAngle(up, yaw(o)),
        )
      const a = end(p)
      const b = end(next)
      for (let i = 0; i < steps; i++)
        for (const t of [i / steps, (i + 1) / steps]) {
          const v = a.clone().lerp(b, t)
          points.push(v.x, v.y - SAG * metre * 4 * t * (1 - t), v.z)
        }
    }
  }
  const out: THREE.Object3D[] = [poles]
  if (points.length) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    const wires = new THREE.LineSegments(g, wireMaterial)
    wires.name = 'Fils CEET'
    wires.userData.ownsGeometry = true
    out.push(wires)
  }
  return out
}
