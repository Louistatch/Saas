/** Ground-plane collision bodies in cell units, shared by movement and visible road traffic. */
export type CollisionBody = {
  x: number
  z: number
  heading: number
  halfWidth: number
  halfLength: number
}
export function touchesBody(x: number, z: number, radius: number, body: CollisionBody): boolean {
  const a = (body.heading * Math.PI) / 180
  const dx = x - body.x
  const dz = z - body.z
  const localX = dx * Math.cos(a) - dz * Math.sin(a)
  const localZ = dx * Math.sin(a) + dz * Math.cos(a)
  const ex = Math.max(0, Math.abs(localX) - body.halfWidth)
  const ez = Math.max(0, Math.abs(localZ) - body.halfLength)
  return ex * ex + ez * ez < radius * radius
}
export function bodiesOverlap(a: CollisionBody, b: CollisionBody, gap = 0): boolean {
  // Same four separating axes, without arrays, closures or vectors per collision pair.
  const ah = (a.heading * Math.PI) / 180
  const bh = (b.heading * Math.PI) / 180
  const ac = Math.cos(ah)
  const as = Math.sin(ah)
  const bc = Math.cos(bh)
  const bs = Math.sin(bh)
  const parallel = Math.abs(ac * bc + as * bs)
  const crossed = Math.abs(ac * bs - as * bc)
  const dx = a.x - b.x
  const dz = a.z - b.z
  return (
    Math.abs(dx * ac - dz * as) <
      a.halfWidth + parallel * b.halfWidth + crossed * b.halfLength + gap &&
    Math.abs(dx * as + dz * ac) <
      a.halfLength + crossed * b.halfWidth + parallel * b.halfLength + gap &&
    Math.abs(dx * bc - dz * bs) <
      b.halfWidth + parallel * a.halfWidth + crossed * a.halfLength + gap &&
    Math.abs(dx * bs + dz * bc) <
      b.halfLength + crossed * a.halfWidth + parallel * a.halfLength + gap
  )
}
