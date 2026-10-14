'use client'

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
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Character } from './character'
import { ThreeProbe } from './probe'

const FURNITURE = '/haroolife/vendor/kenney-3d/furniture-kit/'
/** Walking and running speeds indoors (scene units per second). */
const WALK = 1.9
const RUN = 3.4
const PLAYER_SCALE = 1.35
const NPC_SCALE = 1.3
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

/** The player: a kinematic capsule moved by Rapier's character controller, and its figure. */
function Player({
  layout,
  input,
  angle,
  activity,
  model,
  pagne,
  onLeave,
}: {
  layout: Layout
  input: InputState
  angle: number
  activity: { prop: string; anim: NpcAnim } | null
  model: string
  pagne?: string
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
  const [anim, setAnim] = useState<NpcAnim>('idle')
  const [speedRate, setSpeedRate] = useState(1)
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

  // Starting an activity: the body steps in front of the equipment (free floor), the figure
  // takes the activity pose on it.
  useEffect(() => {
    setAway(false)
    if (!activity) return
    const prop = layout.props.find((p) => p.id === activity.prop)
    const b = body.current
    if (!prop || !b) return
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
    let vx = 0
    let vz = 0
    let running = false
    if (mag > 0.12) {
      const m = Math.min(1, mag)
      running = input.run || m >= 0.92
      const speed = (running ? RUN : WALK) * m
      vx = ((rx * input.x + fx * input.y) / mag) * speed
      vz = ((rz * input.x + fz * input.y) / mag) * speed
      if (used) setAway(true)
    }
    controller.computeColliderMovement(col, { x: vx * dt, y: -2 * dt, z: vz * dt })
    const mv = controller.computedMovement()
    const t = b.translation()
    const next = { x: t.x + mv.x, y: Math.max(CENTER, t.y + mv.y), z: t.z + mv.z }
    b.setNextKinematicTranslation(next)
    const moved = Math.hypot(mv.x, mv.z) / Math.max(dt, 1e-3)
    if (moved > 0.05) {
      const want = Math.atan2(mv.x, mv.z)
      let d = want - heading.current
      d = Math.atan2(Math.sin(d), Math.cos(d))
      heading.current += d * Math.min(1, dt * 12)
    }

    let nextAnim: NpcAnim
    if (used) {
      const off = used.kind === 'treadmill' ? 0.15 : used.kind === 'bench-press' ? 0.35 : 0.3
      const p = new THREE.Vector3(0, 0, off)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), deg(used.rot ?? 0))
        .add(new THREE.Vector3(used.x, 0, used.z))
      fig.position.copy(p)
      fig.rotation.y = deg((used.rot ?? 0) + 180)
      nextAnim = activity?.anim ?? 'idle'
    } else {
      fig.position.set(next.x, next.y - CENTER, next.z)
      fig.rotation.y = heading.current
      nextAnim = moved > 0.15 ? (running ? 'run' : 'walk') : 'idle'
    }
    if (nextAnim !== anim) setAnim(nextAnim)
    const rate = nextAnim === 'walk' ? Math.min(1.5, Math.max(0.6, moved / WALK)) : 1
    if (Math.abs(rate - speedRate) > 0.1) setSpeedRate(rate)

    // Walking out of an open side leaves the building (once).
    if (!left.current && (next.z > layout.d / 2 + 0.25 || next.x > layout.w / 2 + 0.25)) {
      left.current = true
      onLeave()
    }

    // Follow camera: a close three-quarter view that keeps the player in frame.
    target.current.lerp(fig.position, 1 - Math.exp(-dt * 6))
    const dist = 9.5
    camera.position.set(
      target.current.x + Math.sin(a) * dist,
      target.current.y + dist * 0.78,
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
        speed={speedRate}
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
  return (
    <Character
      ref={ref}
      name={`npc:${npc.id}`}
      model={npc.model}
      anim={npc.anim}
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
}: InteriorViewProps) {
  const room = useRoom(layout)
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
      <hemisphereLight args={['#eef4ff', '#6b5a45', 1.15]} />
      <directionalLight position={[6, 10, 5]} intensity={1.7} />
      <directionalLight position={[-4, 5, -8]} intensity={0.5} />
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
            onUse(prop)
          }}
        >
          <boxGeometry />
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
            model={n.model}
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
