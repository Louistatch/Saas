/**
 * Sidewalks and pedestrian crossings of the street around the player, as plain data in cell
 * units (one cell = one road width). Pure: the renderer turns each piece into an instance.
 *
 * - A sidewalk runs along every road edge that faces a plot (land, estate, sand): a strip on the
 *   plot's side, so cars keep the whole carriageway.
 * - A zebra crossing is painted on each approach of a crossroads, against the junction, where
 *   people on the sidewalk step onto the road to cross.
 * - People walk on the sidewalk to their right: `WALK_SIDE` from the road's centre line.
 */
import type { GroundKind } from './street'

/** Width of a sidewalk, as a share of a cell. */
export const SIDEWALK = 0.24
/** Where a pedestrian walks: half a road plus half a sidewalk from the centre line (cells). */
export const WALK_SIDE = 0.5 + SIDEWALK / 2

export interface Strip {
  /** Centre, in cells. */
  x: number
  y: number
  /** Size along x and along y, in cells. */
  w: number
  h: number
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

const isRoad = (k: GroundKind | undefined) => k === 'road' || k === 'estate-road'
const isPlot = (k: GroundKind | undefined) =>
  k === 'land' || k === 'estate' || k === 'sand' || k === 'hill'

export function streetDressing(cells: { x: number; y: number; kind: GroundKind }[]): {
  sidewalks: Strip[]
  /** The kerb: a darker edge where the sidewalk meets the road. */
  curbs: Strip[]
  zebras: Strip[]
} {
  const kind = new Map(cells.map((c) => [`${c.x}:${c.y}`, c.kind]))
  const at = (x: number, y: number) => kind.get(`${x}:${y}`)
  const sidewalks: Strip[] = []
  const curbs: Strip[] = []
  const zebras: Strip[] = []
  const KERB = 0.04
  const half = 0.5 + SIDEWALK / 2
  for (const c of cells) {
    if (!isRoad(c.kind)) continue
    // Sidewalks: on the plot side of each edge, overlapping the corners so turns are closed.
    for (const [dx, dy] of DIRS) {
      if (!isPlot(at(c.x + dx, c.y + dy))) continue
      const along = 1 + SIDEWALK
      sidewalks.push({
        x: c.x + dx * half,
        y: c.y + dy * half,
        w: dx ? SIDEWALK : along,
        h: dx ? along : SIDEWALK,
      })
      const k = 0.5 + KERB / 2
      curbs.push({ x: c.x + dx * k, y: c.y + dy * k, w: dx ? KERB : 1, h: dx ? 1 : KERB })
    }
    // Crossroads: roads on both axes. Each road arm gets its zebra against the junction.
    const ns = isRoad(at(c.x, c.y - 1)) || isRoad(at(c.x, c.y + 1))
    const ew = isRoad(at(c.x - 1, c.y)) || isRoad(at(c.x + 1, c.y))
    if (!ns || !ew) continue
    for (const [dx, dy] of DIRS) {
      if (!isRoad(at(c.x + dx, c.y + dy))) continue
      // The band runs across the arm (its width), a third of a cell deep, just past the junction.
      const depth = 0.34
      const off = 0.5 + 0.06 + depth / 2
      const bx = c.x + dx * off
      const by = c.y + dy * off
      // Five white bars across the carriageway, parallel to the traffic of the arm.
      for (let i = 0; i < 5; i++) {
        const across = -0.4 + i * 0.2
        zebras.push(
          dx
            ? { x: bx, y: by + across, w: depth, h: 0.1 }
            : { x: bx + across, y: by, w: 0.1, h: depth },
        )
      }
    }
  }
  return { sidewalks, curbs, zebras }
}
