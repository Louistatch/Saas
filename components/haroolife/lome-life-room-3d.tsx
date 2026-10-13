'use client'

import { HAROOLIFE_ASSETS } from '@/lib/haroolife/assets'
import type { Interior } from '@/lib/haroolife/city/life'
import type { Action } from '@/lib/haroolife/lome-life-engine'
/** Lightweight original interior assembled from PlayCanvas geometry and CC0 Kenney models.
 * No proprietary interior scenes or textures from Lagos Life / The Sims.
 */
import { Entity, Gltf } from '@playcanvas/react'
import { Camera, Light, Render } from '@playcanvas/react/components'
import { useModel } from '@playcanvas/react/hooks'
import { useMaterial } from './city/use-material'

const BASE = `${HAROOLIFE_ASSETS}/vendor/kenney-3d/`
function Citizen({
  position,
  scale = 0.85,
}: { position: [number, number, number]; scale?: number }) {
  const { asset } = useModel(BASE + 'characters/character-female-a.glb')
  if (!asset) return null
  return (
    <Entity position={position} scale={[scale, scale, scale]} rotation={[0, 125, 0]}>
      <Gltf asset={asset} />
    </Entity>
  )
}
/** Real open-source 3D furniture assets, not polygon placeholders. */
function Furniture({
  name,
  position,
  scale = 1,
  rotation = 0,
  action,
  onInteract,
}: {
  name: string
  position: [number, number, number]
  scale?: number
  rotation?: number
  action?: Action | string
  onInteract?: (a: Action | string) => void
}) {
  const { asset } = useModel(BASE + 'furniture-kit/' + name + '.glb')
  if (!asset) return null
  return (
    <Entity
      name={action ? 'Interact with ' + name : name}
      onClick={() => {
        if (action) onInteract?.(action)
      }}
      position={position}
      rotation={[0, rotation, 0]}
      scale={[scale, scale, scale]}
    >
      <Gltf asset={asset} />
    </Entity>
  )
}
function Block({
  position,
  scale,
  material,
  rotation,
}: {
  position: [number, number, number]
  scale: [number, number, number]
  material: ReturnType<typeof useMaterial>
  rotation?: [number, number, number]
}) {
  return (
    <Entity position={position} scale={scale} rotation={rotation}>
      <Render type="box" material={material} />
    </Entity>
  )
}
export default function LomeLifeRoom3D({
  venue,
  angle = 45,
  distance = 28,
  onInteract,
}: {
  venue: Interior
  angle?: number
  distance?: number
  onInteract?: (a: Action | string) => void
}) {
  const floor = useMaterial({ diffuse: '#c7b399', gloss: 0.08 })
  const wall = useMaterial({ diffuse: '#7293a1', gloss: 0.04 })
  const trim = useMaterial({ diffuse: '#e8e5d8', gloss: 0.1 })
  const furniture = useMaterial({ diffuse: '#9a674c', gloss: 0.04 })
  const seat = useMaterial({ diffuse: '#c65c43', gloss: 0.08 })
  const fabric = useMaterial({ diffuse: '#699eba', gloss: 0.04 })
  const green = useMaterial({ diffuse: '#367e64', gloss: 0.08 })
  const shadow = useMaterial({ diffuse: '#304852', gloss: 0.02 })
  const roomLabel =
    venue === 'house'
      ? 'Maison'
      : venue === 'market'
        ? 'Marché'
        : venue === 'bakery'
          ? 'Boulangerie'
          : venue === 'hall'
            ? 'Mairie'
            : venue === 'well'
              ? 'Puits'
              : venue === 'gym'
                ? 'Salle de sport'
                : venue === 'chapel'
                  ? 'Lieu de culte'
                  : venue === 'clinic'
                    ? 'Clinique'
                    : 'Jardin'
  const radians = (angle * Math.PI) / 180
  const camera: [number, number, number] = [
    Math.sin(radians) * distance,
    distance * 0.83,
    Math.cos(radians) * distance,
  ]
  return (
    <>
      <Entity position={camera} rotation={[-35, angle, 0]}>
        <Camera fov={50} nearClip={0.1} farClip={110} clearColor="#b7d1ce" />
      </Entity>
      <Entity rotation={[52, 22, 0]}>
        <Light type="directional" intensity={1.8} />
      </Entity>
      <Entity rotation={[20, 185, 0]}>
        <Light type="directional" intensity={0.8} />
      </Entity>
      {/* Cutaway room floor + two back walls, visible from isometric camera. */}
      <Block position={[0, -0.14, 0]} scale={[9, 0.24, 8]} material={floor} />
      <Block position={[0, 1.7, -4]} scale={[9, 3.65, 0.2]} material={wall} />
      <Block position={[-4.5, 1.7, 0]} scale={[0.2, 3.65, 8]} material={wall} />
      <Block position={[0, 3.5, -4]} scale={[9, 0.18, 0.25]} material={trim} />
      <Block position={[-4.5, 3.5, 0]} scale={[0.25, 0.18, 8]} material={trim} />
      {/* Window on the left wall. */}
      <Block position={[-4.32, 2.25, -1.1]} scale={[0.16, 1.25, 2.0]} material={trim} />
      <Block position={[-4.2, 2.25, -1.1]} scale={[0.1, 1.0, 1.73]} material={fabric} />
      <Block position={[-4.1, 2.25, -1.1]} scale={[0.08, 1.05, 0.07]} material={trim} />
      <Block position={[0, 0.06, 0]} scale={[8.2, 0.02, 7.2]} material={floor} />

      {venue === 'house' ? (
        <>
          {/* Bed, duvet, pillow and bedside table. */}
          <Block position={[2.35, 0.45, -2]} scale={[2.3, 0.65, 2.5]} material={furniture} />
          <Block position={[2.35, 0.84, -1.85]} scale={[2.1, 0.15, 2.05]} material={fabric} />
          <Block position={[2.35, 0.93, -2.65]} scale={[1.4, 0.14, 0.48]} material={trim} />
          <Block position={[3.6, 0.7, -2.8]} scale={[0.7, 0.9, 0.8]} material={furniture} />
          <Block position={[-1, 0.6, 1.2]} scale={[2.2, 1.05, 0.8]} material={seat} />
          <Block position={[-1.0, 1.2, 1.55]} scale={[2.2, 0.7, 0.25]} material={seat} />
          <Block position={[1.2, 0.62, 1.2]} scale={[1.5, 0.22, 1.3]} material={furniture} />
          <Block position={[1.2, 0.32, 1.2]} scale={[0.24, 0.5, 0.24]} material={shadow} />
          <Furniture
            name="bedsingle"
            position={[2.35, 0.18, -2.0]}
            scale={1.13}
            rotation={90}
            action="sleep"
            onInteract={onInteract}
          />
          <Furniture name="loungesofa" position={[-0.95, 0.09, 1.2]} scale={1.3} rotation={180} />
          <Furniture name="kitchenfridgesmall" position={[-3.3, 0.12, -2.8]} scale={1.1} />
          <Furniture
            name="kitchenstove"
            position={[-2.15, 0.12, -3.1]}
            scale={1.05}
            action="eat"
            onInteract={onInteract}
          />
          <Furniture name="televisionmodern" position={[1.2, 0.85, -3.45]} scale={0.9} />
          <Furniture name="pottedplant" position={[3.65, 0.15, 2.7]} scale={1.4} />
        </>
      ) : venue === 'market' || venue === 'bakery' ? (
        <>
          {/* Open shop with counter, shelves and colorful products. */}
          <Block position={[0.3, 0.85, -1.4]} scale={[5.8, 1.45, 0.85]} material={furniture} />
          <Block position={[0.3, 1.65, -1.4]} scale={[5.9, 0.14, 1.0]} material={trim} />
          <Block position={[2.6, 1.1, 2.2]} scale={[1.3, 2.0, 1.8]} material={furniture} />
          {[0.4, 1.15, 1.85].map((h, i) => (
            <Entity key={i}>
              <Block position={[2.6, h, 2.2]} scale={[1.5, 0.12, 1.75]} material={trim} />
              <Block
                position={[2.25, h + 0.22, 2.0]}
                scale={[0.32, 0.36, 0.4]}
                material={i % 2 ? green : seat}
              />
              <Block position={[2.75, h + 0.22, 2.0]} scale={[0.32, 0.36, 0.4]} material={fabric} />
            </Entity>
          ))}
          <Block position={[-2.2, 0.75, 2.1]} scale={[1.4, 0.26, 1.25]} material={furniture} />
          <Block position={[-2.2, 0.42, 2.1]} scale={[0.2, 0.65, 0.2]} material={shadow} />
          <Citizen position={[-1.6, 0.1, -2.3]} scale={1.35} />
          <Furniture
            name="table"
            position={[-2.2, 0.1, 2.2]}
            scale={1.1}
            action="buy-meal"
            onInteract={onInteract}
          />
          <Furniture name="chair" position={[-1.5, 0.1, 2.8]} scale={1} rotation={145} />
          <Furniture name="pottedplant" position={[-3.6, 0.08, -3.1]} scale={1.35} />
        </>
      ) : venue === 'gym' ? (
        <>
          {/* Weight racks, two treadmills, mats. */}
          <Block position={[-2.6, 0.5, -2.6]} scale={[2.2, 0.9, 0.5]} material={furniture} />
          {[-3.3, -2.6, -1.9].map((x) => (
            <Block key={x} position={[x, 1.05, -2.6]} scale={[0.35, 0.2, 0.35]} material={shadow} />
          ))}
          {[0.6, 2.0].map((x) => (
            <Entity key={x}>
              <Block position={[x, 0.3, -2.4]} scale={[0.9, 0.18, 2.0]} material={shadow} />
              <Block position={[x, 0.95, -3.2]} scale={[0.9, 1.1, 0.12]} material={trim} />
            </Entity>
          ))}
          <Block position={[-1.5, 0.08, 1.6]} scale={[1.6, 0.06, 1.0]} material={seat} />
          <Block position={[0.6, 0.08, 1.6]} scale={[1.6, 0.06, 1.0]} material={fabric} />
          <Block position={[2.9, 0.4, 1.4]} scale={[0.5, 0.5, 0.5]} material={green} />
          <Citizen position={[-1.5, 0.11, 1.4]} scale={1.3} />
          <Citizen position={[2.0, 0.4, -2.2]} scale={1.3} />
          <Furniture
            name="chair"
            position={[3.2, 0.1, -1.0]}
            scale={1}
            rotation={200}
            action="train"
            onInteract={onInteract}
          />
        </>
      ) : venue === 'chapel' ? (
        <>
          {/* Pews, altar, pulpit. */}
          {[-2.4, -1.2, 0.0, 1.2].map((z) => (
            <Entity key={z}>
              <Block position={[-1.3, 0.35, z]} scale={[2.2, 0.5, 0.35]} material={furniture} />
              <Block position={[1.6, 0.35, z]} scale={[2.2, 0.5, 0.35]} material={furniture} />
            </Entity>
          ))}
          <Block position={[0.2, 0.25, -3.3]} scale={[6.5, 0.5, 1.0]} material={trim} />
          <Block position={[0.2, 0.9, -3.4]} scale={[1.6, 0.8, 0.6]} material={fabric} />
          <Block position={[0.2, 2.2, -3.9]} scale={[0.14, 1.4, 0.1]} material={seat} />
          <Block position={[0.2, 2.5, -3.9]} scale={[0.8, 0.14, 0.1]} material={seat} />
          <Block position={[-2.6, 1.1, -3.3]} scale={[0.6, 1.2, 0.5]} material={furniture} />
          <Citizen position={[0.2, 0.5, -3.0]} scale={1.3} />
          <Citizen position={[-1.6, 0.1, 2.3]} scale={1.3} />
          <Furniture
            name="chair"
            position={[2.0, 0.1, 2.4]}
            scale={1}
            rotation={0}
            action="pray"
            onInteract={onInteract}
          />
        </>
      ) : venue === 'clinic' ? (
        <>
          {/* Beds with sheets, desk, cabinet. */}
          {[-2.4, -0.4, 1.6].map((x) => (
            <Entity key={x}>
              <Block position={[x, 0.4, -2.2]} scale={[1.3, 0.5, 2.2]} material={trim} />
              <Block position={[x, 0.7, -2.0]} scale={[1.2, 0.12, 1.8]} material={fabric} />
              <Block position={[x, 0.75, -2.9]} scale={[0.9, 0.12, 0.4]} material={trim} />
            </Entity>
          ))}
          <Block position={[2.6, 0.9, 1.6]} scale={[1.2, 1.8, 0.6]} material={trim} />
          <Block position={[2.6, 1.3, 1.9]} scale={[0.5, 0.12, 0.08]} material={seat} />
          <Block position={[2.6, 1.3, 1.9]} scale={[0.12, 0.5, 0.08]} material={seat} />
          <Furniture
            name="table"
            position={[-1.6, 0.1, 1.8]}
            scale={1.2}
            action="care"
            onInteract={onInteract}
          />
          <Furniture name="chair" position={[-0.7, 0.1, 2.4]} scale={1} rotation={160} />
          <Citizen position={[-1.9, 0.1, 1.1]} scale={1.35} />
        </>
      ) : venue === 'hall' ? (
        <>
          <Block position={[0, 0.78, -1.8]} scale={[4.2, 0.3, 1.5]} material={furniture} />
          <Block position={[-1.6, 0.38, -1.8]} scale={[0.28, 0.65, 0.3]} material={shadow} />
          <Block position={[1.6, 0.38, -1.8]} scale={[0.28, 0.65, 0.3]} material={shadow} />
          <Block position={[0, 1.65, -1.8]} scale={[1.2, 0.14, 0.85]} material={fabric} />
          <Citizen position={[0.8, 0, -2.5]} scale={1.3} />
          <Furniture
            name="table"
            position={[0, 0.1, -1.8]}
            scale={1.5}
            action="work"
            onInteract={onInteract}
          />
          <Furniture name="chair" position={[0.8, 0.1, -2.8]} scale={1.1} rotation={90} />
        </>
      ) : (
        <>
          <Block position={[0, 0.55, 0]} scale={[2.4, 0.8, 2.4]} material={green} />
          <Block position={[0, 1.0, 0]} scale={[2.0, 0.15, 2.0]} material={fabric} />
          <Block position={[2.5, 0.5, 1.5]} scale={[1.3, 1.0, 1.3]} material={furniture} />
        </>
      )}
      <Citizen position={[-0.7, 0.09, 1.15]} scale={1.65} />
      <Entity name={'Intérieur ' + roomLabel} position={[0, 3.9, 0]} />
    </>
  )
}
