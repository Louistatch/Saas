import * as THREE from 'three'
import type { AvatarActor } from './avatar-actor'

/** Two-bone IK: a seat supports the pelvis while each adult's own leg lengths reach the floor. */
export function plantSeatedFeet(actor: AvatarActor, weight = 1): void {
  const root = actor.root
  const point = (name: string) => root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3())
  const aim = (joint: THREE.Object3D, end: THREE.Vector3, target: THREE.Vector3) => {
    if (!joint.parent) return
    const start = joint.getWorldPosition(new THREE.Vector3())
    const q = new THREE.Quaternion()
      .setFromUnitVectors(end.clone().sub(start).normalize(), target.clone().sub(start).normalize())
      .multiply(joint.getWorldQuaternion(new THREE.Quaternion()))
    joint.quaternion.copy(
      joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q),
    )
    root.updateMatrixWorld(true)
  }
  for (const side of ['L', 'R'] as const) {
    const thigh = root.getObjectByName(`UpperLeg${side}`)
    const shin = root.getObjectByName(`LowerLeg${side}`)
    const foot = root.getObjectByName(`Foot${side}`)
    const hip = point(`UpperLeg${side}`)
    const knee = point(`LowerLeg${side}`)
    const ankle = point(`Foot${side}`)
    if (!thigh || !shin || !foot?.parent || !hip || !knee || !ankle) continue
    const rotation = foot.getWorldQuaternion(new THREE.Quaternion())
    const a = hip.distanceTo(knee)
    const b = knee.distanceTo(ankle)
    const target = ankle.clone()
    target.y += (actor.footFloor[side] - target.y) * Math.max(0, Math.min(1, weight))
    const delta = target.clone().sub(hip)
    const length = Math.min(a + b - 0.001, Math.max(Math.abs(a - b) + 0.001, delta.length()))
    const direction = delta.normalize()
    const along = (a * a - b * b + length * length) / (2 * length)
    const hint = new THREE.Vector3(0, 0, 1).applyQuaternion(
      root.getWorldQuaternion(new THREE.Quaternion()),
    )
    const perpendicular = hint.addScaledVector(direction, -hint.dot(direction)).normalize()
    const bend = hip
      .clone()
      .addScaledVector(direction, along)
      .addScaledVector(perpendicular, Math.sqrt(Math.max(0, a * a - along * along)))
    aim(thigh, knee, bend)
    const end = hip.clone().addScaledVector(direction, length)
    aim(shin, ankle, end)
    foot.position.copy(foot.parent.worldToLocal(end))
    foot.quaternion.copy(
      foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation),
    )
    root.updateMatrixWorld(true)
  }
}
