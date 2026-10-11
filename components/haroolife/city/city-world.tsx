'use client'

import { type NpcAnim, type Prop, layoutFor } from '@/lib/haroolife/city/interiors'
import type { Interior } from '@/lib/haroolife/city/life'
import { type Agent, agentsNear } from '@/lib/haroolife/city/traffic'
import {
  CATEGORY_OF,
  CELL,
  type Category,
  ESTATE,
  type Lot,
  SIZE_HINT,
  TYPE_ICONS,
  landmarks,
} from '@/lib/haroolife/city/world'
import type { Transport } from '@/lib/haroolife/lome-life-engine'
import type { PlacedResident } from '@/lib/haroolife/lome-presence'
import type { BuildType, City } from '@/lib/haroolife/townsmen-engine'
/**
 * The city of Lomé in 3D: streamed chunks of real buildings, the player's estate embedded
 * at its world offset, vehicles and pedestrians on real routes, day and night, the player,
 * a free aerial camera (drag to pan, pinch or buttons to zoom, Q/E or button to rotate),
 * ground picking, the selected place highlighted on the ground, and named place labels
 * projected over the canvas. Interiors and rides replace the city view in the same
 * PlayCanvas application.
 */
import { Application, Entity, Gltf } from '@playcanvas/react'
import { Camera, Light, Render } from '@playcanvas/react/components'
import { useApp, useAppEvent, useMaterial, useModel } from '@playcanvas/react/hooks'
import { Compass, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import * as pc from 'playcanvas'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ESTATE_ASSETS, EstateTiles } from '../city-world-3d'
import { Ride } from '../travel-scene-3d'
import { Character } from './character'
import CityChunks, { type ChunkStats, cellOf, worldPos } from './city-chunks'
import InteriorScene from './interior-scene'
import { type Bank, bakedMaterial, loadBank, meshFor } from './model-bank'

export type CameraState = { tx: number; tz: number; distance: number; angle: number }
/** Frame the player with the dense city around: the target sits a little south-east of them. */
export const CAMERA_HOME = (x: number, y: number): CameraState => {
  const [px, , pz] = worldPos(x - 4, y + 3)
  return { tx: px, tz: pz, distance: 28, angle: 35 }
}
type EditTool = BuildType | 'inspect' | 'demolish'
/** The player's own look (a Kenney Mini Character). */
export const PLAYER_MODEL = 'character-female-a'

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

function useBank(): Bank | null {
  const [bank, setBank] = useState<Bank | null>(null)
  useEffect(() => {
    let alive = true
    loadBank()
      .then((b) => alive && setBank(b))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  return bank
}

/** One baked model as its own entity (vehicles): shares the pack's GPU mesh. */
function Baked({
  model,
  position,
  rotation = 0,
  scale = 1,
  name,
}: {
  model: string
  position: [number, number, number]
  rotation?: number
  scale?: number
  name?: string
}) {
  const app = useApp()
  const bank = useBank()
  const ref = useRef<pc.Entity | null>(null)
  useEffect(() => {
    if (!app || !bank) return
    const e = new pc.Entity(name ?? model)
    e.addComponent('render', {
      meshInstances: [
        new pc.MeshInstance(meshFor(app.graphicsDevice, bank, model), bakedMaterial()),
      ],
    })
    app.root.addChild(e)
    ref.current = e
    return () => {
      e.destroy()
      ref.current = null
    }
  }, [app, bank, model, name])
  useEffect(() => {
    const e = ref.current
    if (!e) return
    e.setLocalPosition(position[0], position[1], position[2])
    e.setLocalEulerAngles(0, rotation, 0)
    e.setLocalScale(scale, scale, scale)
  })
  return null
}

/** Vehicles and pedestrians, moved smoothly between traffic steps. */
function Agents({ agents, step }: { agents: Agent[]; step: number }) {
  const [phase, setPhase] = useState(0)
  const last = useRef({ step, at: performance.now() })
  if (last.current.step !== step) last.current = { step, at: performance.now() }
  useAppEvent('update', () => {
    const p = Math.min(1, (performance.now() - last.current.at) / 700)
    setPhase((old) => (Math.abs(old - p) > 0.02 ? p : old))
  })
  return (
    <>
      {agents.map((a) => {
        const pos = worldPos(a.x + a.fx * phase, a.y + a.fy * phase)
        if (a.kind === 'walker')
          return (
            <Character
              key={a.id}
              name={`piéton ${a.id}`}
              model={a.model ?? 'character-male-a'}
              position={[pos[0] + 0.42, 0.04, pos[2] + 0.42]}
              rotation={a.heading}
              anim={a.activity === 'run' ? 'run' : 'walk'}
              scale={0.95}
            />
          )
        if (a.kind === 'zem')
          return (
            <Entity
              key={a.id}
              position={[pos[0] - 0.25, 0.05, pos[2]]}
              rotation={[0, a.heading, 0]}
            >
              <Character model="character-male-b" position={[0, 0, 0]} anim="rest" scale={0.85} />
              <Baked model="hatchback" position={[0, 0, 0]} scale={0.001} />
            </Entity>
          )
        const lane = a.fx !== 0 ? [0, 0.26 * Math.sign(a.fx)] : [-0.26 * Math.sign(a.fy || 1), 0]
        return (
          <Baked
            key={a.id}
            name={`véhicule ${a.kind}`}
            model={a.kind}
            position={[pos[0] + lane[0], 0.02, pos[2] + lane[1]]}
            rotation={a.heading + 180}
            scale={0.36}
          />
        )
      })}
    </>
  )
}

function PlayerFigure({
  position,
  rotation,
  moving,
}: { position: [number, number, number]; rotation: number; moving: boolean }) {
  const highlighted = useMaterial({ diffuse: '#e7d07e', emissive: '#6b5a1a', gloss: 0.2 })
  return (
    <Entity name="Joueur" position={position}>
      <Character
        model={PLAYER_MODEL}
        position={[position[0], 0.05, position[2]]}
        rotation={rotation}
        anim={moving ? 'walk' : 'idle'}
        scale={1.15}
      />
      <Entity position={[0, 0.02, 0]} scale={[0.9, 0.025, 0.9]}>
        <Render type="cylinder" material={highlighted} />
      </Entity>
    </Entity>
  )
}

/** A glowing plate under the selected place. */
function SelectionRing({
  position,
  w,
  d,
}: { position: [number, number, number]; w: number; d: number }) {
  const ring = useMaterial({ diffuse: '#34d399', emissive: '#10b981', gloss: 0.4 })
  return (
    <Entity name="Sélection" position={position} scale={[w, 0.02, d]}>
      <Render type="box" material={ring} />
    </Entity>
  )
}

/** Sun, sky and ambient light for an hour of the day. */
export function daylight(hour: number) {
  const t = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI)) // 0 at night, 1 at noon
  const dawn = hour >= 5 && hour <= 8 ? 1 - Math.abs(hour - 6.5) / 1.5 : 0
  const dusk = hour >= 17 && hour <= 20 ? 1 - Math.abs(hour - 18.5) / 1.5 : 0
  const warm = Math.max(0, dawn, dusk)
  const mix = (
    a: [number, number, number],
    b: [number, number, number],
    k: number,
  ): [number, number, number] => [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ]
  const night: [number, number, number] = [0.1, 0.16, 0.3]
  const day: [number, number, number] = [0.62, 0.82, 0.91]
  const gold: [number, number, double] = [0.96, 0.68, 0.45] as unknown as [number, number, number]
  let sky = mix(night, day, Math.min(1, t * 1.6))
  sky = mix(sky, gold as unknown as [number, number, number], warm * 0.7)
  const hex = (c: [number, number, number]) =>
    `#${c
      .map((v) =>
        Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`
  const sun = 0.25 + t * 1.3
  const sunColor = hex(
    mix([0.8, 0.85, 1], mix([1, 1, 0.96], [1, 0.78, 0.55], warm), Math.min(1, t * 2)),
  )
  const ambient = hex(mix([0.12, 0.16, 0.28], [0.72, 0.8, 0.86], Math.min(1, t * 1.8)))
  return { sky: hex(sky), sun, sunColor, ambient, night: t < 0.08 }
}
type double = number

function Ambient({ color }: { color: string }) {
  const app = useApp()
  useEffect(() => {
    if (!app) return
    app.scene.ambientLight = new pc.Color().fromString(color)
  }, [app, color])
  return null
}

/** Pointer handling on the canvas: drag pans, pinch zooms, tap picks a world cell. */
function Picker({
  camera,
  onPan,
  onZoom,
  onTap,
}: {
  camera: CameraState
  onPan: (dx: number, dz: number) => void
  onZoom: (factor: number) => void
  onTap: (cell: { x: number; y: number }) => void
}) {
  const app = useApp()
  const cam = useRef(camera)
  cam.current = camera
  useEffect(() => {
    if (!app) return
    const canvas = app.graphicsDevice.canvas as HTMLCanvasElement
    const pointers = new Map<number, { x: number; y: number }>()
    let moved = false
    let startDist = 0
    let last: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 1) {
        moved = false
        last = { x: e.clientX, y: e.clientY }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        startDist = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (startDist > 0 && Math.abs(d - startDist) > 6) {
          onZoom(startDist / d)
          startDist = d
        }
        moved = true
        return
      }
      if (!last) return
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      if (!moved && Math.hypot(dx, dy) < 7) return
      moved = true
      last = { x: e.clientX, y: e.clientY }
      // Screen drag → ground drag, rotated by the camera azimuth and scaled with distance.
      const k = cam.current.distance / 520
      const a = (cam.current.angle * Math.PI) / 180
      const gx = -(dx * Math.cos(a) - dy * Math.sin(a)) * k
      const gz = -(dx * Math.sin(a) + dy * Math.cos(a)) * k
      onPan(gx, gz)
    }
    const up = (e: PointerEvent) => {
      const wasSingle = pointers.size === 1
      pointers.delete(e.pointerId)
      if (!wasSingle || moved) {
        if (pointers.size === 0) last = null
        return
      }
      last = null
      const camEntity = app.root.findByName('CityCamera') as pc.Entity | null
      const cc = camEntity?.camera
      if (!cc) return
      const rect = canvas.getBoundingClientRect()
      const sx = ((e.clientX - rect.left) * canvas.width) / rect.width
      const sy = ((e.clientY - rect.top) * canvas.height) / rect.height
      const from = cc.screenToWorld(sx, sy, cc.nearClip)
      const to = cc.screenToWorld(sx, sy, cc.farClip)
      const dir = new pc.Vec3().sub2(to, from)
      if (Math.abs(dir.y) < 1e-6) return
      const t = -from.y / dir.y
      if (t < 0) return
      const hit = new pc.Vec3().copy(dir).mulScalar(t).add(from)
      onTap(cellOf(hit.x, hit.z))
    }
    canvas.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [app, onPan, onZoom, onTap])
  return null
}

/** Projects place labels onto the overlay each frame, without React re-renders. */
function LabelProjector({
  overlay,
  lots,
}: { overlay: React.RefObject<HTMLDivElement | null>; lots: Lot[] }) {
  const app = useApp()
  const tmp = useRef(new pc.Vec3())
  useAppEvent('update', () => {
    if (!app || !overlay.current) return
    const camEntity = app.root.findByName('CityCamera') as pc.Entity | null
    const cc = camEntity?.camera
    if (!cc) return
    const canvas = app.graphicsDevice.canvas as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const kx = rect.width / canvas.width
    const ky = rect.height / canvas.height
    const children = overlay.current.children
    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement
      const lot = lots[i]
      if (!lot) continue
      const [px, , pz] = worldPos(lot.x + (lot.w - 1) / 2, lot.y + (lot.h - 1) / 2)
      const h = 0.6 + lot.floors * 0.5 + 0.9
      const p = cc.worldToScreen(new pc.Vec3(px, h, pz), tmp.current)
      const visible =
        p.z > 0 &&
        p.x >= -60 &&
        p.y >= -40 &&
        p.x * kx <= rect.width + 60 &&
        p.y * ky <= rect.height + 40
      el.style.display = visible ? '' : 'none'
      if (visible)
        el.style.transform = `translate(${Math.round(p.x * kx)}px, ${Math.round(p.y * ky)}px) translate(-50%, -100%)`
    }
  })
  return null
}

/** Frame statistics for the debug hook and the e2e performance check. */
function StatsProbe({ onFrame }: { onFrame: (s: { drawCalls: number; fps: number }) => void }) {
  const app = useApp()
  const last = useRef(0)
  useAppEvent('update', () => {
    if (!app) return
    const now = performance.now()
    if (now - last.current < 1000) return
    last.current = now
    const stats = app.stats as unknown as { drawCalls: { total: number }; frame: { fps: number } }
    onFrame({ drawCalls: stats.drawCalls.total, fps: Math.round(stats.frame.fps) })
  })
  return null
}

export default function CityWorld({
  city,
  tool,
  selected,
  onTile,
  player,
  playerRotation,
  moving,
  camera,
  onCamera,
  step,
  hour,
  interior,
  interiorTitle,
  activity,
  onUseProp,
  ride,
  visitors,
  onBillboard,
  onCell,
  onLotIcon,
  filter,
  selectedLot,
  labelsHidden,
  onStats,
  onFrame,
}: {
  city: City
  tool: EditTool
  selected: { x: number; y: number } | null
  onTile: (x: number, y: number) => void
  /** Player world cell. */
  player: { x: number; y: number }
  playerRotation: number
  moving: boolean
  camera: CameraState
  onCamera: (c: CameraState) => void
  step: number
  hour: number
  interior: Interior | null
  interiorTitle: string
  activity: { prop: string; anim: NpcAnim } | null
  onUseProp: (p: Prop) => void
  ride: { transport: Transport; rain: boolean } | null
  visitors: PlacedResident[]
  onBillboard: (id: string) => void
  onCell: (cell: { x: number; y: number }) => void
  onLotIcon: (lot: Lot) => void
  filter: Category | 'all'
  selectedLot: Lot | null
  labelsHidden: boolean
  onStats?: (s: ChunkStats) => void
  onFrame?: (s: { drawCalls: number; fps: number }) => void
}) {
  const overlay = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const centerCell = useMemo(() => cellOf(camera.tx, camera.tz), [camera.tx, camera.tz])
  const agents = useMemo(
    () => agentsNear(step, centerCell.x, centerCell.y, 22),
    [step, centerCell.x, centerCell.y],
  )
  const labels = useMemo(() => {
    const all = landmarks().filter((l) => filter === 'all' || CATEGORY_OF[l.type] === filter)
    const radius = camera.distance < 40 ? 20 : 34
    return all
      .filter(
        (l) => Math.abs(l.x - centerCell.x) < radius && Math.abs(l.y - centerCell.y) < radius * 0.8,
      )
      .slice(0, 28)
  }, [centerCell.x, centerCell.y, filter, camera.distance])
  const light = useMemo(() => daylight(hour), [hour])

  const onPan = useCallback(
    (dx: number, dz: number) => {
      dragging.current = true
      onCamera({
        ...camera,
        tx: Math.max(-90, Math.min(90, camera.tx + dx)),
        tz: Math.max(-60, Math.min(60, camera.tz + dz)),
      })
    },
    [camera, onCamera],
  )
  const onZoom = useCallback(
    (f: number) =>
      onCamera({ ...camera, distance: Math.max(9, Math.min(110, camera.distance * f)) }),
    [camera, onCamera],
  )
  const onTap = useCallback(
    (cell: { x: number; y: number }) => {
      if (interior || ride) return
      // Estate tiles have their own click handlers.
      if (
        cell.x >= ESTATE.x0 &&
        cell.y >= ESTATE.y0 &&
        cell.x < ESTATE.x0 + ESTATE.size &&
        cell.y < ESTATE.y0 + ESTATE.size
      )
        return
      onCell(cell)
    },
    [interior, ride, onCell],
  )
  const canTap = useCallback(() => true, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const k = e.key.toLowerCase()
      if (k === 'q') onCamera({ ...camera, angle: (camera.angle + 315) % 360 })
      else if (k === 'e') onCamera({ ...camera, angle: (camera.angle + 45) % 360 })
      else if (k === '+' || k === '=') onZoom(0.8)
      else if (k === '-') onZoom(1.25)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [camera, onCamera, onZoom])

  const az = (camera.angle * Math.PI) / 180
  const camPos: [number, number, number] = [
    camera.tx + Math.sin(az) * camera.distance * 0.72,
    camera.distance * 0.9,
    camera.tz + Math.cos(az) * camera.distance * 0.72,
  ]
  const playerPos = worldPos(player.x, player.y)
  const estateCenter = worldPos(ESTATE.x0 + (SIZE_HINT - 1) / 2, ESTATE.y0 + (SIZE_HINT - 1) / 2)
  const scene = interior || ride
  const selPos = selectedLot
    ? worldPos(selectedLot.x + (selectedLot.w - 1) / 2, selectedLot.y + (selectedLot.h - 1) / 2)
    : null

  return (
    <div
      className="relative h-full w-full touch-none overflow-hidden"
      style={{ background: light.sky }}
      data-testid="city-world"
    >
      <Application
        graphicsDeviceOptions={{ antialias: true }}
        className="h-full w-full"
        style={{ width: '100%', height: '100%' }}
      >
        {onFrame && <StatsProbe onFrame={onFrame} />}
        {ride ? (
          <Ride transport={ride.transport} rain={ride.rain} />
        ) : interior ? (
          <InteriorScene
            layout={layoutFor(interior)}
            title={interiorTitle}
            angle={camera.angle}
            distance={24}
            activity={activity}
            playerModel={PLAYER_MODEL}
            onUse={onUseProp}
          />
        ) : (
          <>
            <Entity name="CityCamera" position={camPos} rotation={[-52, camera.angle, 0]}>
              <Camera fov={46} nearClip={0.5} farClip={420} clearColor={light.sky} />
            </Entity>
            <Ambient color={light.ambient} />
            <Entity rotation={[56, 28, 0]}>
              <Light type="directional" intensity={light.sun} color={light.sunColor} />
            </Entity>
            <Entity rotation={[22, 200, 0]}>
              <Light
                type="directional"
                intensity={light.night ? 0.2 : 0.55}
                color={light.night ? '#8fa8ff' : '#ffffff'}
              />
            </Entity>
            <CityChunks centerX={centerCell.x} centerY={centerCell.y} onStats={onStats} />
            <Entity position={estateCenter}>
              <EstateTiles
                city={city}
                tool={tool}
                selected={selected}
                onTile={onTile}
                canTap={canTap}
                visitors={visitors}
                onBillboard={onBillboard}
              />
            </Entity>
            {selPos && selectedLot && (
              <SelectionRing
                position={[selPos[0], 0.03, selPos[2]]}
                w={selectedLot.w * CELL + 0.3}
                d={selectedLot.h * CELL + 0.3}
              />
            )}
            <Agents agents={agents} step={step} />
            <PlayerFigure position={playerPos} rotation={playerRotation} moving={moving} />
            <Picker camera={camera} onPan={onPan} onZoom={onZoom} onTap={onTap} />
            <LabelProjector overlay={overlay} lots={labels} />
          </>
        )}
      </Application>
      {!scene && (
        <div
          ref={overlay}
          className="pointer-events-none absolute inset-0"
          aria-hidden={labelsHidden ? 'true' : undefined}
          style={{ visibility: labelsHidden ? 'hidden' : 'visible' }}
        >
          {labels.map((lot) => (
            <button
              type="button"
              key={lot.id}
              onClick={() => onLotIcon(lot)}
              tabIndex={labelsHidden ? -1 : 0}
              className={`pointer-events-auto absolute left-0 top-0 flex max-w-[170px] items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-bold shadow-md ${
                selectedLot?.id === lot.id
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-white bg-white/95 text-slate-900'
              }`}
              title={lot.name ?? ''}
              style={{ display: 'none' }}
            >
              <span className="text-sm leading-none">{TYPE_ICONS[lot.type]}</span>
              <span className="truncate">{lot.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="absolute right-3 top-[33%] flex flex-col gap-2">
        <button
          type="button"
          aria-label="Zoom avant"
          onClick={() => onZoom(0.8)}
          className="rounded-xl bg-white/95 p-3 text-emerald-950 shadow"
        >
          <Plus className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Zoom arrière"
          onClick={() => onZoom(1.25)}
          className="rounded-xl bg-white/95 p-3 text-emerald-950 shadow"
        >
          <Minus className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Tourner la caméra"
          onClick={() => onCamera({ ...camera, angle: (camera.angle + 45) % 360 })}
          className="rounded-xl bg-white/95 p-3 text-emerald-950 shadow"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Recentrer sur moi"
          onClick={() => onCamera(CAMERA_HOME(player.x, player.y))}
          className="rounded-xl bg-white/95 p-3 text-emerald-950 shadow"
        >
          <Maximize2 className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Vue de la ville"
          onClick={() => onCamera({ ...CAMERA_HOME(60, 40), distance: 100 })}
          className="rounded-xl bg-white/95 p-3 text-emerald-950 shadow"
        >
          <Compass className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
export { Model as CityModel, ESTATE_ASSETS as CITY_ESTATE_ASSETS }
