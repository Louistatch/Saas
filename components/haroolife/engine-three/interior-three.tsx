'use client'

import { INTERIOR_SCALE, adultFor } from '@/lib/haroolife/city/avatar-catalogue'
import type { Layout, Npc, NpcAnim, Prop } from '@/lib/haroolife/city/interiors'
import type { InputState } from '@/lib/haroolife/city/player'
import {
  SHAPE_MATERIALS,
  type ShapeMaterial,
  type ShapePart,
  footprintOf,
  shapeOf,
} from '@/lib/haroolife/city/prop-shapes'
import type { InteriorViewProps } from '@/lib/haroolife/engine/types'
/**
 * An interior drawn by React Three Fiber, with Rapier collisions (jalon J1, behind
 * `?engine=three`). Same layouts, props, characters and actions as the PlayCanvas interior,
 * three differences:
 * - the player walks freely in the room (joystick or keyboard) instead of standing at the
 *   entrance, and walks out of an open side (the two cut-away sides) to leave;
 * - walls and furniture are solid (Rapier kinematic character controller, slides along them);
 * - all static geometry is merged into one mesh per material, so the room costs a handful of
 *   draw calls instead of one per piece.
 */
import { useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  CapsuleCollider,
  CuboidCollider,
  Physics,
  type RapierCollider,
  type RapierRigidBody,
  RigidBody,
  useRapier,
} from '@react-three/rapier'
import { type MutableRefObject, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Character } from './character'
import { ThreeProbe } from './probe'

const FURNITURE = '/haroolife/vendor/kenney-3d/furniture-kit/'
/**
 * Walking and running speeds indoors (scene units per second). V3: matched to the figure size
 * (INTERIOR_SCALE, about 1.07 units tall) so the walk and run clips play near their natural
 * rate; the former 1.9 / 3.4 made the feet glide.
 */
const WALK = 1
const RUN = 2
const PLAYER_SCALE = INTERIOR_SCALE
const NPC_SCALE = INTERIOR_SCALE
/** Equipment the figure stands on (gym machines); for everything else it stands beside it. */
const ON_DEVICE = new Set(['treadmill', 'bike', 'bench-press', 'mat'])
/** Seconds without getting closer before an approach gives up. */
const STUCK_AFTER = 1.6
/** Player capsule: radius and half height of the straight part; its centre sits at CENTER. */
const RADIUS = 0.24
const HALF = 0.3
const CENTER = HALF + RADIUS
/** Width of the doormat at the entrance (layout spawn), on the open front of the room. */
const DOOR_WIDTH = 1.7

const deg = THREE.MathUtils.degToRad
type V3 = [number, number, number]
type Box = { center: V3; half: V3; rotY: number }

function partGeometry(part: Exclude<ShapePart, { t: 'model' }>): THREE.BufferGeometry {
  const g =
    part.t === 'box'
      ? new THREE.BoxGeometry(1, 1, 1)
      : part.t === 'cyl'
        ? new THREE.CylinderGeometry(part.r, part.r, part.h, 14)
        : new THREE.SphereGeometry(part.r, 14, 10)
  const rot = part.t === 'ball' ? undefined : part.rot
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...part.p),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(deg(rot?.[0] ?? 0), deg(rot?.[1] ?? 0), deg(rot?.[2] ?? 0)),
    ),
    part.t === 'box' ? new THREE.Vector3(...part.s) : new THREE.Vector3(1, 1, 1),
  )
  g.applyMatrix4(m)
  return g
}

const placement = (x: number, z: number, rotY: number) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, 0, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deg(rotY)),
    new THREE.Vector3(1, 1, 1),
  )

function standardMaterial(key: ShapeMaterial | 'floor' | 'wall' | 'trim', layout: Layout) {
  if (key === 'floor' || key === 'wall' || key === 'trim') {
    const color = key === 'floor' ? layout.floor : key === 'wall' ? layout.wall : layout.trim
    return new THREE.MeshStandardMaterial({ color, roughness: key === 'floor' ? 0.85 : 0.95 })
  }
  const s = SHAPE_MATERIALS[key]
  return new THREE.MeshStandardMaterial({
    color: s.color,
    roughness: 1 - s.gloss * 0.8,
    metalness: s.metalness ?? 0,
    emissive: s.emissive ? new THREE.Color(s.emissive) : undefined,
  })
}

/** Walls, floor, trims and the window of the cut-away room, as parts in world space. */
function roomParts(layout: Layout) {
  const W = layout.w
  const D = layout.d
  const b = (p: V3, s: V3, m: ShapeMaterial | 'floor' | 'wall' | 'trim') => ({ p, s, m })
  return [
    b([0, -0.14, 0], [W, 0.24, D], 'floor'),
    b([0, 1.8, -D / 2], [W, 3.8, 0.2], 'wall'),
    b([-W / 2, 1.8, 0], [0.2, 3.8, D], 'wall'),
    b([0, 3.7, -D / 2], [W, 0.18, 0.25], 'trim'),
    b([-W / 2, 3.7, 0], [0.25, 0.18, D], 'trim'),
    b([0, 0.12, -D / 2 + 0.12], [W, 0.24, 0.06], 'trim'),
    b([-W / 2 + 0.12, 0.12, 0], [0.06, 0.24, D], 'trim'),
    b([-W / 2 + 0.08, 2.3, 1.4], [0.16, 1.3, 2.2], 'trim'),
    b([-W / 2 + 0.2, 2.3, 1.4], [0.1, 1.05, 1.95], 'glass'),
    // Doormat at the entrance: where to walk out.
    b([layout.spawn.x, 0.005, D / 2 - 0.35], [DOOR_WIDTH, 0.01, 0.7], 'green'),
  ]
}

/**
 * Everything static in the room, merged into one geometry per material, plus the collision
 * boxes of the furniture and the click targets of the equipment.
 */
function useRoom(layout: Layout) {
  const models = useMemo(() => {
    const names = new Set<string>()
    for (const p of layout.props)
      for (const part of shapeOf(p.kind)) if (part.t === 'model') names.add(part.name)
    return [...names]
  }, [layout])
  const loaded = useGLTF(models.map((n) => `${FURNITURE}${n}.glb`))
  const gltfs = useMemo(() => {
    const map = new Map<string, THREE.Object3D>()
    models.forEach((n, i) => {
      const g = (Array.isArray(loaded) ? loaded[i] : loaded) as { scene: THREE.Object3D }
      if (g) map.set(n, g.scene)
    })
    return map
  }, [models, loaded])

  const room = useMemo(() => {
    const groups = new Map<
      string,
      { material: THREE.Material; geometries: THREE.BufferGeometry[] }
    >()
    const own: THREE.Material[] = []
    const add = (key: string, material: () => THREE.Material, g: THREE.BufferGeometry) => {
      let group = groups.get(key)
      if (!group) {
        const m = material()
        group = { material: m, geometries: [] }
        groups.set(key, group)
      }
      group.geometries.push(g)
    }
    const mat = (key: ShapeMaterial | 'floor' | 'wall' | 'trim') => () => {
      const m = standardMaterial(key, layout)
      own.push(m)
      return m
    }
    for (const part of roomParts(layout)) {
      add(`std:${part.m}`, mat(part.m), partGeometry({ t: 'box', p: part.p, s: part.s, m: 'dark' }))
    }

    const colliders: Box[] = []
    const targets: { prop: Prop; box: Box }[] = []
    for (const prop of layout.props) {
      const at = placement(prop.x, prop.z, prop.rot ?? 0)
      const bounds = new THREE.Box3()
      for (const part of shapeOf(prop.kind)) {
        if (part.t !== 'model') {
          const g = partGeometry(part)
          g.applyMatrix4(at)
          add(`std:${part.m}`, mat(part.m), g)
          continue
        }
        const scene = gltfs.get(part.name)
        if (!scene) continue
        scene.updateMatrixWorld(true)
        const local = new THREE.Matrix4().multiplyMatrices(
          at,
          new THREE.Matrix4().compose(
            new THREE.Vector3(...part.p),
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              deg(part.rotY ?? 0),
            ),
            new THREE.Vector3(part.scale, part.scale, part.scale),
          ),
        )
        scene.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh) return
          const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone())
            .applyMatrix4(mesh.matrixWorld)
            .applyMatrix4(local)
          g.computeBoundingBox()
          if (g.boundingBox) bounds.union(g.boundingBox)
          const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
          const signature = Object.keys(g.attributes).sort().join(',')
          // The GLB's own material (shared through the loader cache, never disposed here).
          add(`glb:${material.uuid}:${signature}`, () => material, g)
        })
      }
      // Collision volume: the primitive footprint, or the loaded model's bounds. Thin pieces
      // (mats, the doormat) and wall-mounted ones stay walkable.
      const fp = footprintOf(prop.kind)
      let box: Box | null = null
      if (fp && fp.h > 0.15) {
        const c = new THREE.Vector3(fp.cx, fp.h / 2, fp.cz).applyMatrix4(at)
        box = { center: [c.x, c.y, c.z], half: [fp.hx, fp.h / 2, fp.hz], rotY: prop.rot ?? 0 }
      } else if (!bounds.isEmpty() && bounds.max.y - bounds.min.y > 0.15) {
        const c = bounds.getCenter(new THREE.Vector3())
        const s = bounds.getSize(new THREE.Vector3())
        box = { center: [c.x, c.y, c.z], half: [s.x / 2, s.y / 2, s.z / 2], rotY: 0 }
      }
      if (box) colliders.push(box)
      if (prop.action)
        targets.push({
          prop,
          box: box ?? { center: [prop.x, 0.5, prop.z], half: [0.5, 0.5, 0.5], rotY: prop.rot ?? 0 },
        })
    }

    const meshes: { key: string; geometry: THREE.BufferGeometry; material: THREE.Material }[] = []
    for (const [key, group] of groups) {
      const merged = mergeGeometries(group.geometries, false)
      if (merged) {
        meshes.push({ key, geometry: merged, material: group.material })
        for (const g of group.geometries) g.dispose()
      } else {
        group.geometries.forEach((g, i) =>
          meshes.push({ key: `${key}:${i}`, geometry: g, material: group.material }),
        )
      }
    }
    return { meshes, colliders, targets, own }
  }, [layout, gltfs])

  useEffect(
    () => () => {
      for (const m of room.meshes) m.geometry.dispose()
      for (const m of room.own) m.dispose()
    },
    [room],
  )
  return room
}

/** Where the player is heading: equipment, a character, or a point of the floor. */
type Goal =
  | { kind: 'prop'; prop: Prop; x: number; z: number; face: number }
  | { kind: 'npc'; npc: Npc; x: number; z: number; face: number }
  | { kind: 'point'; x: number; z: number }

/** True when a capsule standing at (x, z) touches no collider and stays inside the room. */
function freeAt(x: number, z: number, layout: Layout, boxes: Box[]): boolean {
  if (Math.abs(x) > layout.w / 2 - RADIUS - 0.05 || z < -layout.d / 2 + RADIUS + 0.05) return false
  if (z > layout.d / 2 - 0.1) return false
  for (const b of boxes) {
    const a = -deg(b.rotY)
    const dx = x - b.center[0]
    const dz = z - b.center[2]
    const lx = dx * Math.cos(a) + dz * Math.sin(a)
    const lz = -dx * Math.sin(a) + dz * Math.cos(a)
    if (Math.abs(lx) < b.half[0] + RADIUS && Math.abs(lz) < b.half[2] + RADIUS) return false
  }
  return true
}

/**
 * A free spot just outside a target's footprint, front first (the side it faces), then the
 * other sides, nearest to the player among the free ones of equal rank. Null when none.
 */
function approachPoint(
  target: { x: number; z: number; rot: number; half: [number, number] },
  layout: Layout,
  boxes: Box[],
  from: { x: number; z: number },
): { x: number; z: number; face: number } | null {
  const r = deg(target.rot)
  for (const sides of [[0], [90, -90], [180]]) {
    const spots = sides
      .map((side) => {
        const a = r + deg(side)
        const dx = Math.sin(a)
        const dz = Math.cos(a)
        // Extent of the (rotated) footprint along this direction.
        const ext =
          Math.abs(dx * Math.cos(r) - dz * Math.sin(r)) * target.half[0] +
          Math.abs(dx * Math.sin(r) + dz * Math.cos(r)) * target.half[1]
        const d = ext + RADIUS + 0.12
        return { x: target.x + dx * d, z: target.z + dz * d }
      })
      .filter((p) => freeAt(p.x, p.z, layout, boxes))
      .sort(
        (a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z),
      )
    const p = spots[0]
    if (p) return { ...p, face: Math.atan2(target.x - p.x, target.z - p.z) }
  }
  return null
}

/** True when the straight walk from a to b stays on free floor (sampled every 0.1 u). */
function clearLine(
  a: { x: number; z: number },
  b: { x: number; z: number },
  layout: Layout,
  boxes: Box[],
): boolean {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1)
  for (let i = 1; i <= n; i++) {
    const t = i / n
    if (!freeAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, layout, boxes)) return false
  }
  return true
}

/**
 * Waypoints from the player to a goal around the furniture: A* on a 0.25 u grid of free floor
 * (8 neighbours), then shortened to the turns that are really needed. A straight line when it
 * is already clear; the goal alone when no path exists (the stuck check then reports it).
 */
export function planPath(
  from: { x: number; z: number },
  to: { x: number; z: number },
  layout: Layout,
  boxes: Box[],
): { x: number; z: number }[] {
  if (clearLine(from, to, layout, boxes)) return [to]
  const S = 0.25
  const nx = Math.floor(layout.w / S) + 1
  const nz = Math.floor(layout.d / S) + 1
  const x0 = -layout.w / 2
  const z0 = -layout.d / 2
  const cell = (p: { x: number; z: number }) => [
    Math.max(0, Math.min(nx - 1, Math.round((p.x - x0) / S))),
    Math.max(0, Math.min(nz - 1, Math.round((p.z - z0) / S))),
  ]
  const pos = (i: number, j: number) => ({ x: x0 + i * S, z: z0 + j * S })
  const free = new Uint8Array(nx * nz)
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const q = pos(i, j)
      free[j * nx + i] = freeAt(q.x, q.z, layout, boxes) ? 1 : 0
    }
  const [si, sj] = cell(from)
  const [gi, gj] = cell(to)
  const start = sj * nx + si
  const end = gj * nx + gi
  free[start] = 1
  free[end] = 1
  const g = new Float32Array(nx * nz).fill(Number.POSITIVE_INFINITY)
  const prev = new Int32Array(nx * nz).fill(-1)
  const closed = new Uint8Array(nx * nz)
  const h = (k: number) => Math.hypot((k % nx) - gi, Math.floor(k / nx) - gj)
  const open: number[] = [start]
  g[start] = 0
  while (open.length > 0) {
    let best = 0
    for (let k = 1; k < open.length; k++)
      if (g[open[k]] + h(open[k]) < g[open[best]] + h(open[best])) best = k
    const cur = open.splice(best, 1)[0]
    if (cur === end) break
    if (closed[cur]) continue
    closed[cur] = 1
    const ci = cur % nx
    const cj = Math.floor(cur / nx)
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const ni = ci + di
        const njj = cj + dj
        if ((di === 0 && dj === 0) || ni < 0 || njj < 0 || ni >= nx || njj >= nz) continue
        const k = njj * nx + ni
        // No corner cutting: a diagonal step needs both side cells free.
        if (!free[k] || closed[k]) continue
        if (di !== 0 && dj !== 0 && (!free[cj * nx + ni] || !free[njj * nx + ci])) continue
        const cost = g[cur] + (di !== 0 && dj !== 0 ? Math.SQRT2 : 1)
        if (cost < g[k]) {
          g[k] = cost
          prev[k] = cur
          open.push(k)
        }
      }
  }
  if (prev[end] === -1) return [to]
  const cells: { x: number; z: number }[] = []
  for (let k = prev[end]; k !== -1 && k !== start; k = prev[k])
    cells.unshift(pos(k % nx, Math.floor(k / nx)))
  // Keep only the turns: skip every waypoint the previous kept one can see past.
  const pts: { x: number; z: number }[] = []
  let at = from
  const all = [...cells, to]
  let i = 0
  while (i < all.length - 1) {
    let j = all.length - 1
    while (j > i && !clearLine(at, all[j], layout, boxes)) j--
    if (j === i) {
      pts.push(all[i])
      at = all[i]
      i++
    } else {
      pts.push(all[j])
      at = all[j]
      i = j
    }
  }
  if (pts[pts.length - 1] !== to) pts.push(to)
  return pts
}

/**
 * The player: a kinematic capsule moved by Rapier's character controller, and its figure.
 * Joystick and keyboard steer it; a goal (equipment, character or floor point tapped, or an
 * activity button of the HUD) makes it walk there itself, turn to the target and only then
 * report the arrival. A goal that stops getting closer is abandoned and reported.
 */
function Player({
  layout,
  input,
  angle,
  activity,
  model,
  pagne,
  goal,
  boxes,
  onArrive,
  onStuck,
  onPosition,
  onLeave,
}: {
  layout: Layout
  input: InputState
  angle: number
  activity: { prop: string; anim: NpcAnim } | null
  model: string
  pagne?: string
  goal: MutableRefObject<Goal | null>
  boxes: Box[]
  onArrive: (g: Goal) => void
  onStuck: (g: Goal) => void
  onPosition: (x: number, z: number) => void
  onLeave: () => void
}) {
  const { world } = useRapier()
  const camera = useThree((s) => s.camera)
  const body = useRef<RapierRigidBody | null>(null)
  const collider = useRef<RapierCollider | null>(null)
  const figure = useRef<THREE.Group | null>(null)
  const heading = useRef(Math.PI)
  const target = useRef(new THREE.Vector3(layout.spawn.x, 0, layout.spawn.z))
  const left = useRef(false)
  const progress = useRef({ best: Number.POSITIVE_INFINITY, since: 0 })
  // Waypoints planned around the furniture for the current goal (recomputed when it changes).
  const path = useRef<{ goal: Goal | null; pts: { x: number; z: number }[] }>({
    goal: null,
    pts: [],
  })
  const [anim, setAnim] = useState<NpcAnim>('idle')
  const [ground, setGround] = useState(0)
  // The equipment in use is shown until the player walks away from it.
  const [away, setAway] = useState(false)
  const used = activity && !away ? layout.props.find((p) => p.id === activity.prop) : undefined

  const controller = useMemo(() => {
    const c = world.createCharacterController(0.02)
    c.setSlideEnabled(true)
    c.enableSnapToGround(0.3)
    c.enableAutostep(0.3, 0.2, false)
    return c
  }, [world])
  useEffect(() => () => world.removeCharacterController(controller), [world, controller])

  // Starting an activity on a machine one stands on (treadmill, bike…): the body steps onto
  // its free front. Beside any other equipment the player is already where it walked to.
  useEffect(() => {
    setAway(false)
    if (!activity) return
    const prop = layout.props.find((p) => p.id === activity.prop)
    const b = body.current
    if (!prop || !b || !ON_DEVICE.has(prop.kind)) return
    const front = new THREE.Vector3(0, 0, 0.95)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), deg(prop.rot ?? 0))
      .add(new THREE.Vector3(prop.x, CENTER, prop.z))
    b.setTranslation({ x: front.x, y: front.y, z: front.z }, true)
  }, [activity, layout])

  useFrame((_, rawDt) => {
    const b = body.current
    const col = collider.current
    const fig = figure.current
    if (!b || !col || !fig) return
    // Same cap as the street controller (250 ms): on a slow phone the player keeps their real
    // speed. Safe against walls: the character controller sweeps the capsule along the move.
    const dt = Math.min(rawDt, 0.25)
    // Joystick up walks away from the camera, as in the street.
    const a = deg(angle)
    const fx = -Math.sin(a)
    const fz = -Math.cos(a)
    const rx = Math.cos(a)
    const rz = -Math.sin(a)
    const mag = Math.hypot(input.x, input.y)
    const t = b.translation()
    let vx = 0
    let vz = 0
    let running = false
    if (mag > 0.12) {
      // The stick always wins: it cancels any walk towards a target.
      goal.current = null
      const m = Math.min(1, mag)
      running = input.run || m >= 0.92
      const speed = (running ? RUN : WALK) * m
      vx = ((rx * input.x + fx * input.y) / mag) * speed
      vz = ((rz * input.x + fz * input.y) / mag) * speed
      if (used) setAway(true)
    } else if (goal.current) {
      const g = goal.current
      if (path.current.goal !== g)
        path.current = { goal: g, pts: planPath({ x: t.x, z: t.z }, g, layout, boxes) }
      const pts = path.current.pts
      // Intermediate waypoints are passed within 0.2 u; the last one is the goal itself.
      while (pts.length > 1 && Math.hypot(pts[0].x - t.x, pts[0].z - t.z) < 0.2) pts.shift()
      const w = pts[0] ?? g
      const dx = w.x - t.x
      const dz = w.z - t.z
      const d = Math.hypot(dx, dz)
      // Distance left along the path: decides run or walk and the slow-down.
      let remain = d
      for (let k = 1; k < pts.length; k++)
        remain += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z)
      if (pts.length <= 1 && d < 0.1) {
        goal.current = null
        progress.current = { best: Number.POSITIVE_INFINITY, since: 0 }
        if (g.kind !== 'point') heading.current = g.face
        onArrive(g)
      } else {
        // Slow down on the last steps so the stop lands on the spot.
        const speed = Math.min(remain > 2.5 ? RUN : WALK, remain / Math.max(dt, 1e-3))
        running = remain > 2.5
        vx = (dx / d) * speed
        vz = (dz / d) * speed
        if (used) setAway(true)
        const pr = progress.current
        if (remain < pr.best - 0.04) progress.current = { best: remain, since: 0 }
        else pr.since += dt
        if (pr.since > STUCK_AFTER) {
          goal.current = null
          progress.current = { best: Number.POSITIVE_INFINITY, since: 0 }
          onStuck(g)
        }
      }
    }
    controller.computeColliderMovement(col, { x: vx * dt, y: -2 * dt, z: vz * dt })
    const mv = controller.computedMovement()
    const next = { x: t.x + mv.x, y: Math.max(CENTER, t.y + mv.y), z: t.z + mv.z }
    b.setNextKinematicTranslation(next)
    onPosition(next.x, next.z)
    // Speed really achieved (after collisions): it alone decides walk, run or idle.
    const moved = Math.hypot(mv.x, mv.z) / Math.max(dt, 1e-3)
    if (moved > 0.05) {
      const want = Math.atan2(mv.x, mv.z)
      let d = want - heading.current
      d = Math.atan2(Math.sin(d), Math.cos(d))
      heading.current += d * Math.min(1, dt * 12)
    }

    let nextAnim: NpcAnim
    if (used && ON_DEVICE.has(used.kind)) {
      const off = used.kind === 'treadmill' ? 0.15 : used.kind === 'bench-press' ? 0.35 : 0.3
      const p = new THREE.Vector3(0, 0, off)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), deg(used.rot ?? 0))
        .add(new THREE.Vector3(used.x, 0, used.z))
      fig.position.copy(p)
      fig.rotation.y = deg(used.rot ?? 0)
      nextAnim = activity?.anim ?? 'idle'
    } else if (used) {
      // Beside the equipment, facing it (no clip of the pack lies on a bed or sits on a sofa:
      // the figure stays on its feet next to it rather than sinking through it).
      fig.position.set(next.x, next.y - CENTER, next.z)
      fig.rotation.y = Math.atan2(used.x - next.x, used.z - next.z)
      nextAnim = activity?.anim ?? 'idle'
    } else {
      fig.position.set(next.x, next.y - CENTER, next.z)
      fig.rotation.y = heading.current
      nextAnim = moved > 0.15 ? (running && moved > WALK + 0.2 ? 'run' : 'walk') : 'idle'
    }
    if (nextAnim !== anim) setAnim(nextAnim)
    const g = nextAnim === 'walk' || nextAnim === 'run' ? Math.round(moved * 10) / 10 : 0
    if (Math.abs(g - ground) > 0.09) setGround(g)

    // Walking out of an open side leaves the building (once).
    if (!left.current && (next.z > layout.d / 2 + 0.25 || next.x > layout.w / 2 + 0.25)) {
      left.current = true
      onLeave()
    }

    // Follow camera: a close three-quarter view (about 40° of elevation, the reference's
    // framing) that keeps the player readable and the furniture identifiable without zooming.
    target.current.lerp(fig.position, 1 - Math.exp(-dt * 6))
    const dist = 7.2
    camera.position.set(
      target.current.x + Math.sin(a) * dist,
      target.current.y + dist * 0.84,
      target.current.z + Math.cos(a) * dist,
    )
    camera.lookAt(target.current.x, target.current.y + 0.6, target.current.z)

    const w = window as unknown as { __LOME_INTERIOR?: unknown }
    w.__LOME_INTERIOR = {
      x: next.x,
      z: next.z,
      anim: nextAnim,
      using: used?.id ?? null,
      left: left.current,
      goal: goal.current
        ? goal.current.kind === 'prop'
          ? goal.current.prop.id
          : goal.current.kind
        : null,
      // Forward of the rendered figure (+Z of the model after every rotation) and speed: the
      // walk proof compares them with the displacement.
      facing: { x: Math.sin(fig.rotation.y), z: Math.cos(fig.rotation.y) },
      speed: moved,
    }
  })
  useEffect(
    () => () => {
      ;(window as unknown as { __LOME_INTERIOR?: unknown }).__LOME_INTERIOR = undefined
    },
    [],
  )

  return (
    <>
      <RigidBody
        ref={body}
        type="kinematicPosition"
        colliders={false}
        position={[layout.spawn.x, CENTER, layout.spawn.z]}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider ref={collider} args={[HALF, RADIUS]} />
      </RigidBody>
      <Character
        ref={figure}
        name="Joueur"
        model={model}
        anim={anim}
        groundSpeed={ground}
        pagne={pagne}
        scale={PLAYER_SCALE}
      />
    </>
  )
}

/** A character walking back and forth between two points. */
function Mover({ npc }: { npc: Npc }) {
  const ref = useRef<THREE.Group | null>(null)
  const t = useRef(0)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    t.current += dt
    const to = npc.to ?? { x: npc.x, z: npc.z }
    const u = (t.current % 6) / 6
    const k = u < 0.5 ? u * 2 : 2 - u * 2
    g.position.set(npc.x + (to.x - npc.x) * k, 0, npc.z + (to.z - npc.z) * k)
    const dir = u < 0.5 ? 1 : -1
    g.rotation.y = Math.atan2((to.x - npc.x) * dir, (to.z - npc.z) * dir)
  })
  // One leg of the trip every 3 s: its ground speed sets the walk cadence.
  const to = npc.to ?? { x: npc.x, z: npc.z }
  const ground = Math.hypot(to.x - npc.x, to.z - npc.z) / 3
  return (
    <Character
      ref={ref}
      name={`npc:${npc.id}`}
      model={adultFor(npc.model)}
      anim={npc.anim}
      groundSpeed={npc.anim === 'walk' || npc.anim === 'run' ? ground : undefined}
      scale={NPC_SCALE}
    />
  )
}

function Room({
  layout,
  title,
  angle,
  activity,
  playerModel,
  playerPagne,
  onUse,
  input,
  onLeave,
  approach,
  onTalk,
  onNotice,
}: InteriorViewProps) {
  const room = useRoom(layout)
  const goal = useRef<Goal | null>(null)
  const playerAt = useRef({ x: layout.spawn.x, z: layout.spawn.z })
  const boxes = useMemo(() => [...room.colliders], [room])
  /** Sets a goal next to a piece of equipment; refuses to act from afar when none is free. */
  const goToProp = (prop: Prop) => {
    if (
      activity?.prop === prop.id ||
      (goal.current?.kind === 'prop' && goal.current.prop.id === prop.id)
    )
      return
    const t = room.targets.find((x) => x.prop.id === prop.id)
    const box = t?.box
    const spot = approachPoint(
      {
        x: box ? box.center[0] : prop.x,
        z: box ? box.center[2] : prop.z,
        rot: box ? box.rotY : (prop.rot ?? 0),
        half: box ? [box.half[0], box.half[2]] : [0.4, 0.4],
      },
      layout,
      boxes,
      playerAt.current,
    )
    if (!spot) {
      onNotice?.(`Impossible d’atteindre : ${prop.label ?? 'cet équipement'}.`)
      return
    }
    goal.current = { kind: 'prop', prop, ...spot }
  }
  const lastRequest = useRef(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: one goal per request number
  useEffect(() => {
    if (!approach || approach.n === lastRequest.current) return
    lastRequest.current = approach.n
    const prop = layout.props.find((p) => p.id === approach.prop)
    if (prop) goToProp(prop)
  }, [approach])
  const W = layout.w
  const D = layout.d
  const highlight = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f4c84a' }), [])
  const invisible = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), [])
  useEffect(
    () => () => {
      highlight.dispose()
      invisible.dispose()
    },
    [highlight, invisible],
  )
  const active = activity ? layout.props.find((p) => p.id === activity.prop) : undefined

  return (
    <>
      {/* Warm daylight: light floors, walls that stay readable, the figure detached from the back. */}
      <hemisphereLight args={['#fff6e6', '#8a7a62', 1.45]} />
      <directionalLight position={[6, 10, 5]} intensity={1.9} color="#fff1dc" />
      <directionalLight position={[-4, 5, -8]} intensity={0.7} color="#dfe9ff" />
      {room.meshes.map((m) => (
        <mesh key={m.key} name={`static:${m.key}`} geometry={m.geometry} material={m.material} />
      ))}
      {active && (
        <mesh position={[active.x, 0.02, active.z]} material={highlight}>
          <cylinderGeometry args={[0.7, 0.7, 0.02, 24]} />
        </mesh>
      )}
      {room.targets.map(({ prop, box }) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: a 3D mesh, not a DOM node; every action also has a keyboard-reachable button in the HUD's activity list.
        <mesh
          key={prop.id}
          name={`prop:${prop.id}`}
          position={box.center}
          rotation={[0, deg(box.rotY), 0]}
          scale={[box.half[0] * 2, box.half[1] * 2, box.half[2] * 2]}
          material={invisible}
          onClick={(e) => {
            e.stopPropagation()
            goToProp(prop)
          }}
        >
          <boxGeometry />
        </mesh>
      ))}
      {/* Touching the floor walks there (inside the room). */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: a 3D mesh; the joystick and keyboard also move the player. */}
      <mesh
        name="sol"
        position={[0, 0.005, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={invisible}
        onClick={(e) => {
          e.stopPropagation()
          const x = Math.max(-W / 2 + 0.4, Math.min(W / 2 - 0.4, e.point.x))
          const z = Math.max(-D / 2 + 0.4, Math.min(D / 2 - 0.3, e.point.z))
          goal.current = { kind: 'point', x, z }
        }}
      >
        <planeGeometry args={[W, D]} />
      </mesh>
      {/* Touching a resident walks up to them, then opens the conversation. */}
      {layout.npcs
        .filter((n) => !n.to)
        .map((n) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: a 3D mesh; residents are also listed in the HUD.
          <mesh
            key={`hit-${n.id}`}
            name={`npc-hit:${n.id}`}
            position={[n.x, 0.6, n.z]}
            material={invisible}
            onClick={(e) => {
              e.stopPropagation()
              const spot = approachPoint(
                { x: n.x, z: n.z, rot: n.rot ?? 0, half: [0.25, 0.25] },
                layout,
                boxes,
                playerAt.current,
              )
              if (!spot) {
                onNotice?.('Impossible de rejoindre cette personne.')
                return
              }
              goal.current = { kind: 'npc', npc: n, ...spot }
            }}
          >
            <cylinderGeometry args={[0.35, 0.35, 1.2, 10]} />
          </mesh>
        ))}
      {/* Solid world: the floor and the two walls drawn. The two cut-away sides, facing the
          camera, are the way out: walking past either leaves the building. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[W / 2, 0.1, D / 2]} position={[0, -0.1, 0]} />
        <CuboidCollider args={[W / 2, 2, 0.1]} position={[0, 2, -D / 2]} />
        <CuboidCollider args={[0.1, 2, D / 2]} position={[-W / 2, 2, 0]} />
        {room.colliders.map((c) => (
          <CuboidCollider
            key={`${c.center.join(',')}`}
            args={c.half}
            position={c.center}
            rotation={[0, deg(c.rotY), 0]}
          />
        ))}
      </RigidBody>
      {layout.npcs.map((n) =>
        n.to ? (
          <Mover key={n.id} npc={n} />
        ) : (
          <Character
            key={n.id}
            name={`npc:${n.id}`}
            model={
              n.anim === 'sit' || n.anim === 'rest' || n.anim === 'drive'
                ? n.model
                : adultFor(n.model)
            }
            position={[n.x, 0, n.z]}
            rotation={n.rot ?? 0}
            anim={n.anim}
            scale={NPC_SCALE}
          />
        ),
      )}
      <Player
        layout={layout}
        input={input}
        angle={angle}
        activity={activity}
        model={playerModel}
        pagne={playerPagne}
        goal={goal}
        boxes={boxes}
        onArrive={(g) => {
          // Reached and facing the target: the action runs now, once.
          if (g.kind === 'prop') onUse(g.prop)
          else if (g.kind === 'npc') onTalk?.(g.npc)
        }}
        onStuck={(g) =>
          onNotice?.(
            g.kind === 'prop'
              ? `Le chemin vers « ${g.prop.label ?? 'l’équipement'} » est bloqué : rien n’a été fait.`
              : g.kind === 'npc'
                ? 'Le chemin vers cette personne est bloqué.'
                : 'On ne peut pas aller plus loin par là.',
          )
        }
        onPosition={(x, z) => {
          playerAt.current = { x, z }
        }}
        onLeave={onLeave}
      />
      <group name={`Intérieur ${title}`} position={[0, 3.9, 0]} />
    </>
  )
}

export default function InteriorThree(
  props: InteriorViewProps & {
    pixelRatio: number
    onFrame?: (s: { drawCalls: number; fps: number }) => void
  },
) {
  const { pixelRatio, onFrame, ...view } = props
  return (
    <Canvas
      className="h-full w-full"
      dpr={pixelRatio}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ fov: 50, near: 0.1, far: 120, position: [8, 8, 8] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.NeutralToneMapping
        scene.background = new THREE.Color('#b7d1ce')
        // A lost context (Android under memory pressure) is restored by the browser, not fatal.
        gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault())
      }}
    >
      <ThreeProbe onFrame={onFrame} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]}>
          <Room key={view.layout.name} {...view} />
        </Physics>
      </Suspense>
    </Canvas>
  )
}
