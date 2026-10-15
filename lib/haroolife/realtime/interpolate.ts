/**
 * Other players between two snapshots (entity interpolation, Gambetta): each avatar is drawn at
 * "now − INTERP_DELAY_MS", between the two snapshots that bracket it, so it moves smoothly at
 * the frame rate without extrapolating past the last known point. Pure; shared by every street
 * renderer.
 */
import { AVATAR_MODELS } from '@/lib/haroolife/city/avatar'

export type Sample = { at: number; x: number; z: number; heading: number }
/** Render this far in the past: two snapshots at 5–8 Hz always bracket it. */
export const INTERP_DELAY_MS = 220
/** At most this many other players drawn at once. */
export const MAX_SHOWN = 12
/** A player silent for this long is hidden. */
export const STALE_MS = 4000

/** Other players are drawn as dressed adults (never a mini character), stable per player. */
const ADULTS = AVATAR_MODELS.filter((m) => m.family === 'quaternius')
const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
export const remoteModel = (key: string) => ADULTS[hash(key) % ADULTS.length].id

const lerpAngle = (a: number, b: number, t: number) => {
  const d = ((((b - a) % 360) + 540) % 360) - 180
  return a + d * t
}

/** The interpolated pose at `at` from time-ordered samples. */
export function sampleAt(samples: Sample[], at: number): Sample | null {
  if (!samples.length) return null
  if (at <= samples[0].at) return samples[0]
  for (let i = samples.length - 1; i >= 0; i--) {
    const a = samples[i]
    if (a.at <= at) {
      const b = samples[i + 1]
      // Past the newest sample: hold (no extrapolation beyond the last known point).
      if (!b) return a
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

/** The animation of a pose's mode, in the game's words. */
export const remoteAnim = (mode: string): 'idle' | 'walk' | 'run' | 'drive' =>
  mode === 'run' ? 'run' : mode === 'walk' ? 'walk' : mode === 'drive' ? 'drive' : 'idle'
