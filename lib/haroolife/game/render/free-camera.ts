import * as THREE from 'three'

/**
 * « Vue libre »: a third-person chase camera, after Slop New York's (mrdoob, MIT). A perspective
 * camera stands behind the player and a little above, looks slightly ahead of them, and swings
 * back behind them whenever they move; a horizontal drag on the street orbits it, and it waits a
 * moment before swinging back. The joystick stays camera-relative (the rig's angle), so pushing
 * forward always walks away from the camera and the swing never makes the walk drift.
 *
 * Units are the street's (a 1.75 m adult is FIGURE units tall); angles are degrees, in the rig's
 * convention: the camera sits at (sin a, cos a) from its target, so behind a player facing
 * heading h it sits at a = h + 180.
 */

/** Shortest signed difference from `from` to `to`, degrees in (-180, 180]. */
export function turnTowards(from: number, to: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180
  return d === -180 ? 180 : d
}

/** Seconds the camera keeps a hand-set angle before swinging back behind a moving player. */
export const ORBIT_HOLD = 1.6

/**
 * The rig angle after `dt` seconds: it swings back behind the player while they move, faster
 * when driving; it stays where it is while standing still or just after a manual orbit.
 */
export function chaseAngle(
  angle: number,
  heading: number,
  dt: number,
  moving: boolean,
  driving: boolean,
  sinceOrbit = Number.POSITIVE_INFINITY,
): number {
  if (!moving || sinceOrbit < ORBIT_HOLD) return angle
  const behind = heading + 180
  const k = 1 - Math.exp(-dt * (driving ? 3.2 : 2.2))
  const next = angle + turnTowards(angle, behind) * k
  return ((next % 360) + 360) % 360
}

export interface ChasePose {
  position: [number, number, number]
  look: [number, number, number]
}

/**
 * Where the camera stands and what it looks at, for a target on the ground (scene units), a rig
 * angle, a zoom (the rig distance over its default, 1 = normal) and the figure's height.
 */
export function chasePose(
  tx: number,
  tz: number,
  angle: number,
  zoom: number,
  figure: number,
  driving: boolean,
): ChasePose {
  const z = Math.min(2.5, Math.max(0.6, zoom))
  const back = (driving ? 6.4 : 4.2) * z
  const up = (driving ? 2.6 : 2.0) * z
  const a = (angle * Math.PI) / 180
  const sx = Math.sin(a)
  const sz = Math.cos(a)
  // A little ahead of the player, at chest height: the street opens up in front of them.
  const ahead = driving ? 3 : 1.6
  return {
    position: [tx + sx * back, up + figure * 0.4, tz + sz * back],
    look: [tx - sx * ahead, figure * 0.75, tz - sz * ahead],
  }
}

/**
 * Haze for the free view: it looks along the street towards the edge of the drawn window, so the
 * haze closes in before it (the classic view looks down from far above and needs none so close).
 */
export function freeFog(windowRadius: number): { near: number; far: number } {
  return { near: windowRadius * 0.35, far: windowRadius * 0.92 }
}

export class FreeCamera {
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400)
  private orbitAt = Number.NEGATIVE_INFINITY

  /** A manual orbit (drag): `dx` pixels across a `width`-pixel street. Returns the new angle. */
  orbit(angle: number, dx: number, width: number, now: number): number {
    this.orbitAt = now
    const next = angle - (dx / Math.max(1, width)) * 220
    return ((next % 360) + 360) % 360
  }

  /** Seconds since the last manual orbit. */
  sinceOrbit(now: number): number {
    return (now - this.orbitAt) / 1000
  }

  frame(pose: ChasePose, aspect: number): void {
    const cam = this.camera
    if (cam.aspect !== aspect) {
      cam.aspect = aspect
      // A tall phone screen: a wider vertical view so the street ahead stays in frame.
      cam.fov = aspect < 0.8 ? 68 : 55
      cam.updateProjectionMatrix()
    }
    cam.position.set(...pose.position)
    cam.lookAt(...pose.look)
    cam.updateMatrixWorld()
  }
}
