'use client'

import type { Interior } from '@/lib/haroolife/city/life'
import { type Agent, agentsNear } from '@/lib/haroolife/city/traffic'
import {
  CATEGORY_OF,
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
 * The city of Lomé in 3D: streamed chunk geometry, the player's estate embedded at its
 * world offset, vehicles and pedestrians on the streets, the player, a free aerial camera
 * (drag to pan, pinch or buttons to zoom, Q/E or button to rotate), ground picking, and
 * landmark icons projected over the canvas. Interiors and rides replace the city view in
 * the same PlayCanvas application, as before.
 */
import { Application, Entity, Gltf } from '@playcanvas/react'
import { Camera, Light, Render } from '@playcanvas/react/components'
import { useApp, useAppEvent, useMaterial, useModel } from '@playcanvas/react/hooks'
import { Compass, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import * as pc from 'playcanvas'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ESTATE_ASSETS, EstateTiles } from '../city-world-3d'
import LomeLifeRoom3D from '../lome-life-room-3d'
import { Ride } from '../travel-scene-3d'
import CityChunks, { type ChunkStats, cellOf, worldPos } from './city-chunks'

export type CameraState = { tx: number; tz: number; distance: number; angle: number }
export const CAMERA_HOME = (x: number, y: number): CameraState => {
  const [px, , pz] = worldPos(x, y)
  return { tx: px, tz: pz, distance: 36, angle: 35 }
}
type EditTool = BuildType | 'inspect' | 'demolish'

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

function AgentModel({ a }: { a: Agent }) {
  const pos = worldPos(a.x, a.y)
  if (a.kind === 'walker')
    return (
      <Model
        url={ESTATE_ASSETS.villager}
        position={[pos[0] + 0.35, 0, pos[2] + 0.3]}
        scale={0.8}
        rotation={a.heading}
      />
    )
  if (a.kind === 'zem')
    return (
      <Model
        url={ESTATE_ASSETS.villager}
        position={[pos[0] - 0.2, 0.05, pos[2]]}
        scale={0.75}
        rotation={a.heading}
      />
    )
  const url =
    a.kind === 'taxi'
      ? ESTATE_ASSETS.taxi
      : a.kind === 'van'
        ? ESTATE_ASSETS.van
        : ESTATE_ASSETS.sedan
  return <Model url={url} position={pos} scale={0.72} rotation={a.heading} />
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

/** Projects landmark icons onto the overlay each frame, without React re-renders. */
function IconProjector({
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
      const h = 0.55 + lot.floors * 0.55 + 0.9
      const p = cc.worldToScreen(new pc.Vec3(px, h, pz), tmp.current)
      const visible =
        p.z > 0 &&
        p.x >= -40 &&
        p.y >= -40 &&
        p.x * kx <= rect.width + 40 &&
        p.y * ky <= rect.height + 40
      el.style.display = visible ? '' : 'none'
      if (visible)
        el.style.transform = `translate(${Math.round(p.x * kx)}px, ${Math.round(p.y * ky)}px) translate(-50%, -100%)`
    }
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
  camera,
  onCamera,
  step,
  interior,
  onInteriorAction,
  ride,
  visitors,
  onBillboard,
  onCell,
  onLotIcon,
  filter,
  onStats,
}: {
  city: City
  tool: EditTool
  selected: { x: number; y: number } | null
  onTile: (x: number, y: number) => void
  /** Player world cell. */
  player: { x: number; y: number }
  playerRotation: number
  camera: CameraState
  onCamera: (c: CameraState) => void
  step: number
  interior: Interior | null
  onInteriorAction: (a: string) => void
  ride: { transport: Transport; rain: boolean } | null
  visitors: PlacedResident[]
  onBillboard: (id: string) => void
  onCell: (cell: { x: number; y: number }) => void
  onLotIcon: (lot: Lot) => void
  filter: Category | 'all'
  onStats?: (s: ChunkStats) => void
}) {
  const overlay = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const centerCell = useMemo(() => cellOf(camera.tx, camera.tz), [camera.tx, camera.tz])
  const agents = useMemo(
    () => agentsNear(step, centerCell.x, centerCell.y, 22),
    [step, centerCell.x, centerCell.y],
  )
  const icons = useMemo(() => {
    const all = landmarks().filter((l) => filter === 'all' || CATEGORY_OF[l.type] === filter)
    return all
      .filter((l) => Math.abs(l.x - centerCell.x) < 34 && Math.abs(l.y - centerCell.y) < 26)
      .slice(0, 40)
  }, [centerCell.x, centerCell.y, filter])
  const highlighted = useMaterial({ diffuse: '#e7d07e', emissive: '#6b5a1a', gloss: 0.2 })

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

  return (
    <div
      className="relative h-full w-full touch-none overflow-hidden bg-[#9fd1e8]"
      data-testid="city-world"
    >
      <Application
        graphicsDeviceOptions={{ antialias: true }}
        className="h-full w-full"
        style={{ width: '100%', height: '100%' }}
      >
        {ride ? (
          <Ride transport={ride.transport} rain={ride.rain} />
        ) : interior ? (
          <LomeLifeRoom3D
            venue={interior}
            angle={camera.angle}
            distance={24}
            onInteract={onInteriorAction}
          />
        ) : (
          <>
            <Entity name="CityCamera" position={camPos} rotation={[-52, camera.angle, 0]}>
              <Camera fov={46} nearClip={0.5} farClip={420} clearColor="#9fd1e8" />
            </Entity>
            <Entity rotation={[56, 28, 0]}>
              <Light type="directional" intensity={1.5} />
            </Entity>
            <Entity rotation={[22, 200, 0]}>
              <Light type="directional" intensity={0.65} />
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
            {agents.map((a) => (
              <AgentModel key={a.id} a={a} />
            ))}
            <Entity name="Joueur" position={playerPos}>
              <Model
                url={ESTATE_ASSETS.villager}
                position={[0, 0.05, 0]}
                scale={1.45}
                rotation={playerRotation}
              />
              <Entity position={[0, 0.02, 0]} scale={[0.9, 0.025, 0.9]}>
                <Render type="cylinder" material={highlighted} />
              </Entity>
            </Entity>
            <Picker camera={camera} onPan={onPan} onZoom={onZoom} onTap={onTap} />
            <IconProjector overlay={overlay} lots={icons} />
          </>
        )}
      </Application>
      {!scene && (
        <div ref={overlay} className="pointer-events-none absolute inset-0" aria-hidden="true">
          {icons.map((lot) => (
            <button
              type="button"
              key={lot.id}
              onClick={() => onLotIcon(lot)}
              className="pointer-events-auto absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-white/95 text-base shadow-md"
              title={lot.name ?? ''}
              style={{ display: 'none' }}
            >
              {TYPE_ICONS[lot.type]}
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
