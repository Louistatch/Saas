'use client'
// Chargé avec dynamic(() => import('./village-3d'), { ssr: false }) : WebGL n'existe pas côté serveur.
import { Application, Entity } from '@playcanvas/react'
import { Camera, Light, Render } from '@playcanvas/react/components'
import { Color, StandardMaterial } from 'playcanvas'
import { useMemo, useState } from 'react'
import type { Place } from './village-scene'

const LABELS: Record<Place, string> = {
  work: 'Nos parcelles',
  all: 'Place du village',
  team: 'Maison des équipes',
}

function paint(hex: string) {
  const material = new StandardMaterial()
  material.diffuse = new Color().fromString(hex)
  material.gloss = 0.1
  material.useMetalness = true
  material.metalness = 0
  material.update()
  return material
}

function Hut({ x, z, s = 1, mat }: { x: number; z: number; s?: number; mat: Mats }) {
  return (
    <Entity position={[x, 0, z]} scale={[s, s, s]}>
      <Entity position={[0, 0.45, 0]} scale={[1.2, 0.9, 1.2]}>
        <Render type="cylinder" material={mat.wall} />
      </Entity>
      <Entity position={[0, 1.4, 0]} scale={[1.9, 1, 1.9]}>
        <Render type="cone" material={mat.thatch} />
      </Entity>
      <Entity position={[0, 0.3, 0.6]} scale={[0.4, 0.6, 0.1]}>
        <Render type="box" material={mat.door} />
      </Entity>
    </Entity>
  )
}

function Tree({ x, z, s = 1, mat }: { x: number; z: number; s?: number; mat: Mats }) {
  return (
    <Entity position={[x, 0, z]} scale={[s, s, s]}>
      <Entity position={[0, 0.7, 0]} scale={[0.28, 1.4, 0.28]}>
        <Render type="cylinder" material={mat.trunk} />
      </Entity>
      <Entity position={[0, 2.1, 0]} scale={[2, 1.7, 2]}>
        <Render type="sphere" material={mat.leaf} />
      </Entity>
      <Entity position={[-0.6, 1.8, 0.2]} scale={[1.3, 1.1, 1.3]}>
        <Render type="sphere" material={mat.leafLight} />
      </Entity>
    </Entity>
  )
}

type Mats = ReturnType<typeof makeMaterials>
function makeMaterials() {
  return {
    ground: paint('#6fae52'),
    sand: paint('#e2c88f'),
    soil: paint('#8a5a35'),
    crop: paint('#7ab648'),
    straw: paint('#cfa83f'),
    wall: paint('#c98f5a'),
    thatch: paint('#d9a441'),
    door: paint('#5a3a22'),
    trunk: paint('#7a5230'),
    leaf: paint('#2f7d4f'),
    leafLight: paint('#3b8f5c'),
  }
}

export default function Village3D({
  counts,
  onChoose,
}: {
  counts: Record<Place, number>
  onChoose: (place: Place) => void
}) {
  const mat = useMemo(makeMaterials, [])
  const [hover, setHover] = useState<Place | null>(null)
  const grow = (p: Place): [number, number, number] =>
    hover === p ? [1.06, 1.06, 1.06] : [1, 1, 1]
  const bind = (p: Place) => ({
    onClick: () => onChoose(p),
    onPointerOver: () => setHover(p),
    onPointerOut: () => setHover((h) => (h === p ? null : h)),
  })

  return (
    <div className="mb-6 w-full">
      <div
        aria-hidden="true"
        className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-sky-200 sm:aspect-[16/10]"
      >
        <Application
          graphicsDeviceOptions={{ antialias: true }}
          className="h-full w-full"
          style={{ width: '100%', height: '100%', cursor: hover ? 'pointer' : 'default' }}
        >
          <Entity position={[14, 11.4, 14]} rotation={[-30, 45, 0]}>
            <Camera fov={30} clearColor="#bfe3f5" />
          </Entity>
          <Entity rotation={[50, 30, 0]}>
            <Light type="directional" intensity={1.15} />
          </Entity>
          <Entity rotation={[-30, 200, 0]}>
            <Light type="directional" intensity={0.35} />
          </Entity>

          <Entity position={[0, -0.05, 0]} scale={[90, 1, 60]}>
            <Render type="plane" material={mat.ground} />
          </Entity>
          <Entity position={[0.4, 0, 3.4]} rotation={[0, 8, 0]} scale={[1.6, 1, 6]}>
            <Render type="plane" material={mat.sand} />
          </Entity>

          <Entity position={[-4.3, 0, 0]} scale={grow('work')} {...bind('work')}>
            {[-1.3, -0.65, 0, 0.65, 1.3].map((z, i) => (
              <Entity key={z} position={[0, 0.08, z]} scale={[3.6, 0.16, 0.5]}>
                <Render type="box" material={i % 2 ? mat.straw : mat.crop} />
              </Entity>
            ))}
            <Entity position={[0, 0.02, 0]} scale={[4, 0.04, 3.6]}>
              <Render type="box" material={mat.soil} />
            </Entity>
          </Entity>

          <Entity position={[0, 0, 0.2]} scale={grow('all')} {...bind('all')}>
            <Entity position={[0, 0.03, 0]} scale={[3.6, 0.06, 3.6]}>
              <Render type="cylinder" material={mat.sand} />
            </Entity>
            <Tree x={0} z={0} s={1.2} mat={mat} />
          </Entity>

          <Entity position={[3.9, 0, 0]} scale={grow('team')} {...bind('team')}>
            <Hut x={-1.2} z={-0.9} s={0.9} mat={mat} />
            <Hut x={1.1} z={-0.7} s={1} mat={mat} />
            <Hut x={-0.2} z={1.0} s={1.15} mat={mat} />
          </Entity>

          <Tree x={-9} z={-3.5} s={0.9} mat={mat} />
          <Tree x={9} z={-4} s={1} mat={mat} />
          <Tree x={-3} z={-5} s={0.7} mat={mat} />
        </Application>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
        {(['work', 'all', 'team'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChoose(p)}
            onPointerEnter={() => setHover(p)}
            onPointerLeave={() => setHover((h) => (h === p ? null : h))}
            className="rounded-full bg-white/95 px-2 py-2 text-center shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="block text-xs font-bold text-emerald-950 sm:text-sm">{LABELS[p]}</span>
            <span className="block text-[11px] text-slate-600 sm:text-xs">
              {p === 'all' ? `${counts[p]} participation(s)` : `${counts[p]} ouvert(s)`}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
