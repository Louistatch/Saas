'use client'

import type { AdCampaign, AdPlacement } from '@/lib/haroolife/ads/campaigns'
import type { ExposureTracker } from '@/lib/haroolife/ads/exposure'
import { STREET_SCALE, adultFor } from '@/lib/haroolife/city/avatar-catalogue'
import { releaseEntity } from '@/lib/haroolife/city/gpu'
import { type Npc, type NpcAnim, type Prop, layoutFor } from '@/lib/haroolife/city/interiors'
import type { Interior } from '@/lib/haroolife/city/life'
import { LOCALITIES, type LocalityId } from '@/lib/haroolife/city/locality'
import {
  FrameRing,
  type PerfSnapshot,
  bump,
  renders,
  watchLongTasks,
} from '@/lib/haroolife/city/perf'
import {
  type CameraRig,
  FOLLOW_DISTANCE,
  type InputState,
  MAP_DISTANCE,
  type PlayerController,
} from '@/lib/haroolife/city/player'
import { PRESETS, type Quality, renderPixelRatio } from '@/lib/haroolife/city/quality'
import { type Agent, TRAFFIC_STEP_MS, agentsNear } from '@/lib/haroolife/city/traffic'
import {
  CATEGORY_OF,
  CELL,
  type Category,
  ESTATE,
  type Lot,
  SIZE_HINT,
  TYPE_ICONS,
  WORLD_H,
  WORLD_W,
  inEstate,
  landmarks,
} from '@/lib/haroolife/city/world'
import type { RendererId } from '@/lib/haroolife/engine/types'
import type { Transport } from '@/lib/haroolife/lome-life-engine'
import type { PlacedResident } from '@/lib/haroolife/lome-presence'
import type { PresenceEntry } from '@/lib/haroolife/realtime/protocol'
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
import dynamic from 'next/dynamic'
import * as pc from 'playcanvas'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ESTATE_ASSETS, EstateTiles } from '../city-world-3d'
import { Ride } from '../travel-scene-3d'
import Billboards from './billboards-3d'
import { Character } from './character'
import CityChunks, { type ChunkStats, cellOf, worldPos } from './city-chunks'
import InteriorScene from './interior-scene'
import { type Bank, bakedMaterial, loadBank, meshFor } from './model-bank'
import PlayerRig from './player-rig'
import RemotePlayers, { type PoseFeed } from './remote-players'
import { playCanvasProbe } from './scene-probe'
import { useMaterial } from './use-material'

export { CAMERA_HOME, type CameraState } from '@/lib/haroolife/city/geometry'
import type { CameraState } from '@/lib/haroolife/city/geometry'
/** The camera entity's initial transform; the player rig moves it every frame afterwards. */
const CAMERA_START: [number, number, number] = [0, 20, 20]
const CAMERA_START_ROT: [number, number, number] = [-45, 0, 0]
type EditTool = BuildType | 'inspect' | 'demolish'
/** The player's own look (a Kenney Mini Character). */
// React Three Fiber interior (behind ?engine=three): its own chunk, never downloaded otherwise.
const InteriorThree = dynamic(() => import('../engine-three/interior-three'), { ssr: false })

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
    const k = Math.min(1, (performance.now() - last.current.at) / TRAFFIC_STEP_MS)
    for (const [id, e] of entities.current) {
      const a = byId.current.get(id)
      if (!a) continue
      // Walkers spread one cell over `steps` traffic steps.
      const p = a.steps ? (Math.min(a.sub ?? 0, a.steps - 1) + k) / a.steps : k
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
              model={adultFor(a.model ?? 'character-male-a')}
              position={pos}
              rotation={a.heading}
              anim={a.activity === 'run' ? 'run' : 'walk'}
              scale={STREET_SCALE}
              groundSpeed={(CELL * 1000) / (TRAFFIC_STEP_MS * (a.steps ?? 1))}
              onEntity={register(a.id)}
            />
          ) : (
            <Baked
              key={a.id}
              name={`piéton ${a.id}`}
              model={NPC_STATIC[a.id % NPC_STATIC.length]}
              position={pos}
              rotation={a.heading}
              // Baked mini figures (raw height FIGURE_HEIGHT): the same height as the adults.
              scale={STREET_SCALE * 1.2}
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
  // Night floor: dark enough to read as night, bright enough that the city stays legible on a
  // phone screen outdoors (measured on a Motorola at 21h: buildings were nearly black).
  const night: [number, number, number] = [0.14, 0.21, 0.37]
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
  const sun = 0.5 + t * 1.05
  const sunColor = hex(
    mix([0.8, 0.85, 1], mix([1, 1, 0.96], [1, 0.78, 0.55], warm), Math.min(1, t * 2)),
  )
  const ambient = hex(mix([0.27, 0.31, 0.42], [0.72, 0.8, 0.86], Math.min(1, t * 1.8)))
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
  onOrbit,
  onZoom,
  onTap,
}: {
  camera: CameraState
  onPan: (dx: number, dz: number) => void
  /** Single-finger drag while following the player: rotates the camera, vertical zooms. Returns false to pan instead. */
  onOrbit: (dxPixels: number, dyPixels: number) => boolean
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
    if (performance.now() - p.since > 60) flush()
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
      if (onOrbit(dx, dy)) return
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
  }, [app, onZoom, onTap, flush, onOrbit])
  return null
}

/** Projects place labels onto the overlay each frame, without React re-renders. */
function LabelProjector({
  overlay,
  lots,
  names,
}: { overlay: React.RefObject<HTMLDivElement | null>; lots: Lot[]; names: boolean }) {
  const app = useApp()
  const tmp = useRef(new pc.Vec3())
  const at = useRef(new pc.Vec3())
  // Per-frame work stays cheap: the camera is looked up once (again only if it left the scene) and
  // the canvas rectangle is re-read on resize, not with a forced layout every frame.
  const cam = useRef<pc.Entity | null>(null)
  const rect = useRef<DOMRect | null>(null)
  // Measured label sizes (they change only with the names switch).
  const sizes = useRef(new WeakMap<HTMLElement, { w: number; h: number }>())
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new names state = new sizes
  useEffect(() => {
    sizes.current = new WeakMap()
  }, [names])
  useEffect(() => {
    const drop = () => {
      rect.current = null
    }
    window.addEventListener('resize', drop)
    window.addEventListener('orientationchange', drop)
    return () => {
      window.removeEventListener('resize', drop)
      window.removeEventListener('orientationchange', drop)
    }
  }, [])
  useAppEvent('update', () => {
    if (!app || !overlay.current) return
    if (!cam.current?.camera || !cam.current.parent)
      cam.current = app.root.findByName('CityCamera') as pc.Entity | null
    const cc = cam.current?.camera
    if (!cc) return
    const canvas = app.graphicsDevice.canvas as HTMLCanvasElement
    if (!rect.current || rect.current.width === 0) rect.current = canvas.getBoundingClientRect()
    const r = rect.current
    const kx = r.width / canvas.width
    const ky = r.height / canvas.height
    const children = overlay.current.children
    // Project every label, then place them by priority (the selected place first, then the
    // nearest to the screen centre): a label that would overlap one already placed is hidden.
    // A higher z-index does not solve a collision; hiding does. Names are capped at eight.
    const items: { el: HTMLElement; x: number; y: number; pri: number }[] = []
    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement
      const lot = lots[i]
      if (!lot) continue
      const [px, , pz] = worldPos(lot.x + (lot.w - 1) / 2, lot.y + (lot.h - 1) / 2)
      const h = 0.6 + lot.floors * 0.5 + 0.9
      const p = cc.worldToScreen(at.current.set(px, h, pz), tmp.current)
      const x = p.x * kx
      const y = p.y * ky
      // Inside the map area: below the top bars, above the bottom navigation, off the edges.
      const visible = p.z > 0 && x >= 24 && y >= 200 && x <= r.width - 24 && y <= r.height - 110
      if (!visible) {
        el.style.display = 'none'
        continue
      }
      const d = Math.hypot(x - r.width / 2, y - r.height / 2)
      items.push({ el, x, y, pri: (el.dataset.priority === '1' ? -1e6 : 0) + d })
    }
    items.sort((a, b) => a.pri - b.pri)
    const placed: [number, number, number, number][] = []
    let shownNames = 0
    for (const it of items) {
      let size = sizes.current.get(it.el)
      if (!size) {
        it.el.style.display = ''
        size = { w: it.el.offsetWidth || 44, h: it.el.offsetHeight || 44 }
        sizes.current.set(it.el, size)
      }
      const box: [number, number, number, number] = [
        it.x - size.w / 2,
        it.y - size.h,
        it.x + size.w / 2,
        it.y,
      ]
      const hit = placed.some(
        (b) => box[0] < b[2] - 4 && box[2] > b[0] + 4 && box[1] < b[3] - 4 && box[3] > b[1] + 4,
      )
      const tooManyNames = names && it.el.dataset.priority !== '1' && shownNames >= 8
      if (hit || tooManyNames) {
        it.el.style.display = 'none'
        continue
      }
      placed.push(box)
      if (names) shownNames++
      it.el.style.display = ''
      it.el.style.transform = `translate(${Math.round(it.x)}px, ${Math.round(it.y)}px) translate(-50%, -100%)`
    }
  })
  return null
}

/** Frame statistics for the debug hook, the statistics overlay and the e2e performance scenarios. */
function StatsProbe({
  onFrame,
  paused,
}: {
  onFrame: (s: { drawCalls: number; fps: number }) => void
  /** Another renderer is on screen: it publishes the stats and the scene probe meanwhile. */
  paused: boolean
}) {
  const app = useApp()
  const last = useRef(0)
  const ring = useRef(new FrameRing(600))
  // One observer for the probe's lifetime. `useRef(watchLongTasks())` evaluated its argument on
  // every render and leaked a new, never-disconnected PerformanceObserver each time.
  const tasks = useRef<ReturnType<typeof watchLongTasks> | null>(null)
  useEffect(() => {
    const t = watchLongTasks()
    tasks.current = t
    return () => {
      t.stop()
      tasks.current = null
    }
  }, [])
  useEffect(() => {
    if (!app || paused) return
    const w = window as unknown as {
      __LOME_PERF_RESET?: () => void
      __LOME_APP?: unknown
      __LOME_SCENE?: unknown
    }
    w.__LOME_PERF_RESET = () => ring.current.reset()
    // Debugging only: tests read the engine-neutral __LOME_SCENE.
    w.__LOME_APP = app
    w.__LOME_SCENE = playCanvasProbe(app)
    return () => {
      w.__LOME_PERF_RESET = undefined
      w.__LOME_APP = undefined
      w.__LOME_SCENE = undefined
    }
  }, [app, paused])
  const prev = useRef(0)
  useAppEvent('update', () => {
    if (!app || paused) {
      prev.current = 0
      return
    }
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
      longTasks: tasks.current?.count() ?? 0,
      longTaskMs: tasks.current?.totalMs() ?? 0,
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

/**
 * While another renderer draws the scene, PlayCanvas stops rendering frames (its context and
 * loaded city stay, so coming back is instant).
 */
function PauseRendering({ paused }: { paused: boolean }) {
  const app = useApp()
  useEffect(() => {
    if (!app || !paused) return
    const before = app.autoRender
    app.autoRender = false
    app.renderNextFrame = false
    // Hidden too: the browser would otherwise composite two full-screen canvases every frame
    // (measured: about a quarter of the frame time on a software renderer).
    const canvas = app.graphicsDevice.canvas as HTMLCanvasElement
    canvas.style.visibility = 'hidden'
    return () => {
      app.autoRender = before
      app.renderNextFrame = true
      canvas.style.visibility = ''
    }
  }, [app, paused])
  return null
}

export default function CityWorld({
  city,
  tool,
  selected,
  onTile,
  controller,
  onPlayerEvents,
  onCameraSync,
  hasVehicle,
  avatarModel = PLAYER_MODEL,
  avatarPagne,
  camera,
  onCamera,
  step,
  hour,
  interior,
  interiorTitle,
  activity,
  onUseProp,
  approach,
  onTalk,
  onNotice,
  ride,
  visitors,
  onBillboard,
  onCell,
  onLotIcon,
  filter,
  selectedLot,
  labelsHidden,
  showNames = false,
  onStats,
  onFrame,
  quality = 'balanced',
  locality = 'lome',
  remoteFeed,
  remotePresent,
  ads,
  renderer = 'playcanvas',
  input,
  onLeave,
}: {
  city: City
  tool: EditTool
  selected: { x: number; y: number } | null
  onTile: (x: number, y: number) => void
  /** The continuous player controller: avatar, camera rig and vehicle are driven from it. */
  controller: PlayerController
  onPlayerEvents: (events: ReturnType<PlayerController['drain']>, c: PlayerController) => void
  onCameraSync: (cam: CameraRig) => void
  /** Whether the player's taxi exists in this town. */
  hasVehicle: boolean
  /** The player's chosen look: Kenney model and pagne colour (also used indoors). */
  avatarModel?: string
  avatarPagne?: string
  /** Other players in this locality (realtime relay), interpolated between snapshots. */
  remoteFeed?: PoseFeed
  remotePresent?: PresenceEntry[]
  /** Street billboards (M2): campaigns, exposure statistics, the support the player stands by. */
  ads?: {
    campaigns: AdCampaign[]
    tracker: ExposureTracker
    onNear: (p: { placement: AdPlacement; campaign: AdCampaign } | null) => void
  }
  /** Low-rate camera state (chunk streaming, labels); the rig moves the real camera. */
  camera: CameraState
  onCamera: (c: CameraState) => void
  step: number
  hour: number
  interior: Interior | null
  interiorTitle: string
  activity: { prop: string; anim: NpcAnim } | null
  onUseProp: (p: Prop) => void
  /** HUD activity button: walk to that equipment, then use it (Three interiors). */
  approach?: { prop: string; n: number } | null
  onTalk?: (npc: Npc) => void
  onNotice?: (message: string) => void
  ride: { transport: Transport; rain: boolean } | null
  visitors: PlacedResident[]
  onBillboard: (id: string) => void
  onCell: (cell: { x: number; y: number }) => void
  onLotIcon: (lot: Lot) => void
  filter: Category | 'all'
  selectedLot: Lot | null
  labelsHidden: boolean
  /** Map view: write every place's name (by priority, without overlaps); off by default. */
  showNames?: boolean
  onStats?: (s: ChunkStats) => void
  onFrame?: (s: { drawCalls: number; fps: number }) => void
  quality?: Quality
  /** Town on screen; the estate is drawn only where it exists (Lomé). */
  locality?: LocalityId
  /** Renderer for the scenes it supports (interiors for 'three'); PlayCanvas draws the rest. */
  renderer?: RendererId
  /** Joystick and keyboard input, read by renderers that let the player walk indoors. */
  input?: InputState
  /** Leave the current building (walking out of the door in the 'three' interior). */
  onLeave?: () => void
}) {
  bump('world')
  const hasEstate = LOCALITIES[locality].estate !== null
  const preset = PRESETS[quality]
  // Antialiasing is fixed when the WebGL context is created. Keying the Application on it rebuilt
  // the whole context (chunks, models, shaders) exactly when the quality governor stepped down
  // on a struggling phone; the governor now only changes resolution and detail.
  const [antialias] = useState(preset.antialias)
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
    // The nearest places first: the projector then keeps those that fit on screen.
    return all
      .filter(
        (l) => Math.abs(l.x - centerCell.x) < radius && Math.abs(l.y - centerCell.y) < radius * 0.8,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - centerCell.x, a.y - centerCell.y) -
          Math.hypot(b.x - centerCell.x, b.y - centerCell.y),
      )
      .slice(0, 28)
    // biome-ignore lint/correctness/useExhaustiveDependencies: landmarks() reads the active locality
  }, [centerCell.x, centerCell.y, filter, camera.distance, locality])
  const light = useMemo(() => daylight(hour), [hour])

  // Free camera (not following): drag pans the rig's target in ground units.
  const onPan = useCallback(
    (dx: number, dz: number) => {
      dragging.current = true
      const rig = controller.camera
      rig.follow = false
      rig.tx = Math.max(-5, Math.min(WORLD_W + 5, rig.tx + dx / CELL))
      rig.tz = Math.max(-5, Math.min(WORLD_H + 5, rig.tz + dz / CELL))
      onCamera({ ...camera, tx: rig.tx, tz: rig.tz })
    },
    [camera, onCamera, controller],
  )
  // Following the player: horizontal drag orbits, vertical drag zooms.
  const onOrbit = useCallback(
    (dx: number, dy: number) => {
      const rig = controller.camera
      if (!rig.follow) return false
      rig.angle = (rig.angle - dx * 0.35 + 360) % 360
      rig.distance = Math.max(7, Math.min(110, rig.distance * (1 + dy * 0.004)))
      return true
    },
    [controller],
  )
  const onZoom = useCallback(
    (f: number) => {
      const rig = controller.camera
      rig.distance = Math.max(7, Math.min(110, rig.distance * f))
      onCamera({ ...camera, distance: rig.distance })
    },
    [camera, onCamera, controller],
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
      if (k === 'q') controller.camera.angle = (controller.camera.angle + 315) % 360
      else if (k === 'e') controller.camera.angle = (controller.camera.angle + 45) % 360
      else if (k === '+' || k === '=') onZoom(0.8)
      else if (k === '-') onZoom(1.25)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controller, onZoom])

  const vehicleEntity = useRef<pc.Entity | null>(null)
  const registerVehicle = useCallback((e: pc.Entity | null) => {
    vehicleEntity.current = e
  }, [])
  const vehicleStart = useMemo<[number, number, number]>(() => {
    const v = controller.vehicle
    const [x, , z] = v ? worldPos(v.x, v.z) : [0, 0, 0]
    return [x, 0.02, z]
    // biome-ignore lint/correctness/useExhaustiveDependencies: the rig moves the car afterwards
  }, [hasVehicle])
  const estateCenter = worldPos(ESTATE.x0 + (SIZE_HINT - 1) / 2, ESTATE.y0 + (SIZE_HINT - 1) / 2)
  const scene = interior || ride
  // Interiors drawn by React Three Fiber: PlayCanvas pauses and draws nothing underneath.
  const threeInterior = renderer === 'three' && Boolean(interior) && !ride && Boolean(input)
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
        graphicsDeviceOptions={{ antialias }}
        className="h-full w-full"
        style={{ width: '100%', height: '100%' }}
      >
        {onFrame && <StatsProbe onFrame={onFrame} paused={threeInterior} />}
        <PauseRendering paused={threeInterior} />
        <QualityController quality={quality} />
        <CityChunks
          centerX={centerCell.x}
          centerY={centerCell.y}
          onStats={onStats}
          rings={{ near: preset.nearRing, mid: preset.midRing, far: preset.farRing }}
          detailCells={preset.detailCells}
          lowCells={preset.lowCells}
          triangleBudget={preset.triangleBudget}
          hidden={Boolean(scene)}
        />
        {ride ? (
          <Ride transport={ride.transport} rain={ride.rain} />
        ) : threeInterior ? null : interior ? (
          <InteriorScene
            layout={layoutFor(interior)}
            title={interiorTitle}
            angle={camera.angle}
            distance={24}
            activity={activity}
            playerModel={avatarModel}
            playerPagne={avatarPagne}
            onUse={onUseProp}
          />
        ) : (
          <>
            <Entity name="CityCamera" position={CAMERA_START} rotation={CAMERA_START_ROT}>
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
                  intensity={light.night ? 0.35 : 0.55}
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
            <PlayerRig
              controller={controller}
              model={avatarModel}
              pagne={avatarPagne}
              vehicleEntity={vehicleEntity}
              onEvents={onPlayerEvents}
              onCameraSync={onCameraSync}
            />
            {ads && ads.campaigns.length > 0 && (
              <Billboards
                locality={locality}
                campaigns={ads.campaigns}
                controller={controller}
                tracker={ads.tracker}
                onNear={ads.onNear}
              />
            )}
            {remoteFeed && remotePresent && remotePresent.length > 0 && (
              <RemotePlayers feed={remoteFeed} present={remotePresent} />
            )}
            {hasVehicle && (
              <Baked
                name="Taxi du joueur"
                model="taxi"
                position={vehicleStart}
                rotation={0}
                scale={0.36}
                onEntity={registerVehicle}
              />
            )}
            <Picker camera={camera} onPan={onPan} onOrbit={onOrbit} onZoom={onZoom} onTap={onTap} />
            <LabelProjector overlay={overlay} lots={labels} names={showNames} />
          </>
        )}
      </Application>
      {threeInterior && interior && input && (
        <div className="absolute inset-0" data-renderer="three">
          <InteriorThree
            layout={layoutFor(interior)}
            title={interiorTitle}
            angle={camera.angle}
            activity={activity}
            playerModel={avatarModel}
            playerPagne={avatarPagne}
            onUse={onUseProp}
            approach={approach}
            onTalk={onTalk}
            onNotice={onNotice}
            input={input}
            onLeave={onLeave ?? (() => {})}
            onFrame={onFrame}
            pixelRatio={renderPixelRatio(quality)}
          />
        </div>
      )}
      {!scene && (
        <div
          ref={overlay}
          className="pointer-events-none absolute inset-0"
          aria-hidden={labelsHidden ? 'true' : undefined}
          style={{ visibility: labelsHidden ? 'hidden' : 'visible' }}
        >
          {labels.map((lot) => {
            const named = showNames || selectedLot?.id === lot.id
            return (
              <button
                type="button"
                key={lot.id}
                data-lot={lot.id}
                data-priority={selectedLot?.id === lot.id ? 1 : 0}
                onClick={() => onLotIcon(lot)}
                tabIndex={labelsHidden ? -1 : 0}
                aria-label={lot.name ?? TYPE_ICONS[lot.type]}
                // 44 px touch target around a 32 px round icon; the name only when asked.
                className={`pointer-events-auto absolute left-0 top-0 flex min-h-11 min-w-11 items-center justify-center gap-1 ${
                  named ? 'max-w-[170px]' : ''
                }`}
                title={lot.name ?? ''}
                style={{ display: 'none' }}
              >
                <span
                  className={`flex h-8 items-center gap-1.5 rounded-full border-2 px-1.5 text-[11px] font-bold shadow-md ${
                    selectedLot?.id === lot.id
                      ? 'border-emerald-800 bg-emerald-700 text-white'
                      : 'border-white bg-white/95 text-slate-900'
                  } ${named ? 'pr-2.5' : 'w-8 justify-center'}`}
                >
                  <span className="text-sm leading-none">{TYPE_ICONS[lot.type]}</span>
                  {named && <span className="truncate">{lot.name}</span>}
                </span>
              </button>
            )
          })}
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
          onClick={() => {
            controller.camera.angle = (controller.camera.angle + 45) % 360
          }}
          className="rounded-xl bg-white/95 p-3 text-emerald-950 shadow"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Recentrer sur moi"
          onClick={() => {
            controller.camera.follow = true
            controller.camera.distance = Math.min(controller.camera.distance, FOLLOW_DISTANCE)
          }}
          className="rounded-xl bg-white/95 p-3 text-emerald-950 shadow"
        >
          <Maximize2 className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Vue de la ville"
          onClick={() => {
            const rig = controller.camera
            rig.follow = false
            rig.tx = 60
            rig.tz = 40
            rig.distance = MAP_DISTANCE
            onCamera({ ...camera, tx: 60, tz: 40, distance: MAP_DISTANCE })
          }}
          className="rounded-xl bg-white/95 p-3 text-emerald-950 shadow"
        >
          <Compass className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
export { Model as CityModel, ESTATE_ASSETS as CITY_ESTATE_ASSETS }
