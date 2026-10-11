import type { Building, Structure } from './townsmen-engine'
import { roadNeighbours } from './vendor/simcity-road-path'
/**
 * Real accounts in the Lomé 3D neighbourhood. Pure placement rules on top of the
 * HarooLife world payload (/api/haroolife/world): each resident of the canton stands
 * next to the building that matches their role. No contact data is involved.
 */
import type { Resident, Role } from './world'

export interface PlacedResident {
  resident: Resident
  x: number
  y: number
  rotation: number
  /** Building the person is attached to (where they are listed as "here"). */
  at: Structure
}

/** The building a role naturally stands by in the neighbourhood. */
export function spotForRoles(roles: Role[]): Structure {
  if (roles.includes('producteur')) return 'farm'
  if (roles.includes('acheteur')) return 'market'
  if (roles.includes('admin_coop') || roles.includes('union') || roles.includes('faitiere'))
    return 'hall'
  if (roles.includes('operateur')) return 'hall'
  if (roles.includes('agronome')) return 'well'
  if (roles.includes('ouvrier')) return 'park'
  return 'park'
}

/**
 * Stand residents around their building: each one on a distinct free neighbour tile
 * (not a building), spread clockwise, overflow stacking two per tile with a turn.
 * Deterministic for the same input so figures do not jump between renders.
 */
export function placeResidents(residents: Resident[], buildings: Building[]): PlacedResident[] {
  // Roads are walkable; every other structure is solid.
  const occupied = new Set(buildings.filter((b) => b.type !== 'road').map((b) => `${b.x}:${b.y}`))
  const byType = new Map<Structure, Building>()
  for (const b of buildings) if (!byType.has(b.type)) byType.set(b.type, b)
  const used = new Map<string, number>()
  const out: PlacedResident[] = []
  for (const resident of residents.filter((r) => !r.is_me)) {
    const at = spotForRoles(resident.roles)
    const anchor = byType.get(at) ?? byType.get('hall')
    if (!anchor) continue
    const free = roadNeighbours(anchor).filter((p) => !occupied.has(`${p.x}:${p.y}`))
    const ring = free.length ? free : roadNeighbours(anchor)
    let best = ring[0]
    for (const p of ring) {
      if ((used.get(`${p.x}:${p.y}`) ?? 0) < (used.get(`${best.x}:${best.y}`) ?? 0)) best = p
    }
    const n = used.get(`${best.x}:${best.y}`) ?? 0
    used.set(`${best.x}:${best.y}`, n + 1)
    out.push({
      resident,
      x: best.x,
      y: best.y,
      rotation: (n * 120 + out.length * 37) % 360,
      at: anchor.type,
    })
  }
  return out
}

/** People attached to a venue, for the "ici maintenant" list when the player is inside. */
export function residentsAt(placed: PlacedResident[], at: Structure): Resident[] {
  return placed.filter((p) => p.at === at).map((p) => p.resident)
}
