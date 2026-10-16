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

/** A vehicle seen under another player: the one they drive, or the one they ride in. */
export type RemoteVehicle = 'taxi' | 'moto' | 'bus'
const VEHICLES: readonly string[] = ['taxi', 'moto', 'bus']

/**
 * The pose mode names the vehicle, so the others draw it: `drive:taxi` at the wheel,
 * `ride:moto` behind a zémidjan driver, `ride:bus` in the SOTRAL bus. It stays a plain string
 * of at most 12 characters, which the relay already forwards as it is.
 */
export const vehicleMode = (role: 'drive' | 'ride', vehicle: RemoteVehicle) => `${role}:${vehicle}`

/** The vehicle a pose mode names, or null on foot (and for the bare `drive` of old clients). */
export function remoteVehicle(
  mode: string,
): { role: 'drive' | 'ride'; vehicle: RemoteVehicle } | null {
  const [role, vehicle] = mode.split(':')
  if ((role !== 'drive' && role !== 'ride') || !VEHICLES.includes(vehicle)) return null
  return { role, vehicle: vehicle as RemoteVehicle }
}

/** The animation of a pose's mode, in the game's words. */
export const remoteAnim = (mode: string): 'idle' | 'walk' | 'run' | 'drive' =>
  mode === 'run'
    ? 'run'
    : mode === 'walk'
      ? 'walk'
      : mode === 'drive' || remoteVehicle(mode)
        ? 'drive'
        : 'idle'

/** The relay drops a pose faster than 14 cells/s: a ride is shown a little below that. */
export const RIDE_MAX_SPEED = 12

/**
 * Where a passenger is, seen from the street, `elapsed` seconds into a ride along `route` (the
 * cells after `start`): the vehicle follows the streets at the pace that lands it when the ride
 * ends (`seconds`), never above RIDE_MAX_SPEED. Heading as the game's: 0 faces +z.
 */
export function ridePose(
  start: { x: number; y: number },
  route: readonly { x: number; y: number }[],
  elapsed: number,
  seconds: number,
): { x: number; z: number; heading: number } {
  const points = [start, ...route]
  let length = 0
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  const speed = Math.min(RIDE_MAX_SPEED, length / Math.max(0.1, seconds))
  let left = Math.max(0, elapsed) * speed
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    const heading = (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI
    if (left <= d || i === points.length - 1) {
      const t = d > 0 ? Math.min(1, left / d) : 1
      return { x: a.x + (b.x - a.x) * t, z: a.y + (b.y - a.y) * t, heading: (heading + 360) % 360 }
    }
    left -= d
  }
  return { x: start.x, z: start.y, heading: 0 }
}
