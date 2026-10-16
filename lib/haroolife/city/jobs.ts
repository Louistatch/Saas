export type JobPoint = { x: number; z: number }

export type ServiceVehiclePlacement = {
  vehicle: JobPoint
  approach: JobPoint
}

const CARDINAL = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
] as const

/**
 * Reserve two distinct road cells: one for the service vehicle and one for its driver.
 * Keeping the avatar one cell away makes the vehicle visible and still leaves it within the
 * controller's boarding radius.
 */
export function serviceVehiclePlacement(
  at: JobPoint,
  drivable: (x: number, z: number) => boolean,
  radius = 8,
): ServiceVehiclePlacement | null {
  const cx = Math.round(at.x)
  const cz = Math.round(at.z)
  const candidates: ServiceVehiclePlacement[] = []
  for (let dz = -radius; dz <= radius; dz++)
    for (let dx = -radius; dx <= radius; dx++) {
      const vehicle = { x: cx + dx, z: cz + dz }
      if (!drivable(vehicle.x, vehicle.z)) continue
      for (const side of CARDINAL) {
        const approach = { x: vehicle.x + side.x, z: vehicle.z + side.z }
        if (drivable(approach.x, approach.z)) candidates.push({ vehicle, approach })
      }
    }
  candidates.sort((a, b) => {
    const score = (p: ServiceVehiclePlacement) => {
      const walk = Math.hypot(p.approach.x - at.x, p.approach.z - at.z)
      const parkedOverPlayer = Math.hypot(p.vehicle.x - at.x, p.vehicle.z - at.z) < 0.75
      return walk + (parkedOverPlayer ? radius * 4 : 0)
    }
    return score(a) - score(b)
  })
  return candidates[0] ?? null
}

/** Closest road cell where a service vehicle can really be driven. */
export function serviceVehicleSpot(
  at: JobPoint,
  drivable: (x: number, z: number) => boolean,
  radius = 8,
): JobPoint | null {
  const cx = Math.round(at.x)
  const cz = Math.round(at.z)
  const candidates: JobPoint[] = []
  for (let dz = -radius; dz <= radius; dz++)
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx
      const z = cz + dz
      if (drivable(x, z)) candidates.push({ x, z })
    }
  candidates.sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z))
  return candidates[0] ?? null
}
