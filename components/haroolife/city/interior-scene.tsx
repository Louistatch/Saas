'use client'

import type { Layout, Npc, NpcAnim, Prop, PropKind } from '@/lib/haroolife/city/interiors'
import { SHAPE_MATERIALS, type ShapeMaterial, shapeOf } from '@/lib/haroolife/city/prop-shapes'
/**
 * A furnished interior built from a layout: original low-poly equipment (treadmills,
 * benches, racks, lockers, counters, pews, beds…) assembled from PlayCanvas primitives,
 * CC0 Kenney furniture for the everyday pieces, animated Kenney characters at work, and
 * the player performing the activity they chose. Every piece of equipment is a real 3D
 * object that can be clicked.
 */
import { Entity, Gltf } from '@playcanvas/react'
import { Camera, Light, Render } from '@playcanvas/react/components'
import { useAppEvent, useModel } from '@playcanvas/react/hooks'
import { useState } from 'react'
import { Character } from './character'
import { useMaterial } from './use-material'

const BASE = '/haroolife/vendor/kenney-3d/furniture-kit/'
type Mat = ReturnType<typeof useMaterial>
const surface = (k: ShapeMaterial) => {
  const { color, ...rest } = SHAPE_MATERIALS[k]
  return { diffuse: color, ...rest }
}
type Mats = Record<
  | 'dark'
  | 'steel'
  | 'black'
  | 'red'
  | 'blue'
  | 'yellow'
  | 'green'
  | 'wood'
  | 'white'
  | 'cloth'
  | 'glass'
  | 'grey'
  | 'water'
  | 'leaf'
  | 'trunk'
  | 'cream',
  Mat
>

function Furniture({
  name,
  position,
  scale = 1,
  rotation = 0,
}: { name: string; position: [number, number, number]; scale?: number; rotation?: number }) {
  const { asset } = useModel(`${BASE}${name}.glb`)
  if (!asset) return null
  return (
    <Entity position={position} rotation={[0, rotation, 0]} scale={[scale, scale, scale]}>
      <Gltf asset={asset} />
    </Entity>
  )
}
function Block({
  p,
  s,
  m,
  r,
}: {
  p: [number, number, number]
  s: [number, number, number]
  m: Mat
  r?: [number, number, number]
}) {
  return (
    <Entity position={p} scale={s} rotation={r}>
      <Render type="box" material={m} />
    </Entity>
  )
}
function Cyl({
  p,
  r,
  h,
  m,
  rot,
}: { p: [number, number, number]; r: number; h: number; m: Mat; rot?: [number, number, number] }) {
  return (
    <Entity position={p} scale={[r * 2, h, r * 2]} rotation={rot}>
      <Render type="cylinder" material={m} />
    </Entity>
  )
}
function Ball({ p, r, m }: { p: [number, number, number]; r: number; m: Mat }) {
  return (
    <Entity position={p} scale={[r * 2, r * 2, r * 2]}>
      <Render type="sphere" material={m} />
    </Entity>
  )
}

/** The 3D shape of one kind of equipment, in local space (origin on the floor). */
function Shape({ kind, m }: { kind: PropKind; m: Mats }) {
  return (
    <>
      {shapeOf(kind).map((part, i) => {
        const key = `${kind}-${i}`
        switch (part.t) {
          case 'box':
            return <Block key={key} p={part.p} s={part.s} m={m[part.m]} r={part.rot} />
          case 'cyl':
            return <Cyl key={key} p={part.p} r={part.r} h={part.h} m={m[part.m]} rot={part.rot} />
          case 'ball':
            return <Ball key={key} p={part.p} r={part.r} m={m[part.m]} />
          default:
            return (
              <Furniture
                key={key}
                name={part.name}
                position={part.p}
                scale={part.scale}
                rotation={part.rotY}
              />
            )
        }
      })}
    </>
  )
}

function PropObject({
  prop,
  m,
  onUse,
  active,
}: { prop: Prop; m: Mats; onUse?: (p: Prop) => void; active: boolean }) {
  return (
    <Entity
      name={`prop:${prop.id}`}
      position={[prop.x, 0, prop.z]}
      rotation={[0, prop.rot ?? 0, 0]}
      onClick={() => {
        if (prop.action) onUse?.(prop)
      }}
    >
      <Shape kind={prop.kind} m={m} />
      {active && (
        <Entity position={[0, 0.02, 0]} scale={[1.4, 0.02, 1.4]}>
          <Render type="cylinder" material={m.yellow} />
        </Entity>
      )}
    </Entity>
  )
}

/** A character that walks between two points and back, facing where it goes. */
function Mover({ npc }: { npc: Npc }) {
  const [t, setT] = useState(0)
  useAppEvent('update', (dt: number) => setT((v) => v + dt))
  const to = npc.to ?? { x: npc.x, z: npc.z }
  const period = 6
  const u = (t % period) / period
  const k = u < 0.5 ? u * 2 : 2 - u * 2
  const x = npc.x + (to.x - npc.x) * k
  const z = npc.z + (to.z - npc.z) * k
  const dir = u < 0.5 ? 1 : -1
  const rot = (Math.atan2((to.x - npc.x) * dir, (to.z - npc.z) * dir) * 180) / Math.PI
  return (
    <Character
      name={`npc:${npc.id}`}
      model={npc.model}
      position={[x, 0, z]}
      rotation={rot}
      anim={npc.anim}
      scale={1.3}
    />
  )
}

export default function InteriorScene({
  layout,
  title,
  angle = 45,
  distance = 24,
  activity,
  playerModel = 'character-female-a',
  playerPagne,
  onUse,
}: {
  layout: Layout
  title: string
  angle?: number
  distance?: number
  /** The equipment the player is using and the animation to play. */
  activity: { prop: string; anim: NpcAnim } | null
  playerModel?: string
  playerPagne?: string
  onUse?: (p: Prop) => void
}) {
  const floor = useMaterial({ diffuse: layout.floor, gloss: 0.1 })
  const wall = useMaterial({ diffuse: layout.wall, gloss: 0.04 })
  const trim = useMaterial({ diffuse: layout.trim, gloss: 0.1 })
  const m: Mats = {
    dark: useMaterial(surface('dark')),
    steel: useMaterial(surface('steel')),
    black: useMaterial(surface('black')),
    red: useMaterial(surface('red')),
    blue: useMaterial(surface('blue')),
    yellow: useMaterial(surface('yellow')),
    green: useMaterial(surface('green')),
    wood: useMaterial(surface('wood')),
    white: useMaterial(surface('white')),
    cloth: useMaterial(surface('cloth')),
    glass: useMaterial(surface('glass')),
    grey: useMaterial(surface('grey')),
    water: useMaterial(surface('water')),
    leaf: useMaterial(surface('leaf')),
    trunk: useMaterial(surface('trunk')),
    cream: useMaterial(surface('cream')),
  }
  const radians = (angle * Math.PI) / 180
  const camera: [number, number, number] = [
    Math.sin(radians) * distance,
    distance * 0.83,
    Math.cos(radians) * distance,
  ]
  const W = layout.w
  const D = layout.d
  const used = activity ? layout.props.find((p) => p.id === activity.prop) : null
  const player = used
    ? {
        x: used.x,
        z: used.z + (used.kind === 'treadmill' ? 0.15 : used.kind === 'bench-press' ? 0.35 : 0.3),
        rot: (used.rot ?? 0) + 180,
        anim: activity?.anim ?? 'idle',
      }
    : { ...layout.spawn, rot: 180, anim: 'idle' as NpcAnim }

  return (
    <>
      <Entity position={camera} rotation={[-35, angle, 0]}>
        <Camera fov={50} nearClip={0.1} farClip={110} clearColor="#b7d1ce" />
      </Entity>
      <Entity rotation={[52, 22, 0]}>
        <Light type="directional" intensity={1.7} />
      </Entity>
      <Entity rotation={[20, 185, 0]}>
        <Light type="directional" intensity={0.8} />
      </Entity>
      {/* Cutaway room: floor, two back walls, skirting, a window. */}
      <Block p={[0, -0.14, 0]} s={[W, 0.24, D]} m={floor} />
      <Block p={[0, 1.8, -D / 2]} s={[W, 3.8, 0.2]} m={wall} />
      <Block p={[-W / 2, 1.8, 0]} s={[0.2, 3.8, D]} m={wall} />
      <Block p={[0, 3.7, -D / 2]} s={[W, 0.18, 0.25]} m={trim} />
      <Block p={[-W / 2, 3.7, 0]} s={[0.25, 0.18, D]} m={trim} />
      <Block p={[0, 0.12, -D / 2 + 0.12]} s={[W, 0.24, 0.06]} m={trim} />
      <Block p={[-W / 2 + 0.12, 0.12, 0]} s={[0.06, 0.24, D]} m={trim} />
      <Block p={[-W / 2 + 0.08, 2.3, 1.4]} s={[0.16, 1.3, 2.2]} m={trim} />
      <Block p={[-W / 2 + 0.2, 2.3, 1.4]} s={[0.1, 1.05, 1.95]} m={m.glass} />
      {layout.props.map((p) => (
        <PropObject key={p.id} prop={p} m={m} onUse={onUse} active={activity?.prop === p.id} />
      ))}
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
            scale={1.3}
          />
        ),
      )}
      <Character
        name="Joueur"
        model={playerModel}
        position={[player.x, 0, player.z]}
        rotation={player.rot}
        anim={player.anim}
        pagne={playerPagne}
        scale={1.35}
      />
      <Entity name={`Intérieur ${title}`} position={[0, 3.9, 0]} />
    </>
  )
}
