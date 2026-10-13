/**
 * One interaction contract for the whole world (Jalon D4+, M0).
 *
 * The avatar moves continuously (float cell units). Whether it stands "at a door" is decided
 * here, from that continuous position, against the footprint of each nearby building: never
 * from a rounded cell alone, and never from the estate engine's road-only `life.pos`, which
 * lags behind an avatar standing on the lawn (the root cause of « je ne peux pas entrer dans
 * ma maison »). Cells are only used to look buildings up.
 */
import { isVenue } from '../lome-life-engine'
import { CATALOG } from '../townsmen-engine'
import { type CityLife, interiorFor } from './life'
import type { LocalityId } from './locality'
import { TYPE_LABELS, inEstate, lotAt, lotById, toLocal } from './world'

export interface Vec2 {
  x: number
  z: number
}
export type InteractionKind = 'estate' | 'lot'
export interface InteractionTarget {
  id: string
  kind: InteractionKind
  locality: LocalityId
  label: string
  /** Footprint centre, world cell units. */
  worldPosition: Vec2
  /** The point of the footprint closest to the avatar, where it passes the door. */
  entrancePosition: Vec2
  /** Distance from the avatar to the footprint (0 when touching it). */
  distance: number
  radius: number
  isAccessible: boolean
  /** Why it cannot be entered, in French, when `isAccessible` is false. */
  reason: string | null
  action: 'enter'
  /** Estate building (local coordinates) or city lot id: what the enter call needs. */
  ref: { x: number; y: number } | string
}

/** Distance under which a door becomes available: the whole adjacent cell (a route ends 0.5 away). */
export const ENTER_RADIUS = 1.0
/** The current target stays available until the avatar is this far: no flicker at the edge. */
export const EXIT_RADIUS = 1.35
/** How much facing away from a door counts against it, in cell units (0 = facing it). */
export const FACING_WEIGHT = 0.5

function boxDistance(p: Vec2, x0: number, z0: number, w: number, h: number) {
  // Cell (x, y) spans [x − 0.5, x + 0.5]; a footprint of w × h cells from (x0, z0).
  const minX = x0 - 0.5
  const maxX = x0 + w - 0.5
  const minZ = z0 - 0.5
  const maxZ = z0 + h - 0.5
  const cx = Math.max(minX, Math.min(p.x, maxX))
  const cz = Math.max(minZ, Math.min(p.z, maxZ))
  return { distance: Math.hypot(p.x - cx, p.z - cz), closest: { x: cx, z: cz } }
}

/** Every building whose footprint lies within `reach` of the avatar. */
export function interactionTargets(s: CityLife, p: Vec2, reach = EXIT_RADIUS): InteractionTarget[] {
  const out: InteractionTarget[] = []
  const seen = new Set<string>()
  const r = Math.ceil(reach) + 1
  const px = Math.round(p.x)
  const pz = Math.round(p.z)
  const buildings = s.life.city.buildings
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++) {
      const x = px + dx
      const z = pz + dz
      if (s.locality === 'lome' && inEstate(x, z)) {
        const l = toLocal({ x, y: z })
        const b = buildings.find((q) => q.x === l.x && q.y === l.y)
        if (!b || b.type === 'road') continue
        const id = `estate:${l.x}:${l.y}`
        if (seen.has(id)) continue
        seen.add(id)
        const { distance, closest } = boxDistance(p, x, z, 1, 1)
        if (distance > reach) continue
        const open = isVenue(b.type)
        out.push({
          id,
          kind: 'estate',
          locality: s.locality,
          label:
            b.type === 'hall'
              ? 'Mairie'
              : (CATALOG[b.type as keyof typeof CATALOG]?.label ?? 'Bâtiment'),
          worldPosition: { x, z },
          entrancePosition: closest,
          distance,
          radius: ENTER_RADIUS,
          isAccessible: open,
          reason: open ? null : 'Ce bâtiment ne se visite pas.',
          action: 'enter',
          ref: { x: l.x, y: l.y },
        })
        continue
      }
      const lot = lotAt(x, z)
      if (!lot || seen.has(lot.id)) continue
      seen.add(lot.id)
      const box = boxDistance(p, lot.x, lot.y, lot.w, lot.h)
      // The door cell counts too: standing on it is always "at the door".
      const door = Math.hypot(p.x - lot.door.x, p.z - lot.door.y)
      const distance = Math.min(box.distance, door)
      if (distance > reach) continue
      const open = interiorFor(lot.type) !== null
      out.push({
        id: lot.id,
        kind: 'lot',
        locality: s.locality,
        label: lot.name ?? TYPE_LABELS[lot.type],
        worldPosition: { x: lot.x + (lot.w - 1) / 2, z: lot.y + (lot.h - 1) / 2 },
        entrancePosition: door <= box.distance ? { x: lot.door.x, z: lot.door.y } : box.closest,
        distance,
        radius: ENTER_RADIUS,
        isAccessible: open,
        reason: open ? null : 'Rien à visiter ici.',
        action: 'enter',
        ref: lot.id,
      })
    }
  return out
}

/** The selected destination, when the player walked there on purpose (estate or lot). */
export function preferredTarget(s: CityLife): string | null {
  if (s.target && lotById(s.target)) return s.target
  const t = s.life.target
  return t ? `estate:${t.x}:${t.y}` : null
}

/**
 * The single resolver. Picks, in order: the building the player chose (if within reach), the
 * target already shown (hysteresis: kept up to EXIT_RADIUS), then the nearest accessible
 * building within ENTER_RADIUS (ties broken by the avatar's heading, `atan2(x, z)` degrees),
 * then the nearest closed one (so the HUD can say why).
 */
export function resolveInteraction(
  s: CityLife,
  p: Vec2,
  previous: string | null,
  preferred: string | null = preferredTarget(s),
  heading: number | null = null,
): InteractionTarget | null {
  if (s.insideLot || s.life.inside) return null
  const all = interactionTargets(s, p)
  const within = (t: InteractionTarget) =>
    t.distance <= (t.id === previous ? EXIT_RADIUS : ENTER_RADIUS)
  // Near-ties (two doors on one street cell) go to the building the avatar faces.
  const score = (t: InteractionTarget) => {
    if (heading === null) return t.distance
    const dx = t.entrancePosition.x - p.x
    const dz = t.entrancePosition.z - p.z
    const d = Math.hypot(dx, dz)
    if (d < 1e-3) return t.distance
    const h = (heading * Math.PI) / 180
    const cos = (Math.sin(h) * dx + Math.cos(h) * dz) / d
    return t.distance + (FACING_WEIGHT * (1 - cos)) / 2
  }
  const near = all.filter(within).sort((a, b) => score(a) - score(b))
  const open = near.filter((t) => t.isAccessible)
  return (
    open.find((t) => t.id === preferred) ??
    open.find((t) => t.id === previous) ??
    open[0] ??
    near[0] ??
    null
  )
}

/** Estate building of the resolved target (local coordinates), if it is one. */
export const estateRef = (t: InteractionTarget) =>
  t.kind === 'estate' && typeof t.ref !== 'string' ? t.ref : null
export const lotRef = (t: InteractionTarget) =>
  t.kind === 'lot' && typeof t.ref === 'string' ? lotById(t.ref) : null
