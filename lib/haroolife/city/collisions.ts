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
  // Separating-axis test: rotated vehicle rectangles cannot pass through each other.
  const angle = (body: CollisionBody) => (body.heading * Math.PI) / 180
  const axes = (body: CollisionBody) => [
    { x: Math.cos(angle(body)), z: -Math.sin(angle(body)) },
    { x: Math.sin(angle(body)), z: Math.cos(angle(body)) },
  ]
  const aa = axes(a)
  const ba = axes(b)
  const extent = (
    body: CollisionBody,
    basis: ReturnType<typeof axes>,
    axis: { x: number; z: number },
  ) =>
    Math.abs(basis[0].x * axis.x + basis[0].z * axis.z) * body.halfWidth +
    Math.abs(basis[1].x * axis.x + basis[1].z * axis.z) * body.halfLength
  return [...aa, ...ba].every(
    (axis) =>
      Math.abs((a.x - b.x) * axis.x + (a.z - b.z) * axis.z) <
      extent(a, aa, axis) + extent(b, ba, axis) + gap,
  )
}
