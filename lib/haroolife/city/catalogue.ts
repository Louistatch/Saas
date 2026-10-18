/**
 * Building catalogue: which real model (baked Kenney CC0) dresses each lot, how it is
 * turned towards its door, scaled to its footprint and tinted, and which props surround it
 * (fences, awnings, trees, stalls, lamps). Everything is a pure function of the lot and
 * the deterministic world hash, so a building never changes identity between loads.
 */
import { SIDEWALK } from '@/lib/haroolife/game/core/sidewalks'
import { current } from './locality'
import { CELL, type Lot, type LotType, hash, isCityRoad } from './world'

/** Cell-space placement: cx/cy are world cell coordinates (fractional = inside a cell). */
export interface Placement {
  model: string
  cx: number
  cy: number
  /** Height offset in scene units. */
  lift?: number
  rot: number
  scale: number
  tint?: [number, number, number]
}
export type RoofStyle = 'flat' | 'gable' | 'hip' | 'parapet' | 'dome' | 'steeple'
export interface BuildingSpec {
  /** Main model, or null when the lot is dressed procedurally only (fields, piers). */
  main: Placement | null
  props: Placement[]
  /** Procedural additions drawn by the renderer. */
  extras: Extra[]
  /** Colour and roof used by the far level of detail. */
  far: {
    body: [number, number, number]
    roof: [number, number, number]
    style: RoofStyle
    height: number
  }
}
export type Extra =
  | { kind: 'dome'; cx: number; cy: number; r: number; h: number; color: [number, number, number] }
  | {
      kind: 'minaret'
      cx: number
      cy: number
      r: number
      h: number
      color: [number, number, number]
    }
  | {
      kind: 'steeple'
      cx: number
      cy: number
      w: number
      h: number
      color: [number, number, number]
    }
  | { kind: 'cross'; cx: number; cy: number; h: number; color: [number, number, number] }
  | {
      kind: 'canopy'
      cx: number
      cy: number
      w: number
      d: number
      h: number
      stripe: [number, number, number]
    }
  | { kind: 'field'; cx: number; cy: number; w: number; d: number; stands: boolean }
  | { kind: 'pier'; cx: number; cy: number; w: number; d: number }
  | {
      kind: 'wall'
      cx: number
      cy: number
      w: number
      d: number
      h: number
      gap: 'n' | 's' | 'e' | 'w'
      color: [number, number, number]
    }
  | {
      kind: 'ground'
      cx: number
      cy: number
      w: number
      d: number
      color: [number, number, number]
    }
  | { kind: 'sign'; cx: number; cy: number; h: number; w: number; color: [number, number, number] }
  | { kind: 'bench'; cx: number; cy: number; rot: number }
  | { kind: 'flag'; cx: number; cy: number; color: [number, number, number] }

type RGB = [number, number, number]
const rgb = (hex: string): RGB => [
  Number.parseInt(hex.slice(1, 3), 16) / 255,
  Number.parseInt(hex.slice(3, 5), 16) / 255,
  Number.parseInt(hex.slice(5, 7), 16) / 255,
]
const WHITE: RGB = [1, 1, 1]
/** Material variations: warm plasters, ochres, light blues, greens common on Lomé façades. */
const HOUSE_TINTS: RGB[] = [
  WHITE,
  [1, 0.96, 0.86],
  [0.98, 0.9, 0.78],
  [0.9, 0.96, 1],
  [0.92, 1, 0.9],
  [1, 0.9, 0.84],
  [0.96, 0.96, 0.96],
  [1, 0.98, 0.72],
]
const SHOP_TINTS: RGB[] = [
  WHITE,
  [1, 0.92, 0.7],
  [0.8, 0.95, 1],
  [1, 0.82, 0.78],
  [0.84, 1, 0.84],
  [1, 0.96, 0.86],
]
const FAR_BODY: Record<LotType, RGB> = {
  house: rgb('#efe4cf'),
  apartment: rgb('#d9d4c7'),
  shop: rgb('#f3d08a'),
  market: rgb('#e8a35f'),
  school: rgb('#f0d16a'),
  university: rgb('#d8c9a8'),
  bank: rgb('#9fb4c7'),
  hospital: rgb('#f4f4f4'),
  sport: rgb('#5aa0c8'),
  stadium: rgb('#4f8c6a'),
  worship: rgb('#efe7d6'),
  park: rgb('#5f9e4e'),
  lot: rgb('#c9ad7d'),
  hotel: rgb('#e9b9c5'),
  station: rgb('#c88a4a'),
  port: rgb('#7d9cb5'),
  townhall: rgb('#e4d8b8'),
  billboard: rgb('#333333'),
  cooperative: rgb('#d9ead3'),
  industry: rgb('#9aa3b2'),
}
const ROOFS: RGB[] = [
  rgb('#b5541f'),
  rgb('#9c3b1e'),
  rgb('#c2410c'),
  rgb('#7a4a2a'),
  rgb('#4f6b8a'),
  rgb('#8b8b8b'),
]

const SMALL_HOUSES = [
  'sub-h',
  'sub-i',
  'sub-k',
  'sub-l',
  'sub-p',
  'sub-q',
  'sub-r',
  'sub-a',
  'sub-c',
  'sub-e',
  'sub-o',
]
const LARGE_HOUSES = [
  'sub-b',
  'sub-d',
  'sub-n',
  'sub-f',
  'sub-t',
  'sub-s',
  'sub-u',
  'sub-m',
  'sub-g',
  'sub-j',
]
// Commercial models by height tier; the second list of each pair is wider than one cell.
const LOW_COMMERCIAL = ['com-c']
const LOW_WIDE = ['com-c', 'com-e', 'com-k']
const MID_COMMERCIAL = ['com-a', 'com-b', 'com-d', 'com-h']
const TALL_COMMERCIAL = ['com-f', 'com-g']
const TALL_WIDE = ['com-f', 'com-g', 'com-i', 'com-j', 'com-l']
// V3: the five skyscrapers of the Commercial kit are kept for named landmarks (a few
// recognisable towers), never for plain filler blocks (those top out at five floors).
const TOWERS = ['sky-a', 'sky-b', 'sky-c', 'sky-d', 'sky-e']
const TOWERS_WIDE = ['com-m', 'com-n']
/** Industrial kit (V3): warehouses and sheds first, a few factories. */
const WAREHOUSES = ['ind-h', 'ind-i', 'ind-j', 'ind-k', 'ind-s']
const FACTORIES = ['ind-e', 'ind-l', 'ind-m']
const CONTAINERS = ['container-a', 'container-b', 'container-c']
/**
 * Lomé's own buildings (tools/blender/haroolife_lome_buildings.py), modelled in metres at real
 * proportions: drawn at their true size on the lot (never stretched to fill it), so a door stays
 * 2.1 m against a 1.75 m adult. One-cell lots, then two-cell lots.
 */
const LOME_HOUSES = ['lome-maison-a', 'lome-maison-b', 'lome-maison-c', 'lome-chantier']
const LOME_HOUSES_WIDE = ['lome-villa', 'lome-maison-large']
const LOME_SHOPS = ['lome-boutique-a', 'lome-boutique-b', 'lome-boutique-c']
const LOME_BLOCKS = ['lome-r1', 'lome-r2']
const LOME_BLOCKS_WIDE = ['lome-r1-large', 'lome-r2-large']
/** A Lomé model of the pack: real size, own colours (not regraded like the pastel kit). */
export const isLomeModel = (key: string) => key.startsWith('lome-')

const pick = <T>(arr: T[], r: number) => arr[Math.floor(r * arr.length) % arr.length]
/** Rotation (degrees around Y) turning a model's +Z front towards the door cell. */
export function facing(lot: Lot): number {
  const d = lot.door
  if (d.y >= lot.y + lot.h) return 0 // door south
  if (d.y < lot.y) return 180 // north
  if (d.x < lot.x) return 90 // west
  return 270 // east
}
const centre = (lot: Lot) => ({ cx: lot.x + (lot.w - 1) / 2, cy: lot.y + (lot.h - 1) / 2 })
/** Scene-unit footprint available to the main model. */
const footprint = (lot: Lot, margin = 0.25) => ({
  w: lot.w * CELL - margin,
  d: lot.h * CELL - margin,
})
/** Scale so the model's footprint fits the lot, using the real baked sizes. */
export function scaleFor(
  size: [number, number, number],
  w: number,
  d: number,
  rot: number,
  lo = 0.6,
  hi = 2.6,
): number {
  const sideways = rot === 90 || rot === 270
  const sx = sideways ? size[2] : size[0]
  const sz = sideways ? size[0] : size[2]
  return Math.max(lo, Math.min(hi, Math.min(w / Math.max(0.05, sx), d / Math.max(0.05, sz))))
}

export type SizeTable = Record<string, [number, number, number]>

/** Door-side offset: a point just outside the footprint on the door side (cell units). */
function doorSide(lot: Lot, dist: number) {
  const c = centre(lot)
  const r = facing(lot)
  const hw = lot.w / 2 + dist
  const hh = lot.h / 2 + dist
  if (r === 0) return { cx: c.cx, cy: c.cy + hh, rot: 0 }
  if (r === 180) return { cx: c.cx, cy: c.cy - hh, rot: 180 }
  if (r === 90) return { cx: c.cx - hw, cy: c.cy, rot: 90 }
  return { cx: c.cx + hw, cy: c.cy, rot: 270 }
}

const isMosque = (lot: Lot) => (lot.name ? /mosqu/i.test(lot.name) : hash(lot.x, lot.y, 61) < 0.45)

/**
 * Lomé's trees (tools/blender), at real size, for the kit's: the coconut palm, the mango tree for
 * the big shade trees of the yards, the neem for the smaller ones.
 */
const LOME_TREES: Record<string, string> = {
  palm: 'lome-cocotier',
  oak: 'lome-manguier',
  'tree-large': 'lome-manguier',
  tree: 'lome-neem',
  'tree-small': 'lome-neem',
}

/** The catalogue entry for a lot. `sizes` are the baked model extents (from the pack manifest). */
export function buildingFor(lot: Lot, sizes: SizeTable): BuildingSpec {
  const spec = dressLot(lot, sizes)
  for (const p of spec.props) {
    const tree = LOME_TREES[p.model]
    if (tree && sizes[tree]) p.model = tree
  }
  return spec
}

function dressLot(lot: Lot, sizes: SizeTable): BuildingSpec {
  const r1 = hash(lot.x, lot.y, 71)
  const r2 = hash(lot.x, lot.y, 72)
  const r3 = hash(lot.x, lot.y, 73)
  const rot = facing(lot)
  const c = centre(lot)
  const fp = footprint(lot)
  const props: Placement[] = []
  const extras: Extra[] = []
  const roof = pick(ROOFS, r3)
  const main = (
    model: string,
    tint?: RGB,
    lo?: number,
    hi?: number,
    margin?: number,
  ): Placement => {
    const f = margin === undefined ? fp : footprint(lot, margin)
    // Preserve every persisted lot and its door. Only its visual footprint changes: ordinary
    // buildings keep a garden/courtyard instead of filling the entire cadastral square.
    const yard = lot.name === null ? 0.78 : 0.9
    const size = sizes[model] ?? [1, 1, 1]
    return {
      model,
      cx: c.cx,
      cy: c.cy,
      rot,
      // Lomé's models keep their real size (drawn for the plot within its sidewalks, awnings
      // over them); only a lot too small for one shrinks it.
      scale: isLomeModel(model)
        ? scaleFor(size, lot.w * CELL, lot.h * CELL, rot, 0.1, 1)
        : scaleFor(size, f.w, f.d, rot, lo, hi) * yard,
      tint,
    }
  }
  /** The Lomé models when the pack has them (an older cached pack keeps the kit's). */
  const lome = (models: string[], fallback: string[]) =>
    models.every((k) => sizes[k]) ? models : fallback
  const palms = (n: number, salt: number) => {
    for (let i = 0; i < n; i++) {
      const ax = lot.x - 0.5 + hash(lot.x, lot.y, salt + i) * lot.w
      const ay = lot.y - 0.5 + hash(lot.x, lot.y, salt + 10 + i) * lot.h
      props.push({
        model: 'palm',
        cx: ax,
        cy: ay,
        rot: Math.floor(hash(lot.x, lot.y, salt + 20 + i) * 360),
        scale: 0.9 + hash(lot.x, lot.y, salt + 30 + i) * 0.4,
      })
    }
  }
  const decor = current().decor
  const coastal = decor.coastalDistricts.includes(lot.district)
  const far = (
    style: RoofStyle,
    height: number,
    body: RGB = FAR_BODY[lot.type],
    roofC: RGB = roof,
  ) => ({
    body,
    roof: roofC,
    style,
    height,
  })

  switch (lot.type) {
    case 'house': {
      const model =
        lot.w >= 2
          ? pick(lome(LOME_HOUSES_WIDE, LARGE_HOUSES), r1)
          : pick(lome(LOME_HOUSES, SMALL_HOUSES), r1)
      const tint = pick(HOUSE_TINTS, r2)
      const m = main(model, tint, 0.4, lot.w >= 2 ? 1.9 : 1.45, lot.w >= 2 ? 0.9 : 0.3)
      // Concessions: a wall with a gate on the door side, a tree and a planter. Around Lomé's
      // houses it stands behind the sidewalks (a one-cell plot has no room for a yard).
      const own = isLomeModel(model)
      if (own ? lot.w >= 2 : lot.w >= 2 || r3 > 0.45) {
        const gap = rot === 0 ? 's' : rot === 180 ? 'n' : rot === 90 ? 'w' : 'e'
        const inset = own ? 2 * SIDEWALK : 0
        extras.push({
          kind: 'wall',
          cx: c.cx,
          cy: c.cy,
          w: lot.w - inset,
          d: lot.h - inset,
          h: 0.32,
          gap,
          color: r2 > 0.5 ? rgb('#e9e2d0') : rgb('#d9c7a8'),
        })
      }
      if (lot.w >= 2) {
        const t = doorSide(lot, -0.35)
        props.push({
          model: coastal ? 'palm' : r2 > 0.5 ? decor.concessionTree : 'tree',
          cx: t.cx + (rot === 0 || rot === 180 ? 0.62 : 0),
          cy: t.cy + (rot === 90 || rot === 270 ? 0.62 : 0),
          rot: 0,
          scale: coastal ? 1.1 : 0.8,
        })
        props.push({
          model: 'planter',
          cx: t.cx - (rot === 0 || rot === 180 ? 0.62 : 0),
          cy: t.cy - (rot === 90 || rot === 270 ? 0.62 : 0),
          rot: 0,
          scale: 1.2,
        })
      } else if (coastal && r2 > 0.55) palms(1, 80)
      return { main: m, props, extras, far: far('gable', 1.1) }
    }
    case 'apartment': {
      const wide = lot.w >= 2
      const model =
        lot.name === null
          ? pick(
              wide
                ? lome(LOME_BLOCKS_WIDE, ['com-e', 'com-k', 'sub-f', 'sub-n'])
                : lome(LOME_BLOCKS, ['com-c', 'com-b', 'sub-b']),
              r1,
            )
          : lot.floors >= 6
            ? pick(wide ? TOWERS_WIDE : TOWERS, r1)
            : lot.floors >= 4
              ? pick(wide ? TALL_WIDE : TALL_COMMERCIAL, r1)
              : lot.floors === 3
                ? pick(MID_COMMERCIAL, r1)
                : pick(wide ? LOW_WIDE : LOW_COMMERCIAL, r1)
      const tint = pick(HOUSE_TINTS, r2)
      const m = main(model, tint, 0.5, 2.6, 0.2)
      if (lot.w >= 2 && r3 > 0.5) {
        const t = doorSide(lot, -0.3)
        props.push({ model: 'tree-small', cx: t.cx + 0.7, cy: t.cy, rot: 0, scale: 1.4 })
      }
      const h = (sizes[model]?.[1] ?? 1.3) * m.scale
      return { main: m, props, extras, far: far('parapet', h, FAR_BODY.apartment, rgb('#6b6b6b')) }
    }
    case 'shop': {
      const model =
        lot.floors >= 2
          ? pick(
              lot.w >= 2
                ? lome(LOME_BLOCKS_WIDE, MID_COMMERCIAL)
                : lome(LOME_BLOCKS, MID_COMMERCIAL),
              r1,
            )
          : pick(
              lot.w >= 2
                ? lome(LOME_BLOCKS_WIDE, LOW_WIDE)
                : lome(LOME_SHOPS, ['com-c', 'com-a', 'com-d']),
              r1,
            )
      const tint = pick(SHOP_TINTS, r2)
      const m = main(model, tint, 0.5, 2.2, 0.25)
      // Lomé's shops carry their own painted sign and sheet-metal awning.
      if (isLomeModel(model))
        return {
          main: m,
          props,
          extras,
          far: far('flat', (sizes[model]?.[1] ?? 0.9) * m.scale, FAR_BODY.shop, rgb('#2f7d4f')),
        }
      // Awning over the door and a sign board.
      const t = doorSide(lot, -0.08)
      props.push({
        model: lot.w >= 2 ? 'awning-wide' : 'awning',
        cx: t.cx,
        cy: t.cy,
        lift: 0.55 * m.scale,
        rot: t.rot,
        scale: m.scale * 0.9,
        tint: pick([rgb('#d94a3a'), rgb('#2f7d4f'), rgb('#e0a21c'), rgb('#2c6fb3')], r3),
      })
      extras.push({
        kind: 'sign',
        cx: t.cx,
        cy: t.cy,
        h: 0.95 * m.scale,
        w: 0.5 * lot.w,
        color: pick(
          [rgb('#d94a3a'), rgb('#1f7a4d'), rgb('#e0a21c'), rgb('#2c6fb3'), rgb('#7c3aed')],
          r2,
        ),
      })
      return {
        main: m,
        props,
        extras,
        far: far('flat', (sizes[model]?.[1] ?? 0.9) * m.scale, FAR_BODY.shop, rgb('#2f7d4f')),
      }
    }
    case 'market': {
      // Open market: ground, striped canopies on posts, stalls with goods, a few palms.
      extras.push({ kind: 'ground', cx: c.cx, cy: c.cy, w: lot.w, d: lot.h, color: rgb('#d8c39a') })
      const goods = [
        'display-fruit',
        'display-bread',
        'freezer',
        'cash-register',
        'display-fruit',
        'shopping-cart',
      ]
      let k = 0
      for (let i = 0; i < lot.w; i++)
        for (let j = 0; j < lot.h; j++) {
          const ax = lot.x + i
          const ay = lot.y + j
          extras.push({
            kind: 'canopy',
            cx: ax,
            cy: ay,
            w: 0.78,
            d: 0.78,
            h: 0.75,
            stripe: pick(
              [rgb('#d94a3a'), rgb('#2f7d4f'), rgb('#e0a21c'), rgb('#2c6fb3')],
              hash(ax, ay, 74),
            ),
          })
          props.push({
            model: goods[k++ % goods.length],
            cx: ax - 0.12,
            cy: ay + 0.08,
            rot: Math.floor(hash(ax, ay, 75) * 4) * 90,
            scale: 0.72,
          })
          if (hash(ax, ay, 76) > 0.5)
            props.push({
              model: goods[(k + 2) % goods.length],
              cx: ax + 0.22,
              cy: ay - 0.2,
              rot: 90,
              scale: 0.6,
            })
        }
      // V3: café parasols at the market's edge (Commercial kit).
      props.push({
        model: hash(lot.x, lot.y, 77) > 0.5 ? 'parasol-a' : 'parasol-b',
        cx: lot.x - 0.3,
        cy: lot.y + lot.h - 0.7,
        rot: 0,
        scale: 0.9,
      })
      return { main: null, props, extras, far: far('flat', 0.75, FAR_BODY.market, rgb('#c2410c')) }
    }
    case 'school': {
      const model = lot.w >= 3 ? 'com-k' : pick(['sub-n', 'sub-b', 'com-e'], r1)
      const m = main(model, [1, 0.97, 0.78], 0.5, 2.4, 0.3)
      const t = doorSide(lot, -0.2)
      extras.push({ kind: 'flag', cx: t.cx + 0.6, cy: t.cy, color: rgb('#1f7a4d') })
      extras.push({
        kind: 'sign',
        cx: t.cx,
        cy: t.cy,
        h: 0.9 * m.scale,
        w: 0.6 * lot.w,
        color: rgb('#1f7a4d'),
      })
      return { main: m, props, extras, far: far('flat', 1.0, FAR_BODY.school, rgb('#3b82b9')) }
    }
    case 'university': {
      const m = main('com-j', [0.98, 0.95, 0.86], 0.5, 2.6, 0.3)
      extras.push({ kind: 'flag', cx: lot.x - 0.3, cy: lot.y + lot.h - 0.2, color: rgb('#1f7a4d') })
      props.push({
        model: 'oak',
        cx: lot.x + lot.w - 0.6,
        cy: lot.y + lot.h - 0.4,
        rot: 0,
        scale: 0.9,
      })
      return { main: m, props, extras, far: far('flat', 1.7, FAR_BODY.university, rgb('#6b6b6b')) }
    }
    case 'bank': {
      const m = main(
        lot.floors >= 4 ? pick(['com-f', 'com-g', 'com-l'], r1) : 'com-a',
        [0.86, 0.92, 1],
        0.5,
        2.4,
        0.25,
      )
      const t = doorSide(lot, -0.1)
      extras.push({
        kind: 'sign',
        cx: t.cx,
        cy: t.cy,
        h: 1.0 * m.scale,
        w: 0.55 * lot.w,
        color: rgb('#1e3a8a'),
      })
      return { main: m, props, extras, far: far('parapet', 1.6, FAR_BODY.bank, rgb('#1f2a44')) }
    }
    case 'hospital': {
      const m = main(
        lot.w >= 3 ? 'com-j' : pick(['com-i', 'com-l', 'com-h'], r1),
        [1, 1, 1],
        0.5,
        2.6,
        0.3,
      )
      extras.push({
        kind: 'cross',
        cx: c.cx,
        cy: c.cy,
        h: (sizes[m.model]?.[1] ?? 1.3) * m.scale + 0.05,
        color: rgb('#dc2626'),
      })
      props.push({ model: 'ambulance', cx: lot.door.x, cy: lot.door.y, rot: 90, scale: 0.42 })
      return { main: m, props, extras, far: far('flat', 1.6, FAR_BODY.hospital, rgb('#e05a5a')) }
    }
    case 'sport': {
      if (lot.w >= 3) {
        extras.push({ kind: 'field', cx: c.cx, cy: c.cy, w: lot.w, d: lot.h, stands: false })
        return { main: null, props, extras, far: far('flat', 0.3, rgb('#4f8c6a'), rgb('#4f8c6a')) }
      }
      const m = main('com-g', [0.74, 0.88, 1], 0.5, 2.2, 0.25)
      const t = doorSide(lot, -0.1)
      extras.push({
        kind: 'sign',
        cx: t.cx,
        cy: t.cy,
        h: 1.05 * m.scale,
        w: 0.6 * lot.w,
        color: rgb('#0f766e'),
      })
      return { main: m, props, extras, far: far('flat', 1.6, FAR_BODY.sport, rgb('#0f766e')) }
    }
    case 'stadium':
      extras.push({ kind: 'field', cx: c.cx, cy: c.cy, w: lot.w, d: lot.h, stands: true })
      return { main: null, props, extras, far: far('flat', 1.2, FAR_BODY.stadium, rgb('#4f8c6a')) }
    case 'worship': {
      const white: RGB = [1, 1, 1]
      if (isMosque(lot)) {
        const m = main('com-c', [1, 0.99, 0.94], 0.5, 2.4, 0.4)
        const h = (sizes['com-c']?.[1] ?? 0.9) * m.scale
        extras.push({ kind: 'dome', cx: c.cx, cy: c.cy, r: 0.42 * lot.w, h, color: rgb('#2f9e8f') })
        extras.push({
          kind: 'minaret',
          cx: lot.x - 0.28,
          cy: lot.y - 0.28,
          r: 0.1,
          h: h + 1.6,
          color: white,
        })
        if (lot.w >= 2)
          extras.push({
            kind: 'minaret',
            cx: lot.x + lot.w - 0.72,
            cy: lot.y - 0.28,
            r: 0.1,
            h: h + 1.6,
            color: white,
          })
        return { main: m, props, extras, far: far('dome', h, FAR_BODY.worship, rgb('#2f9e8f')) }
      }
      const m = main('com-h', [1, 0.98, 0.93], 0.5, 2.4, 0.4)
      const h = (sizes['com-h']?.[1] ?? 1.3) * m.scale
      extras.push({
        kind: 'steeple',
        cx: lot.x - 0.1,
        cy: lot.y + lot.h - 0.9,
        w: 0.42,
        h: h + 1.3,
        color: rgb('#f3ece0'),
      })
      extras.push({
        kind: 'cross',
        cx: lot.x - 0.1,
        cy: lot.y + lot.h - 0.9,
        h: h + 1.3,
        color: rgb('#8b5e34'),
      })
      return { main: m, props, extras, far: far('steeple', h, FAR_BODY.worship, rgb('#8e3b8e')) }
    }
    case 'park': {
      extras.push({ kind: 'ground', cx: c.cx, cy: c.cy, w: lot.w, d: lot.h, color: rgb('#5f9e4e') })
      const n = Math.min(6, lot.w * lot.h + 1)
      for (let i = 0; i < n; i++) {
        const ax = lot.x - 0.4 + hash(lot.x, lot.y, 30 + i) * (lot.w - 0.2)
        const ay = lot.y - 0.4 + hash(lot.x, lot.y, 40 + i) * (lot.h - 0.2)
        props.push({
          model: coastal ? 'palm' : pick(['oak', 'tree', 'tree-large'], hash(lot.x, lot.y, 50 + i)),
          cx: ax,
          cy: ay,
          rot: Math.floor(hash(lot.x, lot.y, 55 + i) * 360),
          scale: 0.8 + hash(lot.x, lot.y, 60 + i) * 0.5,
        })
      }
      extras.push({ kind: 'bench', cx: c.cx, cy: lot.y + lot.h - 0.7, rot: 0 })
      if (lot.w >= 2)
        props.push({ model: 'bush', cx: lot.x + 0.3, cy: lot.y + 0.2, rot: 0, scale: 1.3 })
      return { main: null, props, extras, far: far('flat', 0.02, FAR_BODY.park, FAR_BODY.park) }
    }
    case 'lot': {
      extras.push({ kind: 'ground', cx: c.cx, cy: c.cy, w: lot.w, d: lot.h, color: rgb('#c9ad7d') })
      props.push({ model: 'fence-low', cx: c.cx, cy: lot.y - 0.42, rot: 0, scale: 1 })
      props.push({ model: 'cone', cx: lot.x - 0.2, cy: lot.y + 0.2, rot: 0, scale: 1.6 })
      if (r1 > 0.6)
        props.push({ model: 'bush', cx: lot.x + 0.25, cy: lot.y - 0.1, rot: 0, scale: 1.1 })
      return { main: null, props, extras, far: far('flat', 0.02, FAR_BODY.lot, FAR_BODY.lot) }
    }
    case 'hotel': {
      const m = main(
        lot.floors >= 5 ? pick(TOWERS, r1) : pick(['com-l', 'com-i'], r1),
        [1, 0.9, 0.93],
        0.5,
        2.6,
        0.3,
      )
      palms(lot.w >= 2 ? 2 : 1, 90)
      const t = doorSide(lot, -0.1)
      extras.push({
        kind: 'sign',
        cx: t.cx,
        cy: t.cy,
        h: 1.0 * m.scale,
        w: 0.55 * lot.w,
        color: rgb('#be185d'),
      })
      return { main: m, props, extras, far: far('parapet', 2.2, FAR_BODY.hotel, rgb('#0f766e')) }
    }
    case 'station': {
      extras.push({ kind: 'ground', cx: c.cx, cy: c.cy, w: lot.w, d: lot.h, color: rgb('#8a8f94') })
      const m: Placement = {
        model: 'com-e',
        cx: lot.x + 0.5,
        cy: lot.y + 0.1,
        rot,
        scale: 1.1,
        tint: [1, 0.93, 0.8],
      }
      props.push({
        model: 'taxi',
        cx: lot.x + lot.w - 0.9,
        cy: lot.y + lot.h - 0.75,
        rot: 0,
        scale: 0.4,
      })
      props.push({
        model: 'van',
        cx: lot.x + lot.w - 0.35,
        cy: lot.y + lot.h - 0.75,
        rot: 0,
        scale: 0.4,
      })
      props.push({
        model: 'delivery',
        cx: lot.x + lot.w - 1.45,
        cy: lot.y + lot.h - 0.75,
        rot: 0,
        scale: 0.4,
      })
      extras.push({
        kind: 'canopy',
        cx: lot.x + lot.w - 0.9,
        cy: lot.y + lot.h - 0.75,
        w: 1.9,
        d: 0.9,
        h: 0.8,
        stripe: rgb('#c88a4a'),
      })
      return { main: m, props, extras, far: far('flat', 0.9, FAR_BODY.station, rgb('#7a3b1d')) }
    }
    case 'port': {
      extras.push({ kind: 'pier', cx: c.cx, cy: c.cy, w: lot.w, d: lot.h })
      palms(2, 95)
      props.push({ model: 'truck', cx: lot.x + 0.2, cy: lot.y + 0.1, rot: 90, scale: 0.4 })
      return { main: null, props, extras, far: far('flat', 0.4, FAR_BODY.port, FAR_BODY.port) }
    }
    case 'industry': {
      // Port and industrial zone (V3, Industrial kit): a warehouse or a factory on a concrete
      // yard, containers or tanks beside it, a water tower on some larger plots.
      extras.push({ kind: 'ground', cx: c.cx, cy: c.cy, w: lot.w, d: lot.h, color: rgb('#a3a39b') })
      const big = lot.w >= 2
      const m = main(
        r1 < 0.72 ? pick(WAREHOUSES, r2) : pick(FACTORIES, r2),
        undefined,
        0.5,
        2.4,
        big ? 0.9 : 0.35,
      )
      if (big) {
        const t = doorSide(lot, -0.45)
        const side = rot === 0 || rot === 180
        props.push({
          model: r3 < 0.6 ? pick(CONTAINERS, r1) : 'tank-large',
          cx: t.cx + (side ? 0.7 : 0),
          cy: t.cy + (side ? 0 : 0.7),
          rot: side ? 90 : 0,
          scale: r3 < 0.6 ? 0.55 : 0.8,
        })
        if (r1 > 0.7)
          props.push({ model: 'water-tower', cx: lot.x - 0.2, cy: lot.y - 0.2, rot: 0, scale: 0.9 })
      } else if (r3 > 0.7)
        props.push({
          model: pick(CONTAINERS, r2),
          cx: c.cx + 0.3,
          cy: c.cy + 0.3,
          rot: 90,
          scale: 0.45,
        })
      return { main: m, props, extras, far: far('flat', 1.1, FAR_BODY.industry, rgb('#5b6475')) }
    }
    case 'cooperative': {
      const m = main('com-k', [0.86, 0.98, 0.86], 0.5, 2.6, 0.3)
      const t = doorSide(lot, -0.2)
      extras.push({ kind: 'flag', cx: t.cx - 0.7, cy: t.cy, color: rgb('#1f7a4d') })
      extras.push({
        kind: 'sign',
        cx: t.cx,
        cy: t.cy,
        h: 1.0 * m.scale,
        w: 0.7 * lot.w,
        color: rgb('#1f7a4d'),
      })
      props.push({
        model: 'oak',
        cx: lot.x + lot.w - 0.5,
        cy: lot.y + lot.h - 0.4,
        rot: 0,
        scale: 0.85,
      })
      return {
        main: m,
        props,
        extras,
        far: far('parapet', 1.5, FAR_BODY.cooperative, rgb('#1f7a4d')),
      }
    }
    case 'townhall': {
      const m = main('com-n', [1, 0.97, 0.9], 0.5, 2.6, 0.3)
      const t = doorSide(lot, -0.2)
      extras.push({ kind: 'flag', cx: t.cx - 0.6, cy: t.cy, color: rgb('#1f7a4d') })
      extras.push({ kind: 'flag', cx: t.cx + 0.6, cy: t.cy, color: rgb('#f0b429') })
      return { main: m, props, extras, far: far('parapet', 1.8, FAR_BODY.townhall, rgb('#1f2a44')) }
    }
    default:
      return { main: null, props, extras, far: far('flat', 0.6) }
  }
}

/** Street dressing for a road cell: sidewalks, lamps, trees and crosswalks (near LOD). */
export interface StreetSpec {
  avenue: boolean
  crosswalk: 'ns' | 'ew' | 'both' | null
  lamp: Placement | null
  tree: Placement | null
}
export function streetFor(x: number, y: number): StreetSpec {
  const { shoreRow, shoreTree, streetTree } = current().decor
  const shore = shoreRow !== null && y === shoreRow
  const avenueX = x % 12 === 0
  const avenueY = y % 10 === 0 || shore
  const avenue = avenueX || avenueY
  const road = (ax: number, ay: number) => isCityRoad(ax, ay)
  // Crosswalks where a street meets an avenue.
  let crosswalk: StreetSpec['crosswalk'] = null
  if (
    avenueX &&
    !avenueY &&
    (road(x - 1, y) || road(x + 1, y)) &&
    !(road(x - 1, y) && road(x + 1, y) && road(x, y - 1) && road(x, y + 1))
  )
    crosswalk = 'ew'
  else if (avenueY && !avenueX && (road(x, y - 1) || road(x, y + 1))) crosswalk = 'ns'
  let lamp: Placement | null = null
  let tree: Placement | null = null
  if (avenueX && !avenueY && y % 4 === 1)
    lamp = {
      model: y % 8 === 1 ? 'lamp-curved' : 'lamp-square',
      cx: x - 0.42,
      cy: y,
      rot: 90,
      scale: 1.5,
    }
  else if (avenueY && !avenueX && x % 4 === 2)
    lamp = {
      model: x % 8 === 2 ? 'lamp-curved' : 'lamp-square',
      cx: x,
      cy: y - 0.42,
      rot: 180,
      scale: 1.5,
    }
  if (avenueX && !avenueY && y % 6 === 3)
    tree = {
      model: shore ? shoreTree : streetTree,
      cx: x + 0.42,
      cy: y,
      rot: 0,
      scale: shore ? 1 : 1.5,
    }
  else if (avenueY && !avenueX && x % 6 === 4)
    tree = {
      model: shore ? shoreTree : streetTree,
      cx: x,
      cy: y + 0.42,
      rot: 0,
      scale: shore ? 1.1 : 1.5,
    }
  return { avenue, crosswalk, lamp, tree }
}

/** Every model key the catalogue may reference (for tests and preloading). */
export const CATALOGUE_MODELS = [
  ...SMALL_HOUSES,
  ...LARGE_HOUSES,
  ...LOW_WIDE,
  ...MID_COMMERCIAL,
  ...TALL_WIDE,
  ...TOWERS_WIDE,
  'awning',
  'awning-wide',
  'planter',
  'tree-small',
  'tree-large',
  'fence-low',
  'cone',
  'lamp-curved',
  'lamp-square',
  'display-fruit',
  'display-bread',
  'freezer',
  'cash-register',
  'shopping-cart',
  'ambulance',
  'taxi',
  'van',
  'delivery',
  'truck',
  'palm',
  'oak',
  'tree',
  'bush',
]
