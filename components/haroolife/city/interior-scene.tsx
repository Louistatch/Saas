'use client'

import type { Layout, Npc, NpcAnim, Prop, PropKind } from '@/lib/haroolife/city/interiors'
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
  switch (kind) {
    case 'treadmill':
      return (
        <>
          <Block p={[0, 0.07, 0.1]} s={[0.72, 0.14, 1.6]} m={m.dark} />
          <Block p={[0, 0.15, 0.15]} s={[0.56, 0.02, 1.3]} m={m.black} />
          <Block p={[-0.3, 0.6, -0.65]} s={[0.06, 1.1, 0.06]} m={m.steel} />
          <Block p={[0.3, 0.6, -0.65]} s={[0.06, 1.1, 0.06]} m={m.steel} />
          <Block p={[0, 1.18, -0.68]} s={[0.66, 0.22, 0.12]} m={m.dark} r={[-25, 0, 0]} />
          <Block p={[0, 1.2, -0.66]} s={[0.4, 0.12, 0.02]} m={m.blue} r={[-25, 0, 0]} />
          <Block p={[-0.33, 0.95, -0.35]} s={[0.04, 0.04, 0.7]} m={m.steel} />
          <Block p={[0.33, 0.95, -0.35]} s={[0.04, 0.04, 0.7]} m={m.steel} />
        </>
      )
    case 'bike':
      return (
        <>
          <Block p={[0, 0.05, 0]} s={[0.5, 0.1, 1.0]} m={m.dark} />
          <Cyl p={[0, 0.5, 0.05]} r={0.04} h={0.9} m={m.steel} />
          <Cyl p={[0, 0.45, -0.35]} r={0.04} h={1.1} m={m.steel} rot={[20, 0, 0]} />
          <Block p={[0, 0.95, 0.1]} s={[0.26, 0.06, 0.3]} m={m.black} />
          <Block p={[0, 1.02, -0.52]} s={[0.5, 0.05, 0.05]} m={m.black} />
          <Cyl p={[0, 0.35, 0.0]} r={0.3} h={0.1} m={m.black} rot={[0, 0, 90]} />
        </>
      )
    case 'bench-press':
      return (
        <>
          <Block p={[0, 0.45, 0]} s={[0.42, 0.1, 1.25]} m={m.red} />
          <Block p={[0, 0.2, 0.45]} s={[0.08, 0.4, 0.08]} m={m.steel} />
          <Block p={[0, 0.2, -0.45]} s={[0.08, 0.4, 0.08]} m={m.steel} />
          <Block p={[-0.6, 0.6, -0.45]} s={[0.06, 1.2, 0.06]} m={m.steel} />
          <Block p={[0.6, 0.6, -0.45]} s={[0.06, 1.2, 0.06]} m={m.steel} />
          <Cyl p={[0, 1.15, -0.45]} r={0.025} h={1.9} m={m.steel} rot={[0, 0, 90]} />
          <Cyl p={[-0.8, 1.15, -0.45]} r={0.2} h={0.06} m={m.black} rot={[0, 0, 90]} />
          <Cyl p={[0.8, 1.15, -0.45]} r={0.2} h={0.06} m={m.black} rot={[0, 0, 90]} />
        </>
      )
    case 'dumbbell-rack':
      return (
        <>
          <Block p={[0, 0.3, 0]} s={[1.5, 0.06, 0.45]} m={m.steel} />
          <Block p={[0, 0.65, -0.12]} s={[1.5, 0.06, 0.3]} m={m.steel} />
          <Block p={[-0.7, 0.35, 0]} s={[0.06, 0.7, 0.45]} m={m.dark} />
          <Block p={[0.7, 0.35, 0]} s={[0.06, 0.7, 0.45]} m={m.dark} />
          {[-0.5, -0.25, 0, 0.25, 0.5].map((x, i) => (
            <Entity key={x} position={[x, i % 2 ? 0.72 : 0.37, i % 2 ? -0.12 : 0.05]}>
              <Cyl p={[0, 0, 0]} r={0.02} h={0.3} m={m.steel} rot={[90, 0, 0]} />
              <Cyl p={[0, 0, -0.14]} r={0.06} h={0.05} m={m.black} rot={[90, 0, 0]} />
              <Cyl p={[0, 0, 0.14]} r={0.06} h={0.05} m={m.black} rot={[90, 0, 0]} />
            </Entity>
          ))}
        </>
      )
    case 'mat':
      return <Block p={[0, 0.02, 0]} s={[0.7, 0.04, 1.6]} m={m.blue} />
    case 'locker':
      return (
        <>
          <Block p={[0, 0.9, 0]} s={[0.62, 1.8, 0.45]} m={m.grey} />
          <Block p={[-0.15, 0.9, 0.23]} s={[0.26, 1.7, 0.01]} m={m.steel} />
          <Block p={[0.15, 0.9, 0.23]} s={[0.26, 1.7, 0.01]} m={m.steel} />
          <Block p={[-0.04, 1.0, 0.24]} s={[0.03, 0.12, 0.01]} m={m.black} />
          <Block p={[0.26, 1.0, 0.24]} s={[0.03, 0.12, 0.01]} m={m.black} />
        </>
      )
    case 'reception':
      return (
        <>
          <Block p={[0, 0.5, 0]} s={[1.9, 1.0, 0.6]} m={m.wood} />
          <Block p={[0, 1.02, 0]} s={[2.0, 0.05, 0.7]} m={m.cream} />
          <Block p={[0, 0.5, 0.31]} s={[1.9, 0.3, 0.02]} m={m.yellow} />
          <Furniture name="laptop" position={[-0.4, 1.05, 0]} scale={0.9} rotation={180} />
          <Block p={[0.55, 1.08, 0]} s={[0.25, 0.06, 0.2]} m={m.green} />
        </>
      )
    case 'water-cooler':
      return (
        <>
          <Block p={[0, 0.5, 0]} s={[0.32, 1.0, 0.32]} m={m.white} />
          <Cyl p={[0, 1.2, 0]} r={0.14} h={0.4} m={m.water} />
        </>
      )
    case 'mirror':
      return (
        <>
          <Block p={[0, 1.2, 0]} s={[0.05, 1.6, 2.2]} m={m.glass} />
          <Block p={[-0.02, 1.2, 0]} s={[0.03, 1.7, 2.3]} m={m.black} />
        </>
      )
    case 'pew':
      return (
        <>
          <Block p={[0, 0.42, 0]} s={[2.0, 0.08, 0.4]} m={m.wood} />
          <Block p={[0, 0.7, -0.2]} s={[2.0, 0.5, 0.06]} m={m.wood} />
          <Block p={[-0.9, 0.2, 0]} s={[0.06, 0.4, 0.4]} m={m.wood} />
          <Block p={[0.9, 0.2, 0]} s={[0.06, 0.4, 0.4]} m={m.wood} />
        </>
      )
    case 'altar':
      return (
        <>
          <Block p={[0, 0.25, 0.4]} s={[6.5, 0.5, 1.4]} m={m.cream} />
          <Block p={[0, 0.95, 0.1]} s={[1.6, 0.9, 0.6]} m={m.wood} />
          <Block p={[0, 1.42, 0.1]} s={[1.8, 0.05, 0.7]} m={m.white} />
          <Block p={[0, 2.3, -0.5]} s={[0.12, 1.3, 0.1]} m={m.yellow} />
          <Block p={[0, 2.5, -0.5]} s={[0.8, 0.12, 0.1]} m={m.yellow} />
        </>
      )
    case 'bed':
      return <Furniture name="bedsingle" position={[0, 0.1, 0]} scale={1.13} />
    case 'hospital-bed':
      return (
        <>
          <Block p={[0, 0.35, 0]} s={[1.1, 0.5, 2.1]} m={m.white} />
          <Block p={[0, 0.62, 0.15]} s={[1.0, 0.1, 1.7]} m={m.blue} />
          <Block p={[0, 0.66, -0.8]} s={[0.7, 0.1, 0.4]} m={m.white} />
          <Block p={[0, 0.8, -1.05]} s={[1.1, 0.5, 0.06]} m={m.steel} />
          <Block p={[0.7, 0.9, -0.6]} s={[0.05, 1.8, 0.05]} m={m.steel} />
        </>
      )
    case 'desk':
      return (
        <>
          <Furniture name="desk" position={[0, 0.1, 0]} scale={1.2} />
          <Furniture name="laptop" position={[0.2, 0.9, 0]} scale={0.8} />
        </>
      )
    case 'counter':
      return (
        <>
          <Block p={[0, 0.5, 0]} s={[5.6, 1.0, 0.8]} m={m.wood} />
          <Block p={[0, 1.02, 0]} s={[5.7, 0.05, 0.9]} m={m.cream} />
          {[-2, -1, 0, 1, 2].map((x) => (
            <Block key={x} p={[x, 1.15, 0.05]} s={[0.4, 0.22, 0.4]} m={x % 2 ? m.red : m.green} />
          ))}
        </>
      )
    case 'shelf':
      return (
        <>
          <Block p={[0, 1.0, 0]} s={[1.3, 2.0, 0.5]} m={m.wood} />
          {[0.5, 1.1, 1.7].map((h, i) => (
            <Entity key={h}>
              <Block p={[0, h, 0]} s={[1.4, 0.05, 0.55]} m={m.cream} />
              <Block p={[-0.35, h + 0.18, 0.05]} s={[0.3, 0.3, 0.3]} m={i % 2 ? m.green : m.red} />
              <Block p={[0.35, h + 0.18, 0.05]} s={[0.3, 0.3, 0.3]} m={m.blue} />
            </Entity>
          ))}
        </>
      )
    case 'table':
      return <Furniture name="table" position={[0, 0.1, 0]} scale={1.1} />
    case 'chair':
      return <Furniture name="chair" position={[0, 0.1, 0]} scale={1} />
    case 'sofa':
      return <Furniture name="loungesofa" position={[0, 0.09, 0]} scale={1.3} />
    case 'tv':
      return <Furniture name="televisionmodern" position={[0, 0.85, 0]} scale={0.9} />
    case 'fridge':
      return <Furniture name="kitchenfridgesmall" position={[0, 0.12, 0]} scale={1.1} />
    case 'stove':
      return <Furniture name="kitchenstove" position={[0, 0.12, 0]} scale={1.05} />
    case 'shower':
      return <Furniture name="shower" position={[0, 0.1, 0]} scale={1.1} />
    case 'toilet':
      return <Furniture name="toilet" position={[0, 0.1, 0]} scale={1.1} />
    case 'plant':
      return <Furniture name="pottedplant" position={[0, 0.1, 0]} scale={1.4} />
    case 'atm':
      return (
        <>
          <Block p={[0, 0.9, 0]} s={[0.7, 1.8, 0.5]} m={m.blue} />
          <Block p={[0, 1.25, 0.26]} s={[0.45, 0.3, 0.02]} m={m.glass} />
          <Block p={[0, 0.8, 0.26]} s={[0.4, 0.06, 0.02]} m={m.black} />
        </>
      )
    case 'board':
      return (
        <>
          <Block p={[0, 1.6, 0]} s={[2.4, 1.2, 0.05]} m={m.white} />
          <Block p={[0, 1.6, -0.02]} s={[2.5, 1.3, 0.04]} m={m.green} />
        </>
      )
    case 'stall':
      return (
        <>
          <Block p={[0, 0.45, 0]} s={[1.5, 0.9, 0.8]} m={m.wood} />
          <Block p={[-0.7, 1.0, 0.35]} s={[0.05, 1.3, 0.05]} m={m.wood} />
          <Block p={[0.7, 1.0, 0.35]} s={[0.05, 1.3, 0.05]} m={m.wood} />
          <Block p={[0, 1.7, 0.1]} s={[1.7, 0.06, 1.0]} m={m.red} r={[-10, 0, 0]} />
          <Block p={[-0.4, 1.0, 0]} s={[0.35, 0.2, 0.35]} m={m.yellow} />
          <Block p={[0.3, 1.0, 0.1]} s={[0.35, 0.2, 0.35]} m={m.green} />
        </>
      )
    case 'cabinet':
      return (
        <>
          <Block p={[0, 0.9, 0]} s={[1.0, 1.8, 0.5]} m={m.cream} />
          <Block p={[0, 0.9, 0.26]} s={[0.02, 1.6, 0.02]} m={m.black} />
        </>
      )
    case 'sign':
      return (
        <>
          <Block p={[0, 2.6, 0]} s={[3.2, 0.6, 0.08]} m={m.black} />
          <Block p={[0, 2.6, 0.05]} s={[2.9, 0.34, 0.02]} m={m.yellow} />
        </>
      )
    case 'lamp':
      return (
        <>
          <Cyl p={[0, 1.2, 0]} r={0.04} h={2.4} m={m.steel} />
          <Ball p={[0, 2.5, 0]} r={0.18} m={m.yellow} />
        </>
      )
    case 'tree':
      return (
        <>
          <Cyl p={[0, 0.6, 0]} r={0.12} h={1.2} m={m.trunk} />
          <Ball p={[0, 1.7, 0]} r={0.8} m={m.leaf} />
        </>
      )
    case 'fountain':
      return (
        <>
          <Cyl p={[0, 0.2, 0]} r={1.3} h={0.4} m={m.cream} />
          <Cyl p={[0, 0.42, 0]} r={1.15} h={0.06} m={m.water} />
          <Cyl p={[0, 0.7, 0]} r={0.15} h={0.6} m={m.cream} />
          <Ball p={[0, 1.05, 0]} r={0.22} m={m.water} />
        </>
      )
    case 'crate':
      return <Block p={[0, 0.25, 0]} s={[0.5, 0.5, 0.5]} m={m.wood} />
    default:
      return null
  }
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
    dark: useMaterial({ diffuse: '#2b2f36', gloss: 0.3 }),
    steel: useMaterial({ diffuse: '#9aa3ad', gloss: 0.6, metalness: 0.4 }),
    black: useMaterial({ diffuse: '#15181c', gloss: 0.2 }),
    red: useMaterial({ diffuse: '#c53d2f', gloss: 0.2 }),
    blue: useMaterial({ diffuse: '#2c6fb3', gloss: 0.2 }),
    yellow: useMaterial({ diffuse: '#f4c84a', gloss: 0.3, emissive: '#3a2e05' }),
    green: useMaterial({ diffuse: '#1f7a4d', gloss: 0.15 }),
    wood: useMaterial({ diffuse: '#9a674c', gloss: 0.08 }),
    white: useMaterial({ diffuse: '#f6f6f2', gloss: 0.2 }),
    cloth: useMaterial({ diffuse: '#699eba', gloss: 0.04 }),
    glass: useMaterial({ diffuse: '#bfe3ee', gloss: 0.9 }),
    grey: useMaterial({ diffuse: '#7b8794', gloss: 0.35 }),
    water: useMaterial({ diffuse: '#4fb3d6', gloss: 0.8 }),
    leaf: useMaterial({ diffuse: '#3f8f3f', gloss: 0.05 }),
    trunk: useMaterial({ diffuse: '#6b4423', gloss: 0.05 }),
    cream: useMaterial({ diffuse: '#efe6d3', gloss: 0.1 }),
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
