'use client'

import { DISTRICT_SCENES, visualSignals } from '@/lib/haroolife/territory-scene'
import type { HubId, TerritoryWorld, UpgradeId } from '@/lib/haroolife/territory-simulation'
import { Application, Entity } from '@playcanvas/react'
import { Camera, Light, Render } from '@playcanvas/react/components'
import { Color, StandardMaterial } from 'playcanvas'
import { useEffect, useMemo, useState } from 'react'

type Materials = ReturnType<typeof makeMaterials>

function paint(value: string): StandardMaterial {
  const material = new StandardMaterial()
  material.diffuse = new Color().fromString(value)
  material.useMetalness = true
  material.metalness = 0
  material.gloss = 0.15
  material.update()
  return material
}

function makeMaterials(terrain: string, walls: string) {
  return {
    ground: paint(terrain),
    earth: paint('#986a43'),
    sand: paint('#e6c98e'),
    road: paint('#4c565b'),
    stripe: paint('#f0e4b1'),
    walls: paint(walls),
    roof: paint('#a14d36'),
    dark: paint('#354a46'),
    leaf: paint('#297a47'),
    leafLight: paint('#48a45d'),
    crop: paint('#7dc045'),
    cropGold: paint('#d5bb58'),
    water: paint('#5facc4'),
    steel: paint('#8faab0'),
    glass: paint('#65a4ad'),
    solar: paint('#244d86'),
    brick: paint('#c8854e'),
    truck: paint('#f2a327'),
    black: paint('#242d35'),
    skin: paint('#8b5136'),
    shirt: paint('#e8f1e9'),
    warning: paint('#b9bfc2'),
    white: paint('#f5f5ec'),
  }
}

function Block({
  x,
  y,
  z,
  w,
  h,
  d,
  material,
}: {
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
  material: StandardMaterial
}) {
  return (
    <Entity position={[x, y, z]} scale={[w, h, d]}>
      <Render type="box" material={material} />
    </Entity>
  )
}

function Tree({
  x,
  z,
  materials,
  scale = 1,
}: { x: number; z: number; materials: Materials; scale?: number }) {
  return (
    <Entity position={[x, 0, z]} scale={[scale, scale, scale]}>
      <Block x={0} y={0.65} z={0} w={0.25} h={1.3} d={0.25} material={materials.earth} />
      <Entity position={[0, 1.7, 0]} scale={[1.4, 1.6, 1.3]}>
        <Render type="sphere" material={materials.leaf} />
      </Entity>
      <Entity position={[0.35, 2, 0.2]} scale={[0.9, 0.8, 1]}>
        <Render type="sphere" material={materials.leafLight} />
      </Entity>
    </Entity>
  )
}

function House({
  x,
  z,
  height,
  materials,
}: { x: number; z: number; height: number; materials: Materials }) {
  return (
    <Entity position={[x, 0, z]}>
      <Block x={0} y={height / 2} z={0} w={2} h={height} d={1.9} material={materials.walls} />
      <Block x={0} y={height + 0.12} z={0} w={2.35} h={0.23} d={2.2} material={materials.roof} />
      <Block x={-0.45} y={0.55} z={1} w={0.48} h={1.1} d={0.09} material={materials.dark} />
      <Block
        x={0.55}
        y={Math.min(height - 0.45, 1.35)}
        z={1}
        w={0.48}
        h={0.5}
        d={0.09}
        material={materials.glass}
      />
    </Entity>
  )
}

function Person({
  x,
  z,
  materials,
  shirt,
}: { x: number; z: number; materials: Materials; shirt?: StandardMaterial }) {
  return (
    <Entity position={[x, 0, z]}>
      <Entity position={[0, 0.45, 0]} scale={[0.4, 0.8, 0.4]}>
        <Render type="capsule" material={shirt ?? materials.shirt} />
      </Entity>
      <Entity position={[0, 1.05, 0]} scale={[0.36, 0.36, 0.36]}>
        <Render type="sphere" material={materials.skin} />
      </Entity>
    </Entity>
  )
}

function Truck({ z, materials }: { z: number; materials: Materials }) {
  return (
    <Entity position={[-0.3, 0, z]}>
      <Block x={0} y={0.85} z={0.25} w={1.3} h={1.1} d={2.25} material={materials.truck} />
      <Block x={0} y={0.7} z={-1.22} w={1.25} h={0.85} d={0.85} material={materials.white} />
      <Block x={0} y={0.9} z={-1.66} w={0.9} h={0.37} d={0.08} material={materials.glass} />
      {[-0.72, 0.82].map((axle) =>
        [-0.68, 0.68].map((side) => (
          <Entity
            key={String(axle) + ':' + String(side)}
            position={[side, 0.3, axle]}
            scale={[0.43, 0.43, 0.2]}
            rotation={[0, 0, 90]}
          >
            <Render type="cylinder" material={materials.black} />
          </Entity>
        )),
      )}
    </Entity>
  )
}

function Fields({
  irrigated,
  materials,
  onPick,
}: { irrigated: boolean; materials: Materials; onPick: (type: UpgradeId) => void }) {
  return (
    <Entity position={[6, 0, 1]} onClick={() => onPick('irrigation')}>
      <Block x={0} y={0.1} z={0} w={8.1} h={0.15} d={8.2} material={materials.earth} />
      {[-3, -1.85, -0.7, 0.45, 1.6, 2.75].map((x, index) => (
        <Block
          key={x}
          x={x}
          y={0.2}
          z={0}
          w={0.72}
          h={irrigated ? 0.3 : 0.18}
          d={7.1}
          material={(index + (irrigated ? 1 : 0)) % 2 ? materials.crop : materials.cropGold}
        />
      ))}
      {irrigated && (
        <>
          <Block x={-3.5} y={0.24} z={-3.3} w={0.16} h={0.2} d={7.1} material={materials.water} />
          <Block x={-0.3} y={0.24} z={-3.3} w={0.16} h={0.2} d={7.1} material={materials.water} />
        </>
      )}
    </Entity>
  )
}

function Factory({
  built,
  solar,
  materials,
  onPick,
}: { built: boolean; solar: boolean; materials: Materials; onPick: (type: UpgradeId) => void }) {
  return (
    <Entity position={[-6.5, 0, 2]} onClick={() => onPick('factory')}>
      <Block x={0} y={0.1} z={0} w={7.3} h={0.2} d={5.8} material={materials.sand} />
      <Block
        x={0}
        y={built ? 1.6 : 0.15}
        z={0}
        w={5.2}
        h={built ? 3.2 : 0.2}
        d={3.7}
        material={built ? materials.brick : materials.warning}
      />
      {built && (
        <>
          <Block x={0} y={3.4} z={0} w={5.55} h={0.35} d={4} material={materials.steel} />
          <Block x={1.7} y={4.7} z={-1.1} w={0.95} h={2.8} d={0.95} material={materials.roof} />
          <Block x={-1.3} y={1.05} z={1.9} w={1.4} h={1.8} d={0.1} material={materials.dark} />
          {solar &&
            [-1.6, -0.4, 0.8].map((offset) => (
              <Block
                key={offset}
                x={offset}
                y={3.68}
                z={0}
                w={0.95}
                h={0.1}
                d={2.4}
                material={materials.solar}
              />
            ))}
        </>
      )}
    </Entity>
  )
}

function Marketplace({ materials, delivered }: { materials: Materials; delivered: boolean }) {
  return (
    <Entity position={[4.4, 0, -6]}>
      <Block x={0} y={0.12} z={0} w={7.8} h={0.19} d={3.3} material={materials.sand} />
      {[-2.4, 0, 2.4].map((x) => (
        <Entity key={x} position={[x, 0, 0]}>
          <Block x={0} y={0.75} z={0} w={1.7} h={1.5} d={1.9} material={materials.walls} />
          <Block
            x={0}
            y={1.6}
            z={0}
            w={2.1}
            h={0.2}
            d={2.2}
            material={delivered ? materials.crop : materials.roof}
          />
        </Entity>
      ))}
    </Entity>
  )
}

const HOUSES: Array<[number, number, number]> = [
  [-10, -6.5, 1.8],
  [-7, -6.3, 2.2],
  [-4, -6.5, 2.7],
  [4.2, 7, 1.8],
  [7.6, 7, 2.2],
  [10.6, 6.6, 1.7],
  [-10.5, 7, 2],
  [-10, -1.8, 1.7],
]

export default function TerritoryWorld3D({
  hub,
  world,
  heading,
  onPick,
}: {
  hub: HubId
  world: TerritoryWorld
  heading: number
  onPick: (type: UpgradeId) => void
}) {
  const descriptor = DISTRICT_SCENES[hub]
  const signals = visualSignals(hub, world)
  const materials = useMemo(
    () => makeMaterials(descriptor.terrain, descriptor.building),
    [descriptor.terrain, descriptor.building],
  )
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches) return
    let running = document.visibilityState === 'visible'
    const handleVisibility = () => {
      running = document.visibilityState === 'visible'
    }
    document.addEventListener('visibilitychange', handleVisibility)
    // 10 Hz transform updates; the GPU renderer remains independently responsive.
    const id = window.setInterval(() => {
      if (running) setTick((time) => (time + 1) % 300)
    }, 100)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const radians = (heading * Math.PI) / 180
  const cameraPosition: [number, number, number] = [
    Math.sin(radians) * 22,
    16,
    Math.cos(radians) * 22,
  ]
  const truckPosition = -5.6 + ((tick % 110) / 110) * 11.2
  const walking = (Math.sin(tick / 15) + 1) * 0.6

  return (
    <Application
      key={hub}
      graphicsDeviceOptions={{ antialias: true }}
      className="h-full w-full"
      style={{ width: '100%', height: '100%' }}
    >
      <Entity position={cameraPosition} rotation={[-31, heading, 0]}>
        <Camera fov={42} clearColor="#bcddec" />
      </Entity>
      <Entity rotation={[40, 30, 0]}>
        <Light type="directional" intensity={1.3} />
      </Entity>
      <Entity rotation={[-45, 200, 0]}>
        <Light type="directional" intensity={0.48} />
      </Entity>

      <Block x={0} y={-0.22} z={0} w={27} h={0.42} d={22} material={materials.ground} />
      {descriptor.district === 'coast' && (
        <Block x={0} y={-0.02} z={9.7} w={27} h={0.08} d={2.8} material={materials.water} />
      )}
      <Block x={0} y={0.065} z={0} w={2.7} h={0.11} d={21} material={materials.road} />
      <Block x={0} y={0.065} z={-4.4} w={25} h={0.11} d={2.25} material={materials.road} />
      {[-7, -4, -1, 2, 5, 8].map((z) => (
        <Block key={z} x={0} y={0.13} z={z} w={0.15} h={0.02} d={1} material={materials.stripe} />
      ))}

      {HOUSES.map(([x, z, height], index) => (
        <House
          key={index}
          x={x}
          z={z}
          height={descriptor.district === 'coast' ? height + 1.3 : height}
          materials={materials}
        />
      ))}
      {[-11, -8, 8, 11].map((x, index) => (
        <Tree
          key={x}
          x={x}
          z={index % 2 === 0 ? 3.3 : -2.6}
          materials={materials}
          scale={index % 2 ? 0.76 : 1.1}
        />
      ))}

      {signals.canDevelop ? (
        <>
          <Fields irrigated={signals.irrigated} materials={materials} onPick={onPick} />
          <Factory
            built={signals.factoryBuilt}
            solar={signals.solarBuilt}
            materials={materials}
            onPick={onPick}
          />
          <Entity onClick={() => onPick('solar')} position={[-6.5, 0, 6.4]}>
            <Block x={0} y={0.18} z={0} w={3.7} h={0.2} d={1.55} material={materials.sand} />
            {signals.solarBuilt && (
              <Block x={0} y={0.62} z={0} w={3.35} h={0.12} d={1.4} material={materials.solar} />
            )}
          </Entity>
        </>
      ) : (
        <>
          <Marketplace materials={materials} delivered={signals.delivered} />
          <Entity position={[6, 0, 2]}>
            {[-2.2, 0, 2.2].map((x) => (
              <House
                key={x}
                x={x}
                z={0}
                height={descriptor.district === 'coast' ? 4.4 : 2.3}
                materials={materials}
              />
            ))}
          </Entity>
        </>
      )}

      {signals.truckAvailable && <Truck z={truckPosition} materials={materials} />}
      <Person x={3 + walking} z={-2.4} materials={materials} shirt={materials.truck} />
      <Person x={-2.5 - walking} z={-5.8} materials={materials} shirt={materials.crop} />
      <Person x={2.2} z={3 + walking} materials={materials} />
    </Application>
  )
}
