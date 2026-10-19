/**
 * World cell ↔ scene position and the default camera framing. Pure maths, no PlayCanvas: the
 * HUD imports these, and importing them from the 3D modules pulled the whole engine (≈ 2 MB)
 * into the first load of /haroolife despite the dynamic import of the world.
 */
import { CELL, WORLD_H, WORLD_W } from './world'

/** World cell → scene position (cell centre). The whole city is centred on the origin. */
export function worldPos(x: number, y: number, h = 0): [number, number, number] {
  return [(x - WORLD_W / 2 + 0.5) * CELL, h, (y - WORLD_H / 2 + 0.5) * CELL]
}
/** Scene position → world cell. */
export function cellOf(px: number, pz: number): { x: number; y: number } {
  return { x: Math.floor(px / CELL + WORLD_W / 2), y: Math.floor(pz / CELL + WORLD_H / 2) }
}

export type CameraState = { tx: number; tz: number; distance: number; angle: number }
/** Frame the player with the dense city around: the target sits a little south-east of them. */
export const CAMERA_HOME = (x: number, y: number): CameraState => {
  const [px, , pz] = worldPos(x - 4, y + 3)
  return { tx: px, tz: pz, distance: 28, angle: 35 }
}
