export type JobPoint = { x: number; z: number }

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
