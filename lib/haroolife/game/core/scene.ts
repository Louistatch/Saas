/**
 * The rooms drawn by the HarooLife engine, as data. One format for every interior: the house
 * ported from the « Une vie à Lomé » prototype (`HOUSE_SCENE`) and every other Saas interior,
 * converted from its existing layout (`layoutFor`) so the business props, their ids and their
 * actions stay the Saas ones (`sceneFromLayout`). Pure: no renderer, no DOM, testable.
 *
 * Units: one unit is about 1 m; the player is an adult avatar of 1.85 units. The Saas layouts
 * were drawn for figures of about 0.9 unit, so they are scaled by LAYOUT_SCALE; the layout
 * coordinates stay the business positions, the scene coordinates are their drawing (documented
 * transform, never written back to the save).
 */
import type { Layout, Npc, Prop, PropKind, animFor } from '@/lib/haroolife/city/interiors'
import { type ShapePart, footprintOf, shapeOf } from '@/lib/haroolife/city/prop-shapes'
import { HOUSE_SCENE as HOUSE_DATA } from './house'
import { type Bounds, type Obstacle, type Point, isFree, pathfind } from './pathfind'

/** Layout units → scene units (Saas rooms were drawn for figures about 0.9 unit tall). */
export const LAYOUT_SCALE = 1.6

export const ASSET_BASE = {
  /** Kenney Furniture Kit files of the prototype (house). */
  furniture: '/haroolife/assets/furniture/',
  /** Kenney Furniture Kit files already used by the Saas interiors. */
  kit: '/haroolife/vendor/kenney-3d/furniture-kit/',
} as const

export type HotspotKind = 'prop' | 'npc' | 'exit'

export interface Hotspot {
  /** Stable id (tests and markers). */
  id: string
  kind: HotspotKind
  /** The Saas prop (kind 'prop') or character (kind 'npc') it stands for; 'exit' otherwise. */
  ref: string
  /** Where the player stands to act. */
  at: Point
  /** What the player faces once arrived. */
  faces: Point
  icon: string
  label: string
  /** Height of the marker above the floor. */
  markerY: number
  /** No marker on screen: the point is only used by the game (a seat for meals). */
  hidden?: boolean
}

/** A GLB model placed on the floor, centred on (x, z), bottom at y. */
export interface ModelPlacement {
  url: string
  x: number
  z: number
  y?: number
  scale: number
  /** Yaw in radians. */
  rotation?: number
  /** Name of the anchor in the scene graph (tests). */
  name?: string
}

/** A primitive of a prop (Saas prop shapes), placed with its prop's transform. */
export interface PrimitivePlacement {
  part: Exclude<ShapePart, { t: 'model' }>
  x: number
  z: number
  /** Yaw in radians. */
  rotation: number
  scale: number
}

export interface SceneNpc {
  id: string
  model: string
  x: number
  z: number
  /** Heading in radians (0 faces +Z). */
  heading: number
  seatHeight?: number
  anim: ReturnType<typeof animFor> | Npc['anim']
}

export interface RoomScene {
  id: string
  title: string
  /** Floor of the room, centred on the origin (walls on the -x and -z sides). */
  room: { w: number; d: number }
  /** Where the player may stand. */
  bounds: Bounds
  spawn: Point
  /** Heading on spawn (radians, 0 = facing +Z). */
  spawnHeading: number
  /** Public cutaway rooms retain their native walk-out through the open front. */
  exitAtFront?: boolean
  models: ModelPlacement[]
  primitives: PrimitivePlacement[]
  obstacles: Obstacle[]
  hotspots: Hotspot[]
  npcs: SceneNpc[]
  rugs: { x: number; z: number; w: number; d: number; color: string }[]
  plants: { x: number; z: number; scale: number }[]
  /** Door on the back wall (the exit marker stands in front of it). */
  door: Point
  /**
   * Camera: the whole room fits (`follow: false`, the prototype's framing) or the camera
   * follows the player at the house's zoom (bigger rooms, readable on a phone).
   */
  view: { height: number; width: number; follow: boolean }
  /** Where the figure stands while using a machine (gym): prop id → spot and heading. */
  onDevice: Record<string, { x: number; z: number; heading: number; seat?: number }>
  seats?: Record<
    string,
    {
      x: number
      z: number
      heading: number
      height: number
      entry: Point
      mealAllowed?: boolean
      /** Clip played once seated (default: sitting, or eating during a meal). */
      idle?: string
    }
  >
  /**
   * Beds the player lies down on: prop id → middle of the mattress, direction of the pillow
   * (radians, 0 = +Z), mattress height and where to stand up.
   */
  beds?: Record<string, { x: number; z: number; heading: number; height: number; entry: Point }>
  palette: {
    background: string
    ground: string
    lawn: string
    plinth: string
    floor: string
    tileA: string
    tileB: string
    wall: string
    trim: string
  }
}

// ── the house (prototype data) ──────────────────────────────────────────────────────────────

export const HOUSE_SCENE: RoomScene = {
  id: 'house',
  title: 'Maison',
  room: { w: 12.25, d: 10.25 },
  bounds: HOUSE_DATA.bounds,
  spawn: HOUSE_DATA.spawn,
  spawnHeading: HOUSE_DATA.spawnHeading,
  models: HOUSE_DATA.furniture.map((f) => ({
    url: f.url ?? `${ASSET_BASE.furniture}${f.model}.glb`,
    x: f.x,
    z: f.z,
    scale: f.scale,
    rotation: f.rotation,
    name: `meuble:${f.model}`,
  })),
  primitives: [],
  obstacles: HOUSE_DATA.obstacles,
  hotspots: HOUSE_DATA.hotspots.map((h) => ({
    id: h.id,
    kind: h.propId === 'exit' ? 'exit' : 'prop',
    ref: h.propId,
    at: h.at,
    faces: h.faces,
    icon: h.icon,
    label: h.label,
    markerY: h.markerY,
    ...(h.hidden ? { hidden: true } : {}),
  })),
  npcs: [],
  rugs: HOUSE_DATA.rugs,
  plants: HOUSE_DATA.plants,
  door: HOUSE_DATA.door,
  view: { height: 7.7, width: 8.8, follow: false },
  // Under the shower head, facing out of the cubicle.
  onDevice: { shower: { x: -5, z: 3.7, heading: Math.PI / 2 } },
  seats: {
    'chair-1': { x: 3.3, z: 0.8, heading: 0, height: 0.576, entry: { x: 3.3, z: 1.75 } },
    sofa: { x: -0.9, z: 0.8, heading: Math.PI, height: 0.598, entry: { x: -2.9, z: 0.9 } },
    'dining-1': { x: -2.7, z: -2.2, heading: 0, height: 0.576, entry: { x: -3.55, z: -2.2 } },
    'dining-2': { x: -1.7, z: -2.2, heading: 0, height: 0.576, entry: { x: -0.85, z: -2.2 } },
    toilet: {
      x: -4.82,
      z: 2.25,
      heading: Math.PI / 2,
      height: 0.5,
      entry: { x: -4.1, z: 2.1 },
      mealAllowed: false,
      idle: 'HarooToilet',
    },
  },
  beds: { bed: { x: 3.4, z: -2.0, heading: Math.PI, height: 0.62, entry: { x: 1.85, z: -1.65 } } },
  palette: HOUSE_DATA.palette,
}

// ── every other Saas interior, from its layout ──────────────────────────────────────────────

/** Measured bounds of the Kenney Furniture Kit models at scale 1 (half sizes and height). */
export const KIT_SIZE: Record<string, { hx: number; hz: number; h: number }> = {
  bedsingle: { hx: 0.286, hz: 0.563, h: 0.375 },
  bench: { hx: 0.2, hz: 0.1, h: 0.47 },
  chair: { hx: 0.1, hz: 0.1, h: 0.47 },
  desk: { hx: 0.367, hz: 0.196, h: 0.384 },
  kitchenfridgesmall: { hx: 0.215, hz: 0.146, h: 0.6 },
  kitchenstove: { hx: 0.215, hz: 0.225, h: 0.45 },
  laptop: { hx: 0.132, hz: 0.12, h: 0.162 },
  loungesofa: { hx: 0.49, hz: 0.205, h: 0.46 },
  pottedplant: { hx: 0.106, hz: 0.121, h: 0.654 },
  shower: { hx: 0.281, hz: 0.291, h: 1.094 },
  table: { hx: 0.421, hz: 0.224, h: 0.327 },
  televisionmodern: { hx: 0.342, hz: 0.064, h: 0.455 },
  toilet: { hx: 0.156, hz: 0.239, h: 0.451 },
  trashcan: { hx: 0.104, hz: 0.117, h: 0.428 },
  washer: { hx: 0.195, hz: 0.195, h: 0.47 },
}

/** Equipment the figure stands on while using it (gym); beside it for everything else. */
export const ON_DEVICE: ReadonlySet<PropKind> = new Set(['treadmill', 'bike', 'bench-press', 'mat'])

/** Marker icon of an action (the label comes from the Saas prop). */
const ACTION_ICON: Record<string, string> = {
  timetable: '📅',
  'civic-report': '🚦',
  'public-services': '🚑',
  'work-city': '💼',
  sit: '🪑',
  sleep: '🌙',
  eat: '🍲',
  relax: '🛋️',
  socialize: '💬',
  wash: '🚿',
  toilet: '🚽',
  'buy-meal': '🛒',
  browse: '🧺',
  fuel: '⛽',
  maintain: '🔧',
  police: '👮🏿',
  bank: '💳',
  learn: '📚',
  coop: '🤝',
  offers: '🌾',
  workout: '🏋️',
  run: '🏃',
  pray: '🙏',
  care: '🩺',
  rest: '🛏️',
  work: '💼',
  study: '📚',
}
const iconFor = (prop: Prop) => {
  if (prop.action && ACTION_ICON[prop.action]) return ACTION_ICON[prop.action]
  if (prop.kind === 'treadmill') return '🏃'
  if (prop.kind === 'bike') return '🚲'
  if (prop.kind === 'bench-press' || prop.kind === 'dumbbell-rack') return '🏋️'
  if (prop.kind === 'mat') return '🧘'
  if (prop.kind === 'altar' || prop.kind === 'pew') return '🙏'
  if (prop.kind === 'hospital-bed') return '🩺'
  return '✋'
}

const rotate = (x: number, z: number, a: number) => ({
  x: x * Math.cos(a) + z * Math.sin(a),
  z: -x * Math.sin(a) + z * Math.cos(a),
})

/** Floor rectangle of a prop in layout space, rotated, as an axis-aligned box (scene units). */
export function propFootprint(prop: Prop, s = LAYOUT_SCALE): (Obstacle & { h: number }) | null {
  const a = ((prop.rot ?? 0) * Math.PI) / 180
  let local: { cx: number; cz: number; hx: number; hz: number; h: number } | null = footprintOf(
    prop.kind,
  )
  // Model-only props (bed, sofa…): the measured size of their model.
  if (!local) {
    for (const part of shapeOf(prop.kind)) {
      if (part.t !== 'model' || part.p[1] > 0.3) continue
      const k = KIT_SIZE[part.name]
      if (!k) continue
      local = {
        cx: part.p[0],
        cz: part.p[2],
        hx: k.hx * part.scale,
        hz: k.hz * part.scale,
        h: k.h * part.scale,
      }
    }
  }
  if (!local) return null
  const c = rotate(local.cx, local.cz, a)
  const hx = Math.abs(Math.cos(a)) * local.hx + Math.abs(Math.sin(a)) * local.hz
  const hz = Math.abs(Math.sin(a)) * local.hx + Math.abs(Math.cos(a)) * local.hz
  return {
    x: (prop.x + c.x) * s,
    z: (prop.z + c.z) * s,
    w: hx * 2 * s,
    d: hz * 2 * s,
    h: local.h * s,
  }
}

/**
 * A free spot to use a target from: in front of it first (the side it faces), then its sides,
 * then behind, the one nearest to `from` among the free ones of equal rank. Null when none.
 */
export function approachSpot(
  target: { x: number; z: number; rot: number; hx: number; hz: number },
  obstacles: readonly Obstacle[],
  bounds: Bounds,
  from: Point,
  margin = 0.45,
): Point | null {
  for (const sides of [[0], [90, -90], [180]]) {
    const spots = sides
      .map((side) => {
        const a = target.rot + (side * Math.PI) / 180
        const dx = Math.sin(a)
        const dz = Math.cos(a)
        const ext = Math.abs(dx) * target.hx + Math.abs(dz) * target.hz
        return { x: target.x + dx * (ext + margin), z: target.z + dz * (ext + margin) }
      })
      .filter((p) => isFree(p.x, p.z, obstacles, bounds, 0.2))
      .sort(
        (a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z),
      )
    if (spots[0]) return spots[0]
  }
  return null
}

export function sceneFromLayout(id: string, layout: Layout, s = LAYOUT_SCALE): RoomScene {
  const w = layout.w * s
  const d = layout.d * s
  const bounds = {
    minX: -w / 2 + 0.35,
    maxX: w / 2 - 0.35,
    minZ: -d / 2 + 0.35,
    maxZ: d / 2 - 0.35,
  }
  const spawn = {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, layout.spawn.x * s)),
    z: Math.max(bounds.minZ, Math.min(bounds.maxZ, layout.spawn.z * s)),
  }
  const models: ModelPlacement[] = []
  const primitives: PrimitivePlacement[] = []
  const obstacles: (Obstacle & { id: string })[] = []
  for (const prop of layout.props) {
    const a = ((prop.rot ?? 0) * Math.PI) / 180
    for (const part of shapeOf(prop.kind)) {
      if (part.t === 'model') {
        const o = rotate(part.p[0], part.p[2], a)
        models.push({
          url: `${ASSET_BASE.kit}${part.name}.glb`,
          x: (prop.x + o.x) * s,
          z: (prop.z + o.z) * s,
          y: part.p[1] > 0.3 ? part.p[1] * s : 0,
          scale: part.scale * s,
          rotation: a + ((part.rotY ?? 0) * Math.PI) / 180,
          name: `objet:${prop.id}`,
        })
      } else primitives.push({ part, x: prop.x * s, z: prop.z * s, rotation: a, scale: s })
    }
    const fp = propFootprint(prop, s)
    // Thin pieces (mats) and wall-mounted ones stay walkable.
    if (fp && fp.h > 0.25) obstacles.push({ id: prop.id, x: fp.x, z: fp.z, w: fp.w, d: fp.d })
  }
  // Non-player characters stand where the layout puts them and block the floor a little.
  for (const n of layout.npcs)
    obstacles.push({ id: `npc:${n.id}`, x: n.x * s, z: n.z * s, w: 0.6, d: 0.6 })

  const hotspots: Hotspot[] = []
  for (const prop of layout.props) {
    if (!prop.action) continue
    const fp = propFootprint(prop, s)
    const a = ((prop.rot ?? 0) * Math.PI) / 180
    const target = {
      x: fp?.x ?? prop.x * s,
      z: fp?.z ?? prop.z * s,
      rot: a,
      hx: (fp?.w ?? 0.6) / 2,
      hz: (fp?.d ?? 0.6) / 2,
    }
    // The prop itself does not block its own approach (a mat, a counter one stands at).
    const others = obstacles.filter((o) => o.id !== prop.id)
    const at = ON_DEVICE.has(prop.kind)
      ? approachSpot(target, others, bounds, spawn, 0.35)
      : approachSpot(target, others, bounds, spawn)
    if (!at) continue
    hotspots.push({
      id: prop.id,
      kind: 'prop',
      ref: prop.id,
      at,
      faces: { x: target.x, z: target.z },
      icon: iconFor(prop),
      label: prop.label ?? `${prop.kind}`,
      markerY: Math.min(2.6, (fp && 'h' in fp ? fp.h : 1) + 0.6),
    })
  }
  for (const n of layout.npcs) {
    if (n.extra) continue
    const others = obstacles.filter((o) => o.id !== `npc:${n.id}`)
    let at = approachSpot(
      { x: n.x * s, z: n.z * s, rot: ((n.rot ?? 0) * Math.PI) / 180, hx: 0.3, hz: 0.3 },
      others,
      bounds,
      spawn,
      0.5,
    )
    const reachable = (p: Point | null): p is Point =>
      !!p &&
      isFree(p.x, p.z, obstacles, bounds) &&
      (pathfind(spawn, p, obstacles, bounds).length > 0 ||
        Math.hypot(p.x - spawn.x, p.z - spawn.z) < 0.5)
    // A patient on a bed or a clerk behind a counter must be approachable from its edge.
    if (!reachable(at)) {
      at = null
      search: for (const radius of [0.8, 1.2, 1.6, 2, 2.5]) {
        for (const offset of [
          0,
          Math.PI / 2,
          -Math.PI / 2,
          Math.PI,
          Math.PI / 4,
          -Math.PI / 4,
          (Math.PI * 3) / 4,
          (-Math.PI * 3) / 4,
        ]) {
          const yaw = ((n.rot ?? 0) * Math.PI) / 180 + offset
          const p = { x: n.x * s + Math.sin(yaw) * radius, z: n.z * s + Math.cos(yaw) * radius }
          if (reachable(p)) {
            at = p
            break search
          }
        }
      }
    }
    if (!at) continue
    hotspots.push({
      id: `npc:${n.id}`,
      kind: 'npc',
      ref: n.id,
      at,
      faces: { x: n.x * s, z: n.z * s },
      icon: '💬',
      label: `Parler : ${n.role}`,
      markerY: 2.3,
    })
  }
  // The way out: the entrance, in front of the spawn on the open side of the room.
  const exitAt = { x: spawn.x, z: Math.min(bounds.maxZ, spawn.z + 0.4) }
  hotspots.push({
    id: 'exit',
    kind: 'exit',
    ref: 'exit',
    at: exitAt,
    faces: { x: exitAt.x, z: exitAt.z + 1 },
    icon: '↗',
    label: `Sortir : ${layout.name}`,
    markerY: 2,
  })

  const onDevice: RoomScene['onDevice'] = {}
  const seats: NonNullable<RoomScene['seats']> = {}
  for (const prop of layout.props) {
    if (!['chair', 'sofa', 'pew'].includes(prop.kind) || !prop.action) continue
    const h = hotspots.find((h) => h.kind === 'prop' && h.ref === prop.id)
    const occupied = layout.npcs.some(
      (n) => n.anim === 'sit' && Math.hypot(n.x - prop.x, n.z - prop.z) < 0.75,
    )
    if (h && !occupied && isFree(h.at.x, h.at.z, obstacles, bounds))
      seats[prop.id] = {
        x: prop.x * s,
        z: prop.z * s,
        heading: ((prop.rot ?? 0) * Math.PI) / 180,
        height: (prop.kind === 'chair' ? 0.36 : prop.kind === 'sofa' ? 0.299 : 0.43) * s,
        entry: h.at,
        mealAllowed: prop.action === 'sit' || prop.action === 'relax',
      }
  }
  for (const prop of layout.props) {
    if (!ON_DEVICE.has(prop.kind)) continue
    const a = ((prop.rot ?? 0) * Math.PI) / 180
    const off =
      prop.kind === 'bike'
        ? 0.1
        : prop.kind === 'treadmill'
          ? 0.15
          : prop.kind === 'bench-press'
            ? 0.35
            : 0.3
    const o = rotate(0, off, a)
    onDevice[prop.id] = {
      x: (prop.x + o.x) * s,
      z: (prop.z + o.z) * s,
      heading: prop.kind === 'bike' ? a + Math.PI : a,
      ...(prop.kind === 'bike' ? { seat: 0.98 * s } : {}),
    }
  }

  const k = Math.max(w / 12.25, d / 10.25)
  return {
    id,
    title: layout.name,
    room: { w, d },
    bounds,
    spawn,
    spawnHeading: Math.PI,
    exitAtFront: true,
    models,
    primitives,
    obstacles: obstacles.map(({ x, z, w: ow, d: od }) => ({ x, z, w: ow, d: od })),
    hotspots,
    npcs: layout.npcs.map((n) => ({
      id: n.id,
      model: n.model,
      x: n.x * s,
      z: n.z * s,
      heading: ((n.rot ?? 0) * Math.PI) / 180,
      anim: n.anim,
      seatHeight:
        n.anim === 'sit'
          ? (() => {
              const seat = layout.props.find(
                (p) =>
                  ['chair', 'sofa', 'pew'].includes(p.kind) &&
                  Math.hypot(p.x - n.x, p.z - n.z) < 0.75,
              )
              return seat
                ? (seat.kind === 'chair' ? 0.36 : seat.kind === 'sofa' ? 0.299 : 0.43) * s
                : undefined
            })()
          : undefined,
    })),
    rugs: [],
    plants: [],
    door: { x: spawn.x, z: d / 2 },
    // Public rooms open in overview: the counter and residents must be discoverable on a phone.
    view: { height: 7.7 * k, width: 8.8 * k, follow: false },
    onDevice,
    seats,
    palette: {
      ...HOUSE_SCENE.palette,
      floor: layout.floor,
      tileA: layout.floor,
      tileB: layout.floor,
      wall: layout.wall,
      trim: layout.trim,
    },
  }
}

/** The scene of an interior: the prototype's house, or the converted Saas layout. */
export function sceneFor(id: string, layout: Layout): RoomScene {
  return id === 'house' && !layout.cityType ? HOUSE_SCENE : sceneFromLayout(id, layout)
}
