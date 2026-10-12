'use client'

import { releaseEntity } from '@/lib/haroolife/city/gpu'
import { type NpcAnim, type Prop, layoutFor } from '@/lib/haroolife/city/interiors'
import type { Interior } from '@/lib/haroolife/city/life'
import { LOCALITIES, type LocalityId } from '@/lib/haroolife/city/locality'
import {
  FrameRing,
  type PerfSnapshot,
  bump,
  renders,
  watchLongTasks,
} from '@/lib/haroolife/city/perf'
import { PRESETS, type Quality, renderPixelRatio } from '@/lib/haroolife/city/quality'
import { type Agent, agentsNear } from '@/lib/haroolife/city/traffic'
import {
  CATEGORY_OF,
  CELL,
  type Category,
  ESTATE,
  type Lot,
  SIZE_HINT,
  TYPE_ICONS,
  inEstate,
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
import { useApp, useAppEvent, useModel } from '@playcanvas/react/hooks'
import { Compass, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import * as pc from 'playcanvas'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ESTATE_ASSETS, EstateTiles } from '../city-world-3d'
import { Ride } from '../travel-scene-3d'
import { Character } from './character'
import CityChunks, { type ChunkStats, cellOf, worldPos } from './city-chunks'
import InteriorScene from './interior-scene'
import { type Bank, bakedMaterial, loadBank, meshFor } from './model-bank'
import { useMaterial } from './use-material'

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
  onEntity,
}: {
  model: string
  position: [number, number, number]
  rotation?: number
  scale?: number
  name?: string
  onEntity?: (e: pc.Entity | null) => void
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
    onEntity?.(e)
    return () => {
      onEntity?.(null)
      releaseEntity(e)
      ref.current = null
    }
  }, [app, bank, model, name, onEntity])
  useEffect(() => {
    const e = ref.current
    if (!e) return
    e.setLocalPosition(position[0], position[1], position[2])
    e.setLocalEulerAngles(0, rotation, 0)
    e.setLocalScale(scale, scale, scale)
  })
  return null
}

/** Where an agent's figure sits relative to its road cell (lane side, kerb). */
function agentOffset(a: Agent): [number, number, number] {
  if (a.kind === 'walker') return [0.42, 0.04, 0.42]
  if (a.kind === 'zem') return [-0.25, 0.05, 0]
  return a.fx !== 0 ? [0, 0.02, 0.26 * Math.sign(a.fx)] : [-0.26 * Math.sign(a.fy || 1), 0.02, 0]
}
const NPC_STATIC = ['npc-a', 'npc-b', 'npc-c', 'npc-d']

/**
 * Vehicles and pedestrians. React only decides who exists (once per traffic step); the
 * smooth motion between steps is applied imperatively to the entities every frame, so no
 * component re-renders per frame. Only the nearest pedestrians are skinned and animated;
 * the others are static baked figures.
 */
const Agents = memo(function Agents({
  agents,
  step,
  animated,
}: { agents: Agent[]; step: number; animated: Set<number> }) {
  bump('agents')
  const last = useRef({ step, at: performance.now() })
  if (last.current.step !== step) last.current = { step, at: performance.now() }
  const entities = useRef(new Map<number, pc.Entity>())
  const byId = useRef(new Map<number, Agent>())
  byId.current = new Map(agents.map((a) => [a.id, a]))
  const registrars = useRef(new Map<number, (e: pc.Entity | null) => void>())
  const register = (id: number) => {
    let fn = registrars.current.get(id)
    if (!fn) {
      fn = (e: pc.Entity | null) => {
        if (e) entities.current.set(id, e)
        else entities.current.delete(id)
      }
      registrars.current.set(id, fn)
    }
    return fn
  }
  useAppEvent('update', () => {
    const p = Math.min(1, (performance.now() - last.current.at) / 700)
    for (const [id, e] of entities.current) {
      const a = byId.current.get(id)
      if (!a) continue
      const pos = worldPos(a.x + a.fx * p, a.y + a.fy * p)
      const off = agentOffset(a)
      e.setLocalPosition(pos[0] + off[0], off[1], pos[2] + off[2])
    }
  })
  return (
    <>
      {agents.map((a) => {
        const base = worldPos(a.x, a.y)
        const off = agentOffset(a)
        const pos: [number, number, number] = [base[0] + off[0], off[1], base[2] + off[2]]
        if (a.kind === 'walker')
          return animated.has(a.id) ? (
            <Character
              key={a.id}
              name={`piéton ${a.id}`}
              model={a.model ?? 'character-male-a'}
              position={pos}
              rotation={a.heading}
              anim={a.activity === 'run' ? 'run' : 'walk'}
              scale={0.95}
              onEntity={register(a.id)}
            />
          ) : (
            <Baked
              key={a.id}
              name={`piéton ${a.id}`}
              model={NPC_STATIC[a.id % NPC_STATIC.length]}
              position={pos}
              rotation={a.heading}
              scale={0.95}
              onEntity={register(a.id)}
            />
          )
        if (a.kind === 'zem')
          return (
            <Character
              key={a.id}
              name={`zémidjan ${a.id}`}
              model="character-male-b"
              position={pos}
              rotation={a.heading}
              anim="rest"
              scale={0.85}
              active={animated.has(a.id)}
              onEntity={register(a.id)}
            />
          )
        return (
          <Baked
            key={a.id}
            name={`véhicule ${a.kind}`}
            model={a.kind}
            position={pos}
            rotation={a.heading + 180}
            scale={0.36}
            onEntity={register(a.id)}
          />
        )
      })}
    </>
  )
})

/** Applies the quality preset's render resolution to the device. */
function QualityController({ quality }: { quality: Quality }) {
  const app = useApp()
  useEffect(() => {
    if (!app) return
    app.graphicsDevice.maxPixelRatio = renderPixelRatio(quality)
    // Never app.resizeCanvas() here: this child effect runs before the wrapper sets the fill
    // mode, and the engine's default (keep aspect of the 300×150 canvas) would pin the inline
    // style to a 2:1 strip. The CSS size stays 100 %, only the backbuffer follows the preset.
    const canvas = app.graphicsDevice.canvas
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    app.updateCanvasSize()
  }, [app, quality])
  return null
}

const EstateTilesMemo = memo(EstateTiles)

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
  // Pending pan since the last React commit: applied to the camera entity every frame,
  // handed to React at most every 120 ms (and when the finger lifts).
  const pending = useRef({ dx: 0, dz: 0, since: 0 })
  const flush = useCallback(() => {
    const p = pending.current
    if (p.dx === 0 && p.dz === 0) return
    pending.current = { dx: 0, dz: 0, since: 0 }
    onPan(p.dx, p.dz)
  }, [onPan])
  useAppEvent('update', () => {
    const p = pending.current
    if (!app || (p.dx === 0 && p.dz === 0)) return
    const camEntity = app.root.findByName('CityCamera') as pc.Entity | null
    if (camEntity) {
      const c = cam.current
      const az = (c.angle * Math.PI) / 180
      camEntity.setLocalPosition(
        c.tx + p.dx + Math.sin(az) * c.distance * 0.72,
        c.distance * 0.9,
        c.tz + p.dz + Math.cos(az) * c.distance * 0.72,
      )
    }
    if (performance.now() - p.since > 120) flush()
  })
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
      const p = pending.current
      if (p.dx === 0 && p.dz === 0) p.since = performance.now()
      p.dx += gx
      p.dz += gz
    }
    const up = (e: PointerEvent) => {
      const wasSingle = pointers.size === 1
      pointers.delete(e.pointerId)
      flush()
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
  }, [app, onZoom, onTap, flush])
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

/** Frame statistics for the debug hook, the statistics overlay and the e2e performance scenarios. */
function StatsProbe({ onFrame }: { onFrame: (s: { drawCalls: number; fps: number }) => void }) {
  const app = useApp()
  const last = useRef(0)
  const ring = useRef(new FrameRing(600))
  const tasks = useRef(watchLongTasks())
  useEffect(() => {
    const w = window as unknown as { __LOME_PERF_RESET?: () => void; __LOME_APP?: unknown }
    w.__LOME_PERF_RESET = () => ring.current.reset()
    w.__LOME_APP = app
    return () => {
      w.__LOME_PERF_RESET = undefined
      w.__LOME_APP = undefined
    }
  }, [app])
  const prev = useRef(0)
  useAppEvent('update', () => {
    if (!app) return
    const now = performance.now()
    if (prev.current) ring.current.push(now - prev.current)
    prev.current = now
    if (now - last.current < 500) return
    last.current = now
    const stats = app.stats as unknown as {
      drawCalls: { total: number }
      frame: { fps: number; triangles: number }
    }
    let renderEntities = 0
    let meshInstances = 0
    let animated = 0
    let animating = 0
    let triangles = 0
    app.root.forEach((e) => {
      const ent = e as pc.Entity
      if (ent.render) {
        renderEntities++
        const list = ent.render.meshInstances ?? []
        meshInstances += list.length
        for (const mi of list) {
          if (!mi.visible || !ent.enabled) continue
          const prim = mi.mesh?.primitive?.[0]
          if (prim) triangles += Math.floor(prim.count / 3)
        }
      }
      if (ent.anim) {
        animated++
        if (ent.anim.playing) animating++
      }
    })
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    const snap: PerfSnapshot = {
      at: Math.round(now),
      frame: ring.current.summary(),
      drawCalls: stats.drawCalls.total,
      triangles: Number.isFinite(stats.frame.triangles) ? stats.frame.triangles : triangles,
      renderEntities,
      meshInstances,
      animated,
      animating,
      heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      longTasks: tasks.current.count(),
      longTaskMs: tasks.current.totalMs(),
      renders: { ...renders },
      assets: app.assets.list().filter((a) => a.loaded).length,
      pixelRatio: app.graphicsDevice.maxPixelRatio,
      resolution: [app.graphicsDevice.width, app.graphicsDevice.height],
    }
    ;(window as unknown as { __LOME_PERF?: PerfSnapshot }).__LOME_PERF = snap
    onFrame({ drawCalls: snap.drawCalls, fps: snap.frame.fps })
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
  quality = 'balanced',
  locality = 'lome',
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
  quality?: Quality
  /** Town on screen; the estate is drawn only where it exists (Lomé). */
  locality?: LocalityId
}) {
  bump('world')
  const hasEstate = LOCALITIES[locality].estate !== null
  const preset = PRESETS[quality]
  const overlay = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const centerCell = useMemo(() => cellOf(camera.tx, camera.tz), [camera.tx, camera.tz])
  const agents = useMemo(
    () => agentsNear(step, centerCell.x, centerCell.y, preset.vehicleRadius, preset.maxWalkers),
    [step, centerCell.x, centerCell.y, preset.vehicleRadius, preset.maxWalkers],
  )
  // Skinned animation budget: the pedestrians and riders nearest the camera target.
  const animated = useMemo(() => {
    const movers = agents
      .filter((a) => a.kind === 'walker' || a.kind === 'zem')
      .map((a) => ({ id: a.id, d: Math.hypot(a.x - centerCell.x, a.y - centerCell.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, preset.maxAnimated)
    return new Set(movers.map((m) => m.id))
  }, [agents, centerCell.x, centerCell.y, preset.maxAnimated])
  // Stable callbacks so the memoised estate does not re-render on every HUD change.
  const onTileRef = useRef(onTile)
  onTileRef.current = onTile
  const stableOnTile = useCallback((x: number, y: number) => onTileRef.current(x, y), [])
  const onBillboardRef = useRef(onBillboard)
  onBillboardRef.current = onBillboard
  const stableOnBillboard = useCallback((id: string) => onBillboardRef.current(id), [])
  const labels = useMemo(() => {
    const all = landmarks().filter((l) => filter === 'all' || CATEGORY_OF[l.type] === filter)
    const radius = camera.distance < 40 ? 20 : 34
    return all
      .filter(
        (l) => Math.abs(l.x - centerCell.x) < radius && Math.abs(l.y - centerCell.y) < radius * 0.8,
      )
      .slice(0, 28)
    // biome-ignore lint/correctness/useExhaustiveDependencies: landmarks() reads the active locality
  }, [centerCell.x, centerCell.y, filter, camera.distance, locality])
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
      // The estate ground is one mesh: route its taps to the estate handler (local cells).
      if (inEstate(cell.x, cell.y)) {
        onTileRef.current(cell.x - ESTATE.x0, cell.y - ESTATE.y0)
        return
      }
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
        key={preset.antialias ? 'aa' : 'noaa'}
        graphicsDeviceOptions={{ antialias: preset.antialias }}
        className="h-full w-full"
        style={{ width: '100%', height: '100%' }}
      >
        {onFrame && <StatsProbe onFrame={onFrame} />}
        <QualityController quality={quality} />
        <CityChunks
          centerX={centerCell.x}
          centerY={centerCell.y}
          onStats={onStats}
          rings={{ near: preset.nearRing, mid: preset.midRing, far: preset.farRing }}
          hidden={Boolean(scene)}
        />
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
            {preset.fillLight && (
              <Entity rotation={[22, 200, 0]}>
                <Light
                  type="directional"
                  intensity={light.night ? 0.2 : 0.55}
                  color={light.night ? '#8fa8ff' : '#ffffff'}
                />
              </Entity>
            )}
            {hasEstate && (
              <Entity position={estateCenter}>
                <EstateTilesMemo
                  city={city}
                  tool={tool}
                  selected={selected}
                  onTile={stableOnTile}
                  canTap={canTap}
                  visitors={visitors}
                  onBillboard={stableOnBillboard}
                />
              </Entity>
            )}
            {selPos && selectedLot && (
              <SelectionRing
                position={[selPos[0], 0.03, selPos[2]]}
                w={selectedLot.w * CELL + 0.3}
                d={selectedLot.h * CELL + 0.3}
              />
            )}
            <Agents agents={agents} step={step} animated={animated} />
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
