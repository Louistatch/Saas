'use client'

import { type Action, type LifeState, trafficVehicles } from '@/lib/haroolife/lome-life-engine'
import type { PlacedResident } from '@/lib/haroolife/lome-presence'
import {
  type BuildType,
  type Building,
  type City,
  SIZE,
  canBuild,
  terrainAt,
} from '@/lib/haroolife/townsmen-engine'
import { ZOOM_IN_FACTOR, ZOOM_OUT_FACTOR } from '@/lib/haroolife/vendor/house-builder-camera-zoom'
/**
 * HarooVille 3D editor: PlayCanvas React + CC0 Kenney GLB kits.
 * Shares exactly the existing city-builder state, construction rules and saves.
 * Scene geometry is illustrative, not actual surveyed parcels in Kpalimé.
 */
import { Application, Entity, Gltf } from '@playcanvas/react'
import { Camera, Light, Render } from '@playcanvas/react/components'
import { useMaterial, useModel } from '@playcanvas/react/hooks'
import { Compass, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LomeLifeRoom3D from './lome-life-room-3d'
import { PAGNES } from './pagnes'

type EditTool = BuildType | 'inspect' | 'demolish'
type Cell = { x: number; y: number }
type Vec3 = [number, number, number]
const CELL = 1.35
const ORIGIN = (SIZE - 1) / 2
const BASE = '/haroolife/vendor/kenney-3d/'
const ASSETS = {
  hall: BASE + 'commercial/building-a.glb',
  house: BASE + 'suburban/building-type-a.glb',
  lumberyard: BASE + 'suburban/building-type-t.glb',
  mill: BASE + 'suburban/building-type-f.glb',
  bakery: BASE + 'commercial/building-d.glb',
  market: BASE + 'commercial/building-a.glb',
  oak: BASE + 'nature/tree-oak.glb',
  palm: BASE + 'nature/tree-palm.glb',
  tree: BASE + 'nature/tree-default.glb',
  crop: BASE + 'nature/crops-cornstaged.glb',
  bush: BASE + 'nature/plant-bush.glb',
  rock: BASE + 'nature/rock-largea.glb',
  villager: BASE + 'characters/character-female-a.glb',
  taxi: BASE + 'car-kit/taxi.glb',
  sedan: BASE + 'car-kit/sedan.glb',
  van: BASE + 'car-kit/van.glb',
  streetLight: BASE + 'city-kit-roads/light-curved.glb',
  streetSign: BASE + 'city-kit-roads/road-sign-street.glb',
} as const

function positionOf(x: number, y: number): Vec3 {
  return [(x - ORIGIN) * CELL, 0, (y - ORIGIN) * CELL]
}

function Model({
  url,
  scale = 1,
  position = [0, 0, 0],
  rotation = 0,
}: {
  url: string
  scale?: number
  position?: Vec3
  rotation?: number
}) {
  const { asset } = useModel(url)
  if (!asset) return null
  return (
    <Entity position={position} rotation={[0, rotation, 0]} scale={[scale, scale, scale]}>
      <Gltf key={asset.id} asset={asset} />
    </Entity>
  )
}

function Farm({ built }: { built: Building }) {
  return (
    <>
      {[-0.38, 0, 0.38].map((x) =>
        [-0.37, 0.13, 0.5].map((z) => (
          <Model
            key={'corn-' + x + '-' + z}
            url={ASSETS.crop}
            position={[x, 0.02, z]}
            scale={1.12}
            rotation={x > 0 ? 90 : 0}
          />
        )),
      )}
    </>
  )
}

function BuildingModel({ building }: { building: Building }) {
  switch (building.type) {
    case 'hall':
      return <Model url={ASSETS.hall} scale={1.6} rotation={90} />
    case 'house':
      return <Model url={ASSETS.house} scale={1.65} rotation={90} />
    case 'lumberyard':
      return <Model url={ASSETS.lumberyard} scale={1.55} rotation={180} />
    case 'mill':
      return <Model url={ASSETS.mill} scale={1.45} />
    case 'bakery':
      return <Model url={ASSETS.bakery} scale={1.5} />
    case 'market':
      return <Model url={ASSETS.market} scale={1.6} rotation={270} />
    case 'farm':
      return <Farm built={building} />
    case 'park':
      return <Model url={ASSETS.oak} scale={2.1} />
    default:
      return null
  }
}

type MaterialSet = {
  grass: ReturnType<typeof useMaterial>
  dryGrass: ReturnType<typeof useMaterial>
  forest: ReturnType<typeof useMaterial>
  water: ReturnType<typeof useMaterial>
  road: ReturnType<typeof useMaterial>
  farm: ReturnType<typeof useMaterial>
  hover: ReturnType<typeof useMaterial>
  blocked: ReturnType<typeof useMaterial>
  selected: ReturnType<typeof useMaterial>
}

function Tile({
  x,
  y,
  type,
  selected,
  hovered,
  blocked,
  building,
  mats,
  onClick,
  onHover,
}: {
  x: number
  y: number
  type: ReturnType<typeof terrainAt>
  selected: boolean
  hovered: boolean
  blocked: boolean
  building?: Building
  mats: MaterialSet
  onClick: () => void
  onHover: () => void
}) {
  const pos = positionOf(x, y)
  const tint = hovered
    ? blocked
      ? mats.blocked
      : mats.hover
    : selected
      ? mats.selected
      : building?.type === 'road'
        ? mats.road
        : building?.type === 'farm'
          ? mats.farm
          : type === 'water'
            ? mats.water
            : type === 'forest'
              ? mats.forest
              : (x * 13 + y * 7) % 7 === 0
                ? mats.dryGrass
                : mats.grass
  return (
    <Entity
      name={'Plot ' + (x + 1) + '-' + (y + 1)}
      position={pos}
      onClick={onClick}
      onPointerOver={onHover}
    >
      <Entity position={[0, -0.035, 0]} scale={[CELL * 0.996, 0.065, CELL * 0.996]}>
        <Render type="box" material={tint} />
      </Entity>
      {building ? (
        <BuildingModel building={building} />
      ) : type === 'forest' && (x * 11 + y * 5) % 7 < 2 ? (
        <Model
          url={(x + y) % 4 === 0 ? ASSETS.palm : (x + y) % 3 === 0 ? ASSETS.oak : ASSETS.tree}
          scale={(x + y) % 4 === 0 ? 2.1 : 1.7}
          rotation={(x * 41 + y * 19) % 360}
        />
      ) : type === 'grass' && (x * 3 + y * 11) % 43 === 0 ? (
        <Model url={ASSETS.bush} scale={1.1} />
      ) : null}
      {building?.type === 'well' && (
        <>
          <Entity scale={[0.46, 0.45, 0.46]} position={[0, 0.28, 0]}>
            <Render type="cylinder" material={mats.road} />
          </Entity>
          <Entity scale={[0.38, 0.035, 0.38]} position={[0, 0.53, 0]}>
            <Render type="cylinder" material={mats.water} />
          </Entity>
        </>
      )}
    </Entity>
  )
}

function SettlementScene({
  city,
  tool,
  selected,
  pan,
  distance,
  angle,
  onTile,
  canTap,
  life,
  onInteriorAction,
  visitors = [],
}: {
  visitors?: PlacedResident[]
  city: City
  life?: LifeState
  onInteriorAction?: (action: Action) => void
  tool: EditTool
  selected: Cell | null
  pan: { x: number; z: number }
  distance: number
  angle: number
  onTile: (x: number, y: number) => void
  canTap: () => boolean
}) {
  const [hover, setHover] = useState<Cell | null>(null)
  const grass = useMaterial({ diffuse: '#79aa59', gloss: 0.08 })
  const dryGrass = useMaterial({ diffuse: '#90b76b', gloss: 0.08 })
  const forest = useMaterial({ diffuse: '#659c59', gloss: 0.06 })
  const water = useMaterial({ diffuse: '#59b4ca', gloss: 0.35 })
  const road = useMaterial({ diffuse: '#a88a65', gloss: 0.05 })
  const farm = useMaterial({ diffuse: '#9b744b', gloss: 0.05 })
  const hoveredMaterial = useMaterial({ diffuse: '#b8e9a0', emissive: '#385b29', gloss: 0.1 })
  const blocked = useMaterial({ diffuse: '#dc886b', gloss: 0.1 })
  const highlighted = useMaterial({ diffuse: '#e7d07e', gloss: 0.1 })
  const pagne0 = useMaterial({ diffuse: PAGNES[0], gloss: 0.1 })
  const pagne1 = useMaterial({ diffuse: PAGNES[1], gloss: 0.1 })
  const pagne2 = useMaterial({ diffuse: PAGNES[2], gloss: 0.1 })
  const pagne3 = useMaterial({ diffuse: PAGNES[3], gloss: 0.1 })
  const pagne4 = useMaterial({ diffuse: PAGNES[4], gloss: 0.1 })
  const pagne5 = useMaterial({ diffuse: PAGNES[5], gloss: 0.1 })
  const pagne6 = useMaterial({ diffuse: PAGNES[6], gloss: 0.1 })
  const pagne7 = useMaterial({ diffuse: PAGNES[7], gloss: 0.1 })
  const pagnes = [pagne0, pagne1, pagne2, pagne3, pagne4, pagne5, pagne6, pagne7]
  const mats = useMemo(
    () => ({
      grass,
      dryGrass,
      forest,
      water,
      road,
      farm,
      hover: hoveredMaterial,
      blocked,
      selected: highlighted,
    }),
    [grass, dryGrass, forest, water, road, farm, hoveredMaterial, blocked, highlighted],
  )
  const objects = useMemo(
    () => new Map(city.buildings.map((b) => [b.x + ':' + b.y, b])),
    [city.buildings],
  )
  const plots = useMemo(() => {
    const result: Cell[] = []
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) result.push({ x, y })
    return result
  }, [])
  const azimuth = (angle * Math.PI) / 180
  const camera: Vec3 = [
    pan.x + Math.sin(azimuth) * distance * 0.78,
    distance * 0.84,
    pan.z + Math.cos(azimuth) * distance * 0.78,
  ]
  const isBlocked =
    hover && tool !== 'inspect' && tool !== 'demolish'
      ? canBuild(city, hover.x, hover.y, tool) !== null
      : false

  if (life?.inside)
    return (
      <LomeLifeRoom3D
        venue={life.inside}
        angle={angle}
        distance={distance * 1.9}
        onInteract={onInteriorAction}
      />
    )

  return (
    <>
      <Entity position={camera} rotation={[-52, angle, 0]}>
        <Camera fov={47} nearClip={0.2} farClip={140} clearColor="#bde0df" />
      </Entity>
      <Entity rotation={[56, 28, 0]}>
        <Light type="directional" intensity={1.55} />
      </Entity>
      <Entity rotation={[22, 200, 0]}>
        <Light type="directional" intensity={0.7} />
      </Entity>
      <Entity position={[0, -0.14, 0]} scale={[SIZE * CELL + 2, 0.22, SIZE * CELL + 2]}>
        <Render type="box" material={grass} />
      </Entity>
      {plots.map(({ x, y }) => (
        <Tile
          key={x + ':' + y}
          x={x}
          y={y}
          type={terrainAt(x, y)}
          building={objects.get(x + ':' + y)}
          selected={selected?.x === x && selected?.y === y}
          hovered={hover?.x === x && hover?.y === y}
          blocked={Boolean(isBlocked)}
          mats={mats}
          onClick={() => {
            if (canTap()) onTile(x, y)
          }}
          onHover={() => setHover((prev) => (prev?.x === x && prev?.y === y ? prev : { x, y }))}
        />
      ))}
      {life ? (
        <>
          {!life.inside && (
            <Entity name="Joueur de Lomé" position={positionOf(life.pos.x, life.pos.y)}>
              <Model
                url={ASSETS.villager}
                scale={1.55}
                rotation={(life.trafficStep * 37) % 360}
                position={[0, 0.065, 0]}
              />
              <Entity position={[0, 0.025, 0]} scale={[0.9, 0.025, 0.9]}>
                <Render type="cylinder" material={highlighted} />
              </Entity>
            </Entity>
          )}
          {visitors.map((v) => (
            <Entity
              key={'visitor-' + v.resident.display_name + v.x + ':' + v.y}
              name={'Habitant ' + v.resident.display_name}
              position={positionOf(v.x, v.y)}
            >
              <Model
                url={ASSETS.villager}
                scale={1.35}
                rotation={v.rotation}
                position={[0, 0.05, 0]}
              />
              <Entity position={[0, 0.02, 0]} scale={[0.75, 0.02, 0.75]}>
                <Render type="cylinder" material={pagnes[(v.resident.pagne - 1 + 8) % 8]} />
              </Entity>
            </Entity>
          ))}
          {trafficVehicles(life).map((v) => {
            const at = positionOf(v.x, v.y)
            return (
              <Entity key={'traffic-' + v.kind} position={at}>
                {v.kind === 'taxi' ? (
                  <Model url={ASSETS.taxi} scale={0.9} rotation={v.heading} />
                ) : v.kind === 'sedan' ? (
                  <Model url={ASSETS.sedan} scale={0.83} rotation={v.heading} />
                ) : v.kind === 'van' ? (
                  <Model url={ASSETS.van} scale={0.78} rotation={v.heading} />
                ) : (
                  <Model
                    url={ASSETS.villager}
                    scale={0.85}
                    rotation={v.heading}
                    position={[0.4, 0, 0.4]}
                  />
                )}
              </Entity>
            )
          })}
          {life.city.buildings
            .filter((b) => b.type === 'road')
            .slice(0, 2)
            .map((b, i) => (
              <Entity key={'street-furniture-' + i} position={positionOf(b.x, b.y)}>
                <Model
                  url={i === 0 ? ASSETS.streetLight : ASSETS.streetSign}
                  scale={i === 0 ? 1.45 : 0.8}
                  position={[0.48, 0, -0.38]}
                  rotation={90}
                />
              </Entity>
            ))}
          {life.inside && (
            <Entity name="Intérieur accessible" position={positionOf(life.pos.x, life.pos.y)}>
              <Entity position={[0, 2, 0]} scale={[6, 0.25, 5]}>
                <Render type="box" material={road} />
              </Entity>
              <Entity position={[0, 2.75, 2.25]} scale={[5.8, 1.3, 0.18]}>
                <Render type="box" material={dryGrass} />
              </Entity>
              <Entity position={[-2.9, 2.75, 0]} scale={[0.18, 1.3, 4.5]}>
                <Render type="box" material={dryGrass} />
              </Entity>
              <Entity position={[-0.4, 2.4, 0.5]} scale={[1.4, 0.6, 1]}>
                <Render type="box" material={forest} />
              </Entity>
              <Entity position={[0, 2.15, -0.5]}>
                <Model url={ASSETS.villager} scale={0.65} />
              </Entity>
            </Entity>
          )}
        </>
      ) : (
        city.buildings
          .filter((b) => b.type === 'road')
          .slice(0, 7)
          .map((b, i) => {
            const at = positionOf(b.x, b.y)
            return (
              <Entity
                key={'citizen' + i}
                position={[at[0] + ((i % 3) - 1) * 0.3, 0.01, at[2] + (i % 2 ? 0.24 : -0.25)]}
              >
                <Model url={ASSETS.villager} scale={0.28} rotation={(i * 57) % 360} />
              </Entity>
            )
          })
      )}
    </>
  )
}

export default function CityWorld3D({
  city,
  tool,
  inspect,
  onTile,
  life,
  immersive = false,
  onInteriorAction,
  visitors,
}: {
  visitors?: PlacedResident[]
  city: City
  life?: LifeState
  onInteriorAction?: (action: Action) => void
  immersive?: boolean
  tool: EditTool
  inspect: Cell | null
  onTile: (x: number, y: number) => void
}) {
  const [distance, setDistance] = useState(life ? 14 : 37)
  const [angle, setAngle] = useState(45)
  const [pan, setPan] = useState({ x: 0, z: 0 })
  const [dragState, setDragState] = useState(false)
  const pointer = useRef<{ x: number; y: number; px: number; pz: number; moved: boolean } | null>(
    null,
  )
  const ignoreClickUntil = useRef(0)

  const checkClick = useCallback(
    () => !dragState && Date.now() > ignoreClickUntil.current,
    [dragState],
  )
  // Keyboard camera: Q/E rotate by 45°, +/- zoom. Arrow keys are left to the player controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const k = e.key.toLowerCase()
      if (k === 'q') setAngle((a) => (a + 315) % 360)
      else if (k === 'e') setAngle((a) => (a + 45) % 360)
      else if (k === '+' || k === '=') setDistance((d) => Math.max(9, d * ZOOM_IN_FACTOR))
      else if (k === '-') setDistance((d) => Math.min(60, d * ZOOM_OUT_FACTOR))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onStart = (e: React.PointerEvent<HTMLDivElement>) => {
    pointer.current = { x: e.clientX, y: e.clientY, px: pan.x, pz: pan.z, moved: false }
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pointer.current
    if (!p) return
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y
    if (Math.hypot(dx, dy) > 8) p.moved = true
    if (p.moved) {
      setDragState(true)
      // Navigate on a ground plane; CSS pixels mapped to world-space units.
      setPan({
        x: Math.max(-13, Math.min(13, p.px - dx / (25 * (37 / distance)))),
        z: Math.max(-13, Math.min(13, p.pz - dy / (25 * (37 / distance)))),
      })
    }
  }
  const onEnd = () => {
    if (pointer.current?.moved) ignoreClickUntil.current = Date.now() + 180
    pointer.current = null
    setDragState(false)
  }
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#aad1c5]">
      <div
        className="h-full w-full touch-none"
        onPointerDownCapture={onStart}
        onPointerMoveCapture={onMove}
        onPointerUpCapture={onEnd}
        onPointerCancelCapture={onEnd}
      >
        <Application
          graphicsDeviceOptions={{ antialias: true }}
          className="h-full w-full"
          style={{ width: '100%', height: '100%' }}
        >
          <SettlementScene
            city={city}
            tool={tool}
            selected={inspect}
            life={life}
            visitors={visitors}
            pan={
              life
                ? {
                    x: positionOf(life.pos.x, life.pos.y)[0] + pan.x,
                    z: positionOf(life.pos.x, life.pos.y)[2] + pan.z,
                  }
                : pan
            }
            distance={life?.inside ? 11 : distance}
            angle={angle}
            onTile={onTile}
            canTap={checkClick}
            onInteriorAction={onInteriorAction}
          />
        </Application>
      </div>
      {!immersive && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-xl bg-emerald-950/85 px-3 py-2 text-xs font-bold text-white shadow">
          <Compass className="mr-1 inline h-4 w-4" aria-hidden="true" />
          {life
            ? 'LOMÉ LIFE 3D · JOUR ' + life.day + ' · ' + life.hour + ' H'
            : 'HAROOVILLE 3D · JOUR ' + city.day}{' '}
          · CC0 KENNEY
        </div>
      )}
      <div
        className={
          immersive
            ? 'absolute right-3 top-[33%] flex flex-col gap-2'
            : 'absolute right-3 top-3 flex flex-col gap-2'
        }
      >
        <button
          type="button"
          title="Zoom avant"
          aria-label="Zoom avant"
          onClick={() => setDistance((d) => Math.max(9, d * ZOOM_IN_FACTOR))}
          className="rounded-xl bg-white/95 p-3 text-emerald-950 shadow"
        >
          <Plus className="h-5 w-5" />
        </button>
        <button
          type="button"
          title="Zoom arrière"
          aria-label="Zoom arrière"
          onClick={() => setDistance((d) => Math.min(60, d * ZOOM_OUT_FACTOR))}
          className="rounded-xl bg-white/95 p-3 text-emerald-950 shadow"
        >
          <Minus className="h-5 w-5" />
        </button>
        <button
          type="button"
          title="Tourner la caméra"
          aria-label="Tourner la caméra"
          onClick={() => setAngle((a) => (a + 45) % 360)}
          className="rounded-xl bg-white/95 p-3 text-emerald-950 shadow"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        <button
          type="button"
          title="Recentrer la vue"
          aria-label="Recentrer la vue"
          onClick={() => {
            setDistance(life ? 14 : 37)
            setAngle(45)
            setPan({ x: 0, z: 0 })
          }}
          className="rounded-xl bg-white/95 p-3 text-emerald-950 shadow"
        >
          <Maximize2 className="h-5 w-5" />
        </button>
      </div>
      {!immersive && (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[70%] rounded-lg bg-emerald-950/85 px-3 py-2 text-xs text-white">
          Touchez une parcelle pour{' '}
          {life && tool === 'inspect'
            ? 'vous déplacer'
            : tool === 'inspect'
              ? 'inspecter'
              : tool === 'demolish'
                ? 'démolir'
                : 'construire'}{' '}
          · Glissez pour déplacer · +/− pour zoomer
        </div>
      )}
    </div>
  )
}
