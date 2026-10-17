/** Meals authored on the existing adult rigs; no new character, no external runtime service. */
import * as THREE from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

export function mealAnimations(asset: Pick<GLTF, 'scene' | 'animations'>): THREE.AnimationClip[] {
  const rig = clone(asset.scene)
  const bones: THREE.Bone[] = []
  rig.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone)
  })
  const bone = (name: string) => bones.find((b) => b.name === name)!
  const point = (name: string) => bone(name).getWorldPosition(new THREE.Vector3())
  const mixer = new THREE.AnimationMixer(rig)
  const clips: THREE.AnimationClip[] = []
  for (const [base, name] of [
    ['Idle_Neutral', 'HarooEat'],
    ['HarooSitIdle', 'HarooEatSeated'],
  ]) {
    mixer.stopAllAction()
    const clip = asset.animations.find((a) => a.name === base)
    if (!clip) throw new Error(`Animation de référence absente : ${base}`)
    mixer.clipAction(clip).reset().play()
    const samples = new Map(bones.map((b) => [b.name, { p: [] as number[], q: [] as number[] }]))
    const times = Array.from({ length: 49 }, (_, i) => i / 12)
    const aim = (joint: string, end: string, direction: THREE.Vector3) => {
      const b = bone(joint)
      if (!b.parent) throw new Error(`Articulation sans parent : ${joint}`)
      const old = point(end).sub(point(joint)).normalize()
      const world = new THREE.Quaternion()
        .setFromUnitVectors(old, direction.normalize())
        .multiply(b.getWorldQuaternion(new THREE.Quaternion()))
      b.quaternion.copy(
        b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world),
      )
      rig.updateMatrixWorld(true)
    }
    const arm = (side: string, hand: THREE.Vector3) => {
      const origin = point(`UpperArm${side}`)
      const a = origin.distanceTo(point(`LowerArm${side}`))
      const b = point(`LowerArm${side}`).distanceTo(point(`Wrist${side}`))
      const delta = hand.clone().sub(origin)
      const distance = Math.min(a + b - 0.005, Math.max(Math.abs(a - b) + 0.005, delta.length()))
      const direction = delta.normalize()
      const along = (a * a - b * b + distance * distance) / (2 * distance)
      const hint = new THREE.Vector3(side === 'L' ? -0.8 : 0.8, -1, 0.1)
      const perpendicular = hint.addScaledVector(direction, -hint.dot(direction)).normalize()
      const elbow = origin
        .clone()
        .addScaledVector(direction, along)
        .addScaledVector(perpendicular, Math.sqrt(Math.max(0, a * a - along * along)))
      aim(`UpperArm${side}`, `LowerArm${side}`, elbow.clone().sub(origin))
      aim(
        `LowerArm${side}`,
        `Wrist${side}`,
        origin
          .clone()
          .addScaledVector(direction, distance)
          .sub(point(`LowerArm${side}`)),
      )
    }
    for (const t of times) {
      mixer.setTime(t)
      rig.updateMatrixWorld(true)
      const body = point('Body')
      const head = point('Head')
      const bowl = body.clone().add(new THREE.Vector3(-0.12, 0.15, 0.33))
      const mouth = head.clone().add(new THREE.Vector3(0.02, -0.12, 0.15))
      // Scoop, lift, brief bite, lower: a whole gesture rather than a waving Interact clip.
      const phase = t / 4
      const lift = Math.sin(Math.PI * Math.min(1, Math.max(0, (phase - 0.12) / 0.76))) ** 2
      arm('L', bowl)
      arm(
        'R',
        bowl
          .clone()
          .add(new THREE.Vector3(0.12, 0.06, 0))
          .lerp(mouth, lift),
      )
      for (const b of bones) {
        const s = samples.get(b.name)!
        s.p.push(...b.position.toArray())
        s.q.push(...b.quaternion.toArray())
      }
    }
    clips.push(
      new THREE.AnimationClip(
        name,
        4,
        bones.flatMap((b) => {
          const s = samples.get(b.name)!
          return [
            new THREE.VectorKeyframeTrack(`${b.name}.position`, times, s.p),
            new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, s.q),
          ]
        }),
      ),
    )
  }
  mixer.stopAllAction()
  mixer.uncacheRoot(rig)
  return clips
}

export const oneShotClip = (name: string) => name === 'HarooSitEnter' || name === 'HarooSitExit'
