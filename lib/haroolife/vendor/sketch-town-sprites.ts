/**
 * Kenney Sketch Town 2D isometric sprites.
 * Assets: CC0-1.0 by Kenney (https://kenney.nl/assets/sketch-town)
 * Source of this copy: https://github.com/shorepine/kenney/tree/main/2d/Sketch%20Town/Tiles
 * Only a selected set of source sprites is included for performance.
 */
import { HAROOLIFE_ASSETS } from '@/lib/haroolife/assets'

export const SKETCH_TOWN_SOURCE = `${HAROOLIFE_ASSETS}/vendor/kenney-sketch-town/`
export const SKETCH_TOWN_ASSETS = [
  'grass_center_S.png',
  'dirt_center_S.png',
  'grass_path_S.png',
  'grass_pathCrossing_S.png',
  'grass_pathBend_S.png',
  'grass_pathCorner_S.png',
  'grass_pathSplit_S.png',
  'grass_pathEnd_S.png',
  'water_center_S.png',
  'grass_river_S.png',
  'tree_single_S.png',
  'tree_multiple_S.png',
  'building_doorBeige_S.png',
  'building_doorWindowsBeige_S.png',
  'building_windowBeige_S.png',
  'building_centerBeige_S.png',
  'roof_gableBrown_S.png',
  'roof_gableGreen_S.png',
  'roof_roundBeige_S.png',
  'roof_pointBrown_S.png',
  'roof_churchBrown_S.png',
  'castle_towerBrown_S.png',
  'rocks_grass_S.png',
  'grass_water_S.png',
] as const

export type SketchSprite = (typeof SKETCH_TOWN_ASSETS)[number]
export type SketchSprites = Partial<Record<SketchSprite, HTMLImageElement>>

/** Each sprite is tiny; failure of a single URL must not block the game. */
export async function preloadSketchTown(): Promise<SketchSprites> {
  const entries = await Promise.all(
    SKETCH_TOWN_ASSETS.map(
      (name) =>
        new Promise<readonly [SketchSprite, HTMLImageElement] | null>((resolve) => {
          const image = new Image()
          image.decoding = 'async'
          image.onload = () => resolve([name, image])
          image.onerror = () => resolve(null)
          image.src = SKETCH_TOWN_SOURCE + name
        }),
    ),
  )
  const images: SketchSprites = {}
  for (const entry of entries) {
    if (entry) images[entry[0]] = entry[1]
  }
  return images
}

export function drawTileSprite(
  ctx: CanvasRenderingContext2D,
  images: SketchSprites,
  name: SketchSprite,
  centerX: number,
  centerY: number,
  scale: number,
): boolean {
  const image = images[name]
  if (!image || !image.complete || image.naturalWidth === 0) return false
  // Kenney source tiles are 256px canvases with their diamond's tip at y≈100.
  // Scale x/y independently to match the existing 60x31 isometric grid.
  ctx.drawImage(image, centerX - 34 * scale, centerY - 38 * scale, 68 * scale, 55 * scale)
  return true
}

export function drawObjectSprite(
  ctx: CanvasRenderingContext2D,
  images: SketchSprites,
  name: SketchSprite,
  centerX: number,
  centerY: number,
  scale: number,
  lift = 0,
): boolean {
  const image = images[name]
  if (!image || !image.complete || image.naturalWidth === 0) return false
  const h = 83 * scale
  const w = 68 * scale
  // Anchor building base to the bottom of its tile. Roofs stack above walls.
  ctx.drawImage(image, centerX - w / 2, centerY + 17 * scale - h - lift * scale, w, h)
  return true
}
