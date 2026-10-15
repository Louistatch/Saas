'use client'

/**
 * Other players in the same locality (D4+, M1 multiplayer sub-module). Snapshots arrive a few
 * times a second from the relay; each avatar is drawn INTERPOLATED between the two snapshots
 * that bracket "now − delay" (entity interpolation, Gambetta), so it moves smoothly at 60 Hz
 * without any React update per frame. React only learns when a player appears, leaves, or
 * switches between idle / walk / run / drive.
 */
import { AVATAR_MODELS, pagneColor } from '@/lib/haroolife/city/avatar'
import { STREET_SCALE } from '@/lib/haroolife/city/avatar-catalogue'
import { DEFAULT_CONFIG } from '@/lib/haroolife/city/player'
import { CELL } from '@/lib/haroolife/city/world'
import type { Pose, PresenceEntry } from '@/lib/haroolife/realtime/protocol'
import { useAppEvent } from '@playcanvas/react/hooks'
import type * as pc from 'playcanvas'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Character } from './character'
import { worldPos } from './city-chunks'

export interface PoseFeed {
  onPose(fn: (s: { key: string; pose: Pose }) => void): () => void
}
type Sample = { at: number; x: number; z: number; heading: number }
/** Render this far in the past: two snapshots at 5–8 Hz always bracket it. */
export const INTERP_DELAY_MS = 220
const MAX_SHOWN = 12
/** Other players are drawn as dressed adults (never a mini character). */
const ADULTS = AVATAR_MODELS.filter((m) => m.family === 'quaternius')
const STALE_MS = 4000

const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
const lerpAngle = (a: number, b: number, t: number) => {
  const d = ((((b - a) % 360) + 540) % 360) - 180
  return a + d * t
}

/** Pure: the interpolated pose at `at` from time-ordered samples (exported for tests). */
export function sampleAt(samples: Sample[], at: number): Sample | null {
  if (!samples.length) return null
  if (at <= samples[0].at) return samples[0]
  for (let i = samples.length - 1; i >= 0; i--) {
    const a = samples[i]
    if (a.at <= at) {
      const b = samples[i + 1]
      if (!b) {
        // Past the newest sample: hold (no extrapolation beyond the last known point).
        return a
      }
      const t = (at - a.at) / Math.max(1, b.at - a.at)
      return {
        at,
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        heading: lerpAngle(a.heading, b.heading, t),
      }
    }
  }
  return samples[0]
}

export default function RemotePlayers({
  feed,
  present,
}: {
  feed: PoseFeed
  present: PresenceEntry[]
}) {
  const buffers = useRef(new Map<string, Sample[]>())
  const entities = useRef(new Map<string, pc.Entity>())
  const [modes, setModes] = useState<Record<string, string>>({})
  const modesRef = useRef(modes)
  modesRef.current = modes
  const [live, setLive] = useState<string[]>([])

  useEffect(
    () =>
      feed.onPose(({ key, pose }) => {
        const list = buffers.current.get(key) ?? []
        list.push({ at: performance.now(), x: pose.x, z: pose.z, heading: pose.heading })
        if (list.length > 20) list.splice(0, list.length - 20)
        buffers.current.set(key, list)
        const mode =
          pose.mode === 'run'
            ? 'run'
            : pose.mode === 'walk'
              ? 'walk'
              : pose.mode === 'drive'
                ? 'drive'
                : 'idle'
        if (modesRef.current[key] !== mode) setModes((m) => ({ ...m, [key]: mode }))
        setLive((cur) => (cur.includes(key) ? cur : [...cur, key]))
      }),
    [feed],
  )
  // Someone who left (presence) or went silent is removed.
  useEffect(() => {
    const keys = new Set(present.map((p) => p.key))
    setLive((cur) => cur.filter((k) => keys.has(k)))
    for (const k of buffers.current.keys()) if (!keys.has(k)) buffers.current.delete(k)
  }, [present])

  const register = useCallback(
    (key: string) => (e: pc.Entity | null) => {
      if (!e) {
        entities.current.delete(key)
        return
      }
      entities.current.set(key, e)
      // The figure may have loaded seconds after its first pose (the adult models are larger):
      // place it where the player is now, not at the sample the element was rendered with.
      const list = buffers.current.get(key)
      const s = list ? sampleAt(list, performance.now() - INTERP_DELAY_MS) : null
      if (s) {
        const [px, , pz] = worldPos(s.x, s.z)
        e.setLocalPosition(px, 0.05, pz)
        e.setLocalEulerAngles(0, s.heading, 0)
      }
    },
    [],
  )

  useAppEvent('update', () => {
    const now = performance.now()
    const at = now - INTERP_DELAY_MS
    for (const [key, e] of entities.current) {
      const list = buffers.current.get(key)
      if (!list?.length) continue
      // Forget samples older than the bracket we still need.
      while (list.length > 2 && list[1].at < at) list.shift()
      const s = sampleAt(list, at)
      if (!s) continue
      const [px, , pz] = worldPos(s.x, s.z)
      e.setLocalPosition(px, 0.05, pz)
      e.setLocalEulerAngles(0, s.heading, 0)
      e.enabled = now - list[list.length - 1].at < STALE_MS
    }
  })

  const shown = present.filter((p) => live.includes(p.key)).slice(0, MAX_SHOWN)
  return (
    <>
      {shown.map((p) => {
        const first = buffers.current.get(p.key)?.[0]
        const start = first ? worldPos(first.x, first.z) : worldPos(0, 0)
        const model = ADULTS[hash(p.key) % ADULTS.length].id
        const mode = modes[p.key] ?? 'idle'
        return (
          <Character
            key={p.key}
            name={`Joueur ${p.name}`}
            model={model}
            position={[start[0], 0.05, start[2]]}
            anim={
              mode === 'run'
                ? 'run'
                : mode === 'walk'
                  ? 'walk'
                  : mode === 'drive'
                    ? 'drive'
                    : 'idle'
            }
            scale={STREET_SCALE}
            groundSpeed={
              mode === 'run'
                ? DEFAULT_CONFIG.runSpeed * CELL
                : mode === 'walk'
                  ? DEFAULT_CONFIG.walkSpeed * CELL
                  : undefined
            }
            imperative
            pagne={pagneColor(p.pagne)}
            onEntity={register(p.key)}
          />
        )
      })}
    </>
  )
}
