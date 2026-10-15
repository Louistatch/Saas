'use client'

import { STREET_SCALE } from '@/lib/haroolife/city/avatar-catalogue'
import type { NpcAnim } from '@/lib/haroolife/city/interiors'
/**
 * Steps the player controller once per rendered frame and writes the result straight
 * into PlayCanvas: the avatar's transform, its locomotion clip, the third-person camera
 * and the player's vehicle. React is told about cell changes and camera moves at a low
 * rate only, so a walking frame never re-renders the HUD.
 */
import {
  type CameraRig,
  type Mode,
  type PlayerController,
  cameraPitch,
} from '@/lib/haroolife/city/player'
import { CELL } from '@/lib/haroolife/city/world'
import { useApp, useAppEvent } from '@playcanvas/react/hooks'
import type * as pc from 'playcanvas'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Character } from './character'
import { worldPos } from './city-chunks'

/**
 * Height of an estate plot's model, measured once its meshes exist (null while loading).
 * Only tall objects (houses, trees, halls) can hide the player; roads and fields never do.
 */
const plotHeights = new WeakMap<pc.Entity, number>()
function plotHeight(e: pc.Entity): number | null {
  const known = plotHeights.get(e)
  if (known !== undefined) return known
  let top = Number.NEGATIVE_INFINITY
  for (const r of e.findComponents('render') as pc.RenderComponent[])
    for (const mi of r.meshInstances ?? []) top = Math.max(top, mi.aabb.getMax().y)
  if (!Number.isFinite(top)) return null
  const h = top - e.getPosition().y
  plotHeights.set(e, h)
  return h
}

/**
 * Estate objects standing between the camera and the player on foot: within 1 u of the line
 * of sight, in its middle part, and tall enough to cover a figure. Pure geometry on the
 * ground plane so it is cheap at 6–7 checks per second.
 */
export function occludes(
  cam: { x: number; z: number },
  player: { x: number; z: number },
  obj: { x: number; z: number },
  reach = 1,
): boolean {
  const dx = player.x - cam.x
  const dz = player.z - cam.z
  const len2 = dx * dx + dz * dz
  if (len2 < 1e-6) return false
  const t = ((obj.x - cam.x) * dx + (obj.z - cam.z) * dz) / len2
  if (t < 0.15 || t > 0.97) return false
  const px = cam.x + dx * t - obj.x
  const pz = cam.z + dz * t - obj.z
  return px * px + pz * pz < reach * reach
}

export interface PlayerDebug {
  x: number
  z: number
  heading: number
  speed: number
  mode: Mode
  cell: { x: number; y: number }
  camera: CameraRig
  vehicle: { x: number; z: number; heading: number; speed: number } | null
  driving: boolean
  model: string
  anim: NpcAnim
}

const ANIM: Record<Mode, NpcAnim> = {
  idle: 'idle',
  walk: 'walk',
  run: 'run',
  inside: 'idle',
  drive: 'drive',
  travel: 'idle',
}
/** How long the step-out clip plays when the avatar reappears at a door (ms). */
const EXIT_CLIP_MS = 550

export default function PlayerRig({
  controller,
  model,
  pagne,
  vehicleEntity,
  onEvents,
  onCameraSync,
  mapView = false,
}: {
  controller: PlayerController
  model: string
  /** Hex colour of the pagne worn by the avatar. */
  pagne?: string
  /** The player's vehicle entity, when one is in the scene (moved by the rig). */
  vehicleEntity: { current: pc.Entity | null }
  /** Receives the controller's events (cell changes, arrivals, vehicle) when any happened. */
  onEvents: (events: ReturnType<PlayerController['drain']>, c: PlayerController) => void
  /** Low-rate camera report for chunk streaming and labels. */
  onCameraSync: (cam: CameraRig) => void
  mapView?: boolean
}) {
  const app = useApp()
  const avatar = useRef<pc.Entity | null>(null)
  const cameraEntity = useRef<pc.Entity | null>(null)
  const [anim, setAnim] = useState<NpcAnim>('idle')
  // Ground speed really achieved (render units/s, after collisions) drives the walk cycle.
  const [groundSpeed, setGroundSpeed] = useState(0)
  const lastMode = useRef<Mode>(controller.mode)
  /** While the step-out clip plays, locomotion clips wait. */
  const exitUntil = useRef(0)
  const lastSpeedSync = useRef(0)
  const lastSync = useRef({ at: 0, tx: Number.NaN, tz: Number.NaN, d: Number.NaN, a: Number.NaN })
  const lastDebug = useRef(0)
  // Cut-away: estate objects hiding the player are disabled, then restored (V3).
  const hidden = useRef(new Set<pc.Entity>())
  const plots = useRef<{ at: number; list: pc.Entity[] }>({ at: 0, list: [] })
  const lastOcclusion = useRef(0)
  useEffect(
    () => () => {
      for (const e of hidden.current) e.enabled = true
      hidden.current.clear()
    },
    [],
  )
  const onAvatar = useCallback((e: pc.Entity | null) => {
    avatar.current = e
  }, [])
  useEffect(() => {
    const w = window as unknown as { __LOME_PLAYER?: PlayerDebug | undefined }
    return () => {
      w.__LOME_PLAYER = undefined
    }
  }, [])

  useAppEvent('update', (dt: number) => {
    if (!app) return
    controller.update(dt)
    const now = performance.now()
    // Avatar: hidden while driving (seated inside the car) and while indoors.
    const a = avatar.current
    if (a) {
      const onFoot = !controller.driving && controller.mode !== 'inside'
      if (a.enabled !== onFoot) a.enabled = onFoot
      if (onFoot) {
        const [px, , pz] = worldPos(controller.pos.x, controller.pos.z)
        a.setLocalPosition(px, 0.05, pz)
        a.setLocalEulerAngles(0, controller.heading, 0)
      }
    }
    // Vehicle.
    const v = vehicleEntity.current
    if (v && controller.vehicle) {
      const [vx, , vz] = worldPos(controller.vehicle.x, controller.vehicle.z)
      v.setLocalPosition(vx, 0.02, vz)
      v.setLocalEulerAngles(0, controller.vehicle.heading + 180, 0)
    }
    // Locomotion clip only when the mode changes; stepping out of a building plays the
    // interaction clip first; walk cycles follow the ground speed (no foot sliding).
    if (controller.mode !== lastMode.current) {
      const from = lastMode.current
      lastMode.current = controller.mode
      if (from === 'inside' && controller.mode !== 'inside') {
        exitUntil.current = now + EXIT_CLIP_MS
        setAnim('enter')
      } else if (now >= exitUntil.current) setAnim(ANIM[controller.mode])
    } else if (exitUntil.current && now >= exitUntil.current) {
      exitUntil.current = 0
      setAnim(ANIM[controller.mode])
    }
    if (now - lastSpeedSync.current > 150) {
      lastSpeedSync.current = now
      const m = controller.mode
      // Controller speeds are in cells/s; the figure moves in render units (worldPos × CELL).
      const v = m === 'walk' || m === 'run' ? controller.speed * CELL : 0
      const rounded = Math.round(v * 10) / 10
      setGroundSpeed((cur) => (cur === rounded ? cur : rounded))
    }
    // Camera: position and pitch from the rig every frame.
    if (!cameraEntity.current)
      cameraEntity.current = app.root.findByName('CityCamera') as pc.Entity | null
    const cam = cameraEntity.current
    if (cam) {
      const c = controller.camera
      const pitch = mapView ? -65 : cameraPitch(c.distance)
      const az = (c.angle * Math.PI) / 180
      const pr = (-pitch * Math.PI) / 180
      const horiz = c.distance * Math.cos(pr)
      const [tx, , tz] = worldPos(c.tx, c.tz)
      cam.setLocalPosition(
        tx + Math.sin(az) * horiz,
        c.distance * Math.sin(pr) + 1.2,
        tz + Math.cos(az) * horiz,
      )
      cam.setLocalEulerAngles(pitch, c.angle, 0)
    }
    // Cut-away of the estate objects between the camera and the player (a tree or a hall in
    // front of the door used to hide the figure completely when stepping out).
    if (cam && a && now - lastOcclusion.current > 150) {
      lastOcclusion.current = now
      if (now - plots.current.at > 2000)
        plots.current = {
          at: now,
          list: app.root.find((e) => e.name.startsWith('Plot ')) as pc.Entity[],
        }
      const next = new Set<pc.Entity>()
      if (a.enabled) {
        const cp = cam.getPosition()
        const pp = a.getPosition()
        for (const e of plots.current.list) {
          const h = plotHeight(e)
          if (h === null || h < 0.6) continue
          const op = e.getPosition()
          if (occludes({ x: cp.x, z: cp.z }, { x: pp.x, z: pp.z }, { x: op.x, z: op.z }))
            next.add(e)
        }
      }
      for (const e of hidden.current) if (!next.has(e)) e.enabled = true
      for (const e of next) if (e.enabled) e.enabled = false
      hidden.current = next
    }
    // Low-rate reports.
    const events = controller.drain()
    if (events.length) onEvents(events, controller)
    const c = controller.camera
    const s = lastSync.current
    if (
      now - s.at > 250 &&
      (Math.abs(c.tx - s.tx) > 0.5 ||
        Math.abs(c.tz - s.tz) > 0.5 ||
        c.distance !== s.d ||
        c.angle !== s.a)
    ) {
      lastSync.current = { at: now, tx: c.tx, tz: c.tz, d: c.distance, a: c.angle }
      onCameraSync({ ...c })
    }
    if (now - lastDebug.current > 200) {
      lastDebug.current = now
      ;(window as unknown as { __LOME_PLAYER?: PlayerDebug }).__LOME_PLAYER = {
        x: controller.pos.x,
        z: controller.pos.z,
        heading: controller.heading,
        speed: controller.speed,
        mode: controller.mode,
        cell: controller.cell,
        camera: { ...controller.camera },
        vehicle: controller.vehicle ? { ...controller.vehicle } : null,
        driving: controller.driving,
        model,
        anim,
      }
    }
  })
  const [sx, , sz] = worldPos(controller.pos.x, controller.pos.z)
  return (
    <Character
      name="Joueur"
      model={model}
      position={[sx, 0.05, sz]}
      rotation={controller.heading}
      anim={anim}
      groundSpeed={groundSpeed}
      pagne={pagne}
      scale={STREET_SCALE}
      imperative
      onEntity={onAvatar}
    />
  )
}
