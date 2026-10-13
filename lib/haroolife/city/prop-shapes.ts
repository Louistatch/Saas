/**
 * The 3D shape of each kind of interior equipment, as data: boxes, cylinders and balls in the
 * prop's local space (origin on the floor, degrees), plus CC0 Kenney furniture models. Both
 * renderers draw from this list (PlayCanvas primitives, or one merged Three.js mesh per
 * material), so a treadmill is the same treadmill whichever engine shows it.
 */
import type { PropKind } from './interiors'

export type ShapeMaterial =
  | 'dark'
  | 'steel'
  | 'black'
  | 'red'
  | 'blue'
  | 'yellow'
  | 'green'
  | 'wood'
  | 'white'
  | 'cloth'
  | 'glass'
  | 'grey'
  | 'water'
  | 'leaf'
  | 'trunk'
  | 'cream'

/** Surface of each material: colour, gloss (0–1), metalness, emissive tint. */
export const SHAPE_MATERIALS: Record<
  ShapeMaterial,
  { color: string; gloss: number; metalness?: number; emissive?: string }
> = {
  dark: { color: '#2b2f36', gloss: 0.3 },
  steel: { color: '#9aa3ad', gloss: 0.6, metalness: 0.4 },
  black: { color: '#15181c', gloss: 0.2 },
  red: { color: '#c53d2f', gloss: 0.2 },
  blue: { color: '#2c6fb3', gloss: 0.2 },
  yellow: { color: '#f4c84a', gloss: 0.3, emissive: '#3a2e05' },
  green: { color: '#1f7a4d', gloss: 0.15 },
  wood: { color: '#9a674c', gloss: 0.08 },
  white: { color: '#f6f6f2', gloss: 0.2 },
  cloth: { color: '#699eba', gloss: 0.04 },
  glass: { color: '#bfe3ee', gloss: 0.9 },
  grey: { color: '#7b8794', gloss: 0.35 },
  water: { color: '#4fb3d6', gloss: 0.8 },
  leaf: { color: '#3f8f3f', gloss: 0.05 },
  trunk: { color: '#6b4423', gloss: 0.05 },
  cream: { color: '#efe6d3', gloss: 0.1 },
}

type V3 = [number, number, number]
/** A unit box scaled to `s`; a cylinder of radius `r` and height `h`; a ball of radius `r`. */
export type ShapePart =
  | { t: 'box'; p: V3; s: V3; m: ShapeMaterial; rot?: V3 }
  | { t: 'cyl'; p: V3; r: number; h: number; m: ShapeMaterial; rot?: V3 }
  | { t: 'ball'; p: V3; r: number; m: ShapeMaterial }
  | { t: 'model'; name: string; p: V3; scale: number; rotY?: number }

const box = (p: V3, s: V3, m: ShapeMaterial, rot?: V3): ShapePart => ({ t: 'box', p, s, m, rot })
const cyl = (p: V3, r: number, h: number, m: ShapeMaterial, rot?: V3): ShapePart => ({
  t: 'cyl',
  p,
  r,
  h,
  m,
  rot,
})
const ball = (p: V3, r: number, m: ShapeMaterial): ShapePart => ({ t: 'ball', p, r, m })
const model = (name: string, p: V3, scale: number, rotY?: number): ShapePart => ({
  t: 'model',
  name,
  p,
  scale,
  rotY,
})

export function shapeOf(kind: PropKind): ShapePart[] {
  switch (kind) {
    case 'treadmill':
      return [
        box([0, 0.07, 0.1], [0.72, 0.14, 1.6], 'dark'),
        box([0, 0.15, 0.15], [0.56, 0.02, 1.3], 'black'),
        box([-0.3, 0.6, -0.65], [0.06, 1.1, 0.06], 'steel'),
        box([0.3, 0.6, -0.65], [0.06, 1.1, 0.06], 'steel'),
        box([0, 1.18, -0.68], [0.66, 0.22, 0.12], 'dark', [-25, 0, 0]),
        box([0, 1.2, -0.66], [0.4, 0.12, 0.02], 'blue', [-25, 0, 0]),
        box([-0.33, 0.95, -0.35], [0.04, 0.04, 0.7], 'steel'),
        box([0.33, 0.95, -0.35], [0.04, 0.04, 0.7], 'steel'),
      ]
    case 'bike':
      return [
        box([0, 0.05, 0], [0.5, 0.1, 1.0], 'dark'),
        cyl([0, 0.5, 0.05], 0.04, 0.9, 'steel'),
        cyl([0, 0.45, -0.35], 0.04, 1.1, 'steel', [20, 0, 0]),
        box([0, 0.95, 0.1], [0.26, 0.06, 0.3], 'black'),
        box([0, 1.02, -0.52], [0.5, 0.05, 0.05], 'black'),
        cyl([0, 0.35, 0.0], 0.3, 0.1, 'black', [0, 0, 90]),
      ]
    case 'bench-press':
      return [
        box([0, 0.45, 0], [0.42, 0.1, 1.25], 'red'),
        box([0, 0.2, 0.45], [0.08, 0.4, 0.08], 'steel'),
        box([0, 0.2, -0.45], [0.08, 0.4, 0.08], 'steel'),
        box([-0.6, 0.6, -0.45], [0.06, 1.2, 0.06], 'steel'),
        box([0.6, 0.6, -0.45], [0.06, 1.2, 0.06], 'steel'),
        cyl([0, 1.15, -0.45], 0.025, 1.9, 'steel', [0, 0, 90]),
        cyl([-0.8, 1.15, -0.45], 0.2, 0.06, 'black', [0, 0, 90]),
        cyl([0.8, 1.15, -0.45], 0.2, 0.06, 'black', [0, 0, 90]),
      ]
    case 'dumbbell-rack':
      return [
        box([0, 0.3, 0], [1.5, 0.06, 0.45], 'steel'),
        box([0, 0.65, -0.12], [1.5, 0.06, 0.3], 'steel'),
        box([-0.7, 0.35, 0], [0.06, 0.7, 0.45], 'dark'),
        box([0.7, 0.35, 0], [0.06, 0.7, 0.45], 'dark'),
        ...[-0.5, -0.25, 0, 0.25, 0.5].flatMap((x, i) => {
          const y = i % 2 ? 0.72 : 0.37
          const z = i % 2 ? -0.12 : 0.05
          return [
            cyl([x, y, z], 0.02, 0.3, 'steel', [90, 0, 0]),
            cyl([x, y, z - 0.14], 0.06, 0.05, 'black', [90, 0, 0]),
            cyl([x, y, z + 0.14], 0.06, 0.05, 'black', [90, 0, 0]),
          ]
        }),
      ]
    case 'mat':
      return [box([0, 0.02, 0], [0.7, 0.04, 1.6], 'blue')]
    case 'locker':
      return [
        box([0, 0.9, 0], [0.62, 1.8, 0.45], 'grey'),
        box([-0.15, 0.9, 0.23], [0.26, 1.7, 0.01], 'steel'),
        box([0.15, 0.9, 0.23], [0.26, 1.7, 0.01], 'steel'),
        box([-0.04, 1.0, 0.24], [0.03, 0.12, 0.01], 'black'),
        box([0.26, 1.0, 0.24], [0.03, 0.12, 0.01], 'black'),
      ]
    case 'reception':
      return [
        box([0, 0.5, 0], [1.9, 1.0, 0.6], 'wood'),
        box([0, 1.02, 0], [2.0, 0.05, 0.7], 'cream'),
        box([0, 0.5, 0.31], [1.9, 0.3, 0.02], 'yellow'),
        model('laptop', [-0.4, 1.05, 0], 0.9, 180),
        box([0.55, 1.08, 0], [0.25, 0.06, 0.2], 'green'),
      ]
    case 'water-cooler':
      return [box([0, 0.5, 0], [0.32, 1.0, 0.32], 'white'), cyl([0, 1.2, 0], 0.14, 0.4, 'water')]
    case 'mirror':
      return [
        box([0, 1.2, 0], [0.05, 1.6, 2.2], 'glass'),
        box([-0.02, 1.2, 0], [0.03, 1.7, 2.3], 'black'),
      ]
    case 'pew':
      return [
        box([0, 0.42, 0], [2.0, 0.08, 0.4], 'wood'),
        box([0, 0.7, -0.2], [2.0, 0.5, 0.06], 'wood'),
        box([-0.9, 0.2, 0], [0.06, 0.4, 0.4], 'wood'),
        box([0.9, 0.2, 0], [0.06, 0.4, 0.4], 'wood'),
      ]
    case 'altar':
      return [
        box([0, 0.25, 0.4], [6.5, 0.5, 1.4], 'cream'),
        box([0, 0.95, 0.1], [1.6, 0.9, 0.6], 'wood'),
        box([0, 1.42, 0.1], [1.8, 0.05, 0.7], 'white'),
        box([0, 2.3, -0.5], [0.12, 1.3, 0.1], 'yellow'),
        box([0, 2.5, -0.5], [0.8, 0.12, 0.1], 'yellow'),
      ]
    case 'bed':
      return [model('bedsingle', [0, 0.1, 0], 1.13)]
    case 'hospital-bed':
      return [
        box([0, 0.35, 0], [1.1, 0.5, 2.1], 'white'),
        box([0, 0.62, 0.15], [1.0, 0.1, 1.7], 'blue'),
        box([0, 0.66, -0.8], [0.7, 0.1, 0.4], 'white'),
        box([0, 0.8, -1.05], [1.1, 0.5, 0.06], 'steel'),
        box([0.7, 0.9, -0.6], [0.05, 1.8, 0.05], 'steel'),
      ]
    case 'desk':
      return [model('desk', [0, 0.1, 0], 1.2), model('laptop', [0.2, 0.9, 0], 0.8)]
    case 'counter':
      return [
        box([0, 0.5, 0], [5.6, 1.0, 0.8], 'wood'),
        box([0, 1.02, 0], [5.7, 0.05, 0.9], 'cream'),
        ...[-2, -1, 0, 1, 2].map((x) =>
          box([x, 1.15, 0.05], [0.4, 0.22, 0.4], x % 2 ? 'red' : 'green'),
        ),
      ]
    case 'shelf':
      return [
        box([0, 1.0, 0], [1.3, 2.0, 0.5], 'wood'),
        ...[0.5, 1.1, 1.7].flatMap((h, i) => [
          box([0, h, 0], [1.4, 0.05, 0.55], 'cream'),
          box([-0.35, h + 0.18, 0.05], [0.3, 0.3, 0.3], i % 2 ? 'green' : 'red'),
          box([0.35, h + 0.18, 0.05], [0.3, 0.3, 0.3], 'blue'),
        ]),
      ]
    case 'table':
      return [model('table', [0, 0.1, 0], 1.1)]
    case 'chair':
      return [model('chair', [0, 0.1, 0], 1)]
    case 'sofa':
      return [model('loungesofa', [0, 0.09, 0], 1.3)]
    case 'tv':
      return [model('televisionmodern', [0, 0.85, 0], 0.9)]
    case 'fridge':
      return [model('kitchenfridgesmall', [0, 0.12, 0], 1.1)]
    case 'stove':
      return [model('kitchenstove', [0, 0.12, 0], 1.05)]
    case 'shower':
      return [model('shower', [0, 0.1, 0], 1.1)]
    case 'toilet':
      return [model('toilet', [0, 0.1, 0], 1.1)]
    case 'plant':
      return [model('pottedplant', [0, 0.1, 0], 1.4)]
    case 'atm':
      return [
        box([0, 0.9, 0], [0.7, 1.8, 0.5], 'blue'),
        box([0, 1.25, 0.26], [0.45, 0.3, 0.02], 'glass'),
        box([0, 0.8, 0.26], [0.4, 0.06, 0.02], 'black'),
      ]
    case 'board':
      return [
        box([0, 1.6, 0], [2.4, 1.2, 0.05], 'white'),
        box([0, 1.6, -0.02], [2.5, 1.3, 0.04], 'green'),
      ]
    case 'stall':
      return [
        box([0, 0.45, 0], [1.5, 0.9, 0.8], 'wood'),
        box([-0.7, 1.0, 0.35], [0.05, 1.3, 0.05], 'wood'),
        box([0.7, 1.0, 0.35], [0.05, 1.3, 0.05], 'wood'),
        box([0, 1.7, 0.1], [1.7, 0.06, 1.0], 'red', [-10, 0, 0]),
        box([-0.4, 1.0, 0], [0.35, 0.2, 0.35], 'yellow'),
        box([0.3, 1.0, 0.1], [0.35, 0.2, 0.35], 'green'),
      ]
    case 'cabinet':
      return [
        box([0, 0.9, 0], [1.0, 1.8, 0.5], 'cream'),
        box([0, 0.9, 0.26], [0.02, 1.6, 0.02], 'black'),
      ]
    case 'sign':
      return [
        box([0, 2.6, 0], [3.2, 0.6, 0.08], 'black'),
        box([0, 2.6, 0.05], [2.9, 0.34, 0.02], 'yellow'),
      ]
    case 'lamp':
      return [cyl([0, 1.2, 0], 0.04, 2.4, 'steel'), ball([0, 2.5, 0], 0.18, 'yellow')]
    case 'tree':
      return [cyl([0, 0.6, 0], 0.12, 1.2, 'trunk'), ball([0, 1.7, 0], 0.8, 'leaf')]
    case 'fountain':
      return [
        cyl([0, 0.2, 0], 1.3, 0.4, 'cream'),
        cyl([0, 0.42, 0], 1.15, 0.06, 'water'),
        cyl([0, 0.7, 0], 0.15, 0.6, 'cream'),
        ball([0, 1.05, 0], 0.22, 'water'),
      ]
    case 'crate':
      return [box([0, 0.25, 0], [0.5, 0.5, 0.5], 'wood')]
    default:
      return []
  }
}

/**
 * Floor footprint of a prop's primitive parts in its local space (models excluded: their size
 * is known only once loaded). Used for collision volumes; walls-mounted pieces above head
 * height (signs, the board) do not block the floor.
 */
export function footprintOf(
  kind: PropKind,
): { cx: number; cz: number; hx: number; hz: number; h: number } | null {
  let x0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let z0 = Number.POSITIVE_INFINITY
  let z1 = Number.NEGATIVE_INFINITY
  let top = 0
  for (const part of shapeOf(kind)) {
    if (part.t === 'model') continue
    const hx = part.t === 'box' ? part.s[0] / 2 : part.r
    const hz = part.t === 'box' ? part.s[2] / 2 : part.r
    const hy = part.t === 'box' ? part.s[1] / 2 : part.t === 'cyl' ? part.h / 2 : part.r
    if (part.p[1] - hy > 1.6) continue
    x0 = Math.min(x0, part.p[0] - hx)
    x1 = Math.max(x1, part.p[0] + hx)
    z0 = Math.min(z0, part.p[2] - hz)
    z1 = Math.max(z1, part.p[2] + hz)
    top = Math.max(top, part.p[1] + hy)
  }
  if (!Number.isFinite(x0)) return null
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, h: top }
}
