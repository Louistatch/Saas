'use client'

import type { Transport } from '@/lib/haroolife/lome-life-engine'
/**
 * Travel scene: a ride along a Lomé boulevard between two places, seen from behind the
 * vehicle. Original PlayCanvas geometry plus the CC0 Kenney car kit and street lights
 * already shipped with the game. Real weather decides the rain. No proprietary assets.
 */
import { Entity } from '@playcanvas/react'
import { Gltf } from '@playcanvas/react'
import { Camera, Light, Render } from '@playcanvas/react/components'
import { useAppEvent, useMaterial, useModel } from '@playcanvas/react/hooks'
import { useState } from 'react'

const BASE = '/haroolife/vendor/kenney-3d/'
const LANES = [-2.1, 2.1]
const TRAFFIC = [
  { kind: 'sedan', lane: 0, z: -14, s: 0.83 },
  { kind: 'van', lane: 1, z: -22, s: 0.78 },
  { kind: 'taxi', lane: 0, z: -34, s: 0.9 },
  { kind: 'sedan', lane: 1, z: -48, s: 0.83 },
  { kind: 'taxi', lane: 1, z: -66, s: 0.9 },
  { kind: 'van', lane: 0, z: -80, s: 0.78 },
] as const
const SPEED: Record<Transport, number> = { walk: 4, moto: 11, taxi: 8 }

function Model({
  url,
  position,
  scale = 1,
  rotation = 0,
}: {
  url: string
  position: [number, number, number]
  scale?: number
  rotation?: number
}) {
  const { asset } = useModel(url)
  if (!asset) return null
  return (
    <Entity position={position} rotation={[0, rotation, 0]} scale={[scale, scale, scale]}>
      <Gltf asset={asset} />
    </Entity>
  )
}

export function Ride({ transport, rain }: { transport: Transport; rain: boolean }) {
  const [t, setT] = useState(0)
  useAppEvent('update', (dt: number) => setT((v) => v + dt))
  const asphalt = useMaterial({ diffuse: rain ? '#2b3034' : '#3a3f44', gloss: rain ? 0.6 : 0.1 })
  const kerb = useMaterial({ diffuse: '#b9b2a4', gloss: 0.05 })
  const paint = useMaterial({ diffuse: '#e9e2c6', gloss: 0.1 })
  const sand = useMaterial({ diffuse: rain ? '#8d8368' : '#c9b98a', gloss: 0.02 })
  const wall = useMaterial({ diffuse: '#d8d2c2', gloss: 0.05 })
  const roof = useMaterial({ diffuse: '#8c4a2f', gloss: 0.05 })
  const pole = useMaterial({ diffuse: '#4b5563', gloss: 0.2 })
  const run = t * SPEED[transport]
  const dash = run % 6
  const light = run % 18
  const me =
    transport === 'moto'
      ? BASE + 'characters/character-female-a.glb'
      : transport === 'taxi'
        ? BASE + 'car-kit/taxi.glb'
        : BASE + 'car-kit/sedan.glb'
  return (
    <>
      <Entity position={[0, 2.4, 7]} rotation={[-11, 0, 0]}>
        <Camera fov={55} nearClip={0.2} farClip={260} clearColor={rain ? '#9aa3a8' : '#bfe0f2'} />
      </Entity>
      <Entity rotation={[48, 30, 0]}>
        <Light type="directional" intensity={rain ? 0.9 : 1.6} />
      </Entity>
      <Entity rotation={[25, 200, 0]}>
        <Light type="directional" intensity={0.6} />
      </Entity>
      {/* Ground, boulevard, kerbs. */}
      <Entity position={[0, -0.3, -100]} scale={[120, 0.4, 260]}>
        <Render type="box" material={sand} />
      </Entity>
      <Entity position={[0, -0.09, -100]} scale={[9.2, 0.2, 260]}>
        <Render type="box" material={asphalt} />
      </Entity>
      {[-5, 5].map((x) => (
        <Entity key={'kerb' + x} position={[x, 0.05, -100]} scale={[1.2, 0.3, 260]}>
          <Render type="box" material={kerb} />
        </Entity>
      ))}
      {/* Lane dashes scroll towards the camera. */}
      {Array.from({ length: 40 }, (_, i) => (
        <Entity key={'dash' + i} position={[0, 0.02, 6 - i * 6 + dash]} scale={[0.18, 0.02, 2.4]}>
          <Render type="box" material={paint} />
        </Entity>
      ))}
      {/* Street lights and roadside compounds. */}
      {Array.from({ length: 14 }, (_, i) => {
        const z = 8 - i * 18 + light
        return (
          <Entity key={'side' + i}>
            <Model
              url={BASE + 'city-kit-roads/light-curved.glb'}
              position={[-5.3, 0.2, z]}
              scale={1.6}
              rotation={90}
            />
            <Model
              url={BASE + 'city-kit-roads/light-curved.glb'}
              position={[5.3, 0.2, z - 9]}
              scale={1.6}
              rotation={270}
            />
            <Entity position={[-10 - (i % 3), 1.3, z - 4]} scale={[5, 2.6 + (i % 2), 7]}>
              <Render type="box" material={wall} />
            </Entity>
            <Entity position={[-10 - (i % 3), 2.9 + (i % 2) * 0.5, z - 4]} scale={[5.4, 0.3, 7.4]}>
              <Render type="box" material={roof} />
            </Entity>
            <Entity
              position={[10 + ((i + 1) % 3), 1.1, z - 12]}
              scale={[5, 2.2 + ((i + 1) % 2), 6]}
            >
              <Render type="box" material={wall} />
            </Entity>
            <Entity position={[7.4, 0.9, z - 2]} scale={[0.12, 1.8, 0.12]}>
              <Render type="cylinder" material={pole} />
            </Entity>
          </Entity>
        )
      })}
      {/* Traffic ahead creeps forward slower than us, so we overtake it. */}
      {TRAFFIC.map((v, i) => {
        const z = v.z + ((run * 0.55 + i * 7) % 90)
        return (
          <Model
            key={'car' + i}
            url={BASE + 'car-kit/' + v.kind + '.glb'}
            position={[LANES[v.lane], 0, z > 12 ? z - 90 : z]}
            scale={v.s}
            rotation={180}
          />
        )
      })}
      {/* Us. */}
      <Model
        url={me}
        position={[-2.1, 0, 2.5]}
        scale={transport === 'moto' ? 1.2 : 0.9}
        rotation={180}
      />
    </>
  )
}

export default function RideOverlay({
  transport,
  rain,
  destination,
  onSkip,
  onMap,
}: {
  transport: Transport
  rain: boolean
  destination: string
  onSkip: () => void
  onMap: () => void
}) {
  const label = transport === 'moto' ? 'En zémidjan' : transport === 'taxi' ? 'En taxi' : 'À pied'
  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-label="Trajet en cours">
      {rain && (
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'repeating-linear-gradient(100deg, transparent 0 14px, rgba(255,255,255,0.35) 14px 15px)',
            animation: 'haroolife-rain 0.5s linear infinite',
          }}
        />
      )}
      <style>
        {
          '@keyframes haroolife-rain { to { background-position: -40px 120px } } @media (prefers-reduced-motion: reduce) { [style*="haroolife-rain"] { animation: none } }'
        }
      </style>
      <div className="absolute inset-x-0 top-[calc(70px+env(safe-area-inset-top))] flex flex-col items-center gap-2 px-3">
        <div className="rounded-2xl border-4 border-white bg-emerald-700 px-5 py-2 text-center text-lg font-black uppercase tracking-wide text-white shadow-lg">
          Boulevard du Mono
        </div>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-xs font-bold shadow">
          <span>
            {transport === 'moto' ? '🏍️' : '🚕'} {label} vers {destination}…
            {rain ? ' Il pleut.' : ''}
          </span>
          <button type="button" onClick={onMap} className="rounded-full bg-slate-100 px-3 py-1">
            Carte
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full bg-slate-900 px-3 py-1 text-white"
          >
            Passer ⏭
          </button>
        </div>
      </div>
    </div>
  )
}
