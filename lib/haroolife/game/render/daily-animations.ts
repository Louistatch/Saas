/**
 * Daily gestures authored on the existing adult rigs (the free pack has none of them): meals,
 * sleeping, washing and the toilet. No new character, no external runtime service: each clip is
 * sampled from one of the file's own clips, then reshaped bone by bone (arm IK, torso and head
 * turns) and stored as ordinary keyframes.
 */
import * as THREE from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

type Asset = Pick<GLTF, 'scene' | 'animations'>
type Side = 'L' | 'R'
interface Pose {
  point: (name: string) => THREE.Vector3
  /** Two-bone IK: put the wrist of `side` at `hand` (world), elbow down and out. */
  arm: (side: Side, hand: THREE.Vector3) => void
  /** Turn a bone in world space about a world axis (pitch forward: +X). */
  turn: (name: string, axis: THREE.Vector3, angle: number) => void
}

const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

/**
 * Samples `base` on a clone of the rig every 1/12 s for `duration` seconds and lets `shape`
 * reshape each frame. The result is a clip of local bone transforms like the file's own.
 */
function author(
  asset: Asset,
  base: string,
  name: string,
  duration: number,
  shape: (t: number, pose: Pose) => void,
): THREE.AnimationClip {
  const rig = clone(asset.scene)
  const bones: THREE.Bone[] = []
  rig.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone)
  })
  const bone = (n: string) => {
    const b = bones.find((x) => x.name === n)
    if (!b?.parent) throw new Error(`Articulation absente : ${n}`)
    return b
  }
  const point = (n: string) => bone(n).getWorldPosition(new THREE.Vector3())
  const setWorld = (b: THREE.Bone, world: THREE.Quaternion) => {
    b.quaternion.copy(
      (b.parent as THREE.Object3D)
        .getWorldQuaternion(new THREE.Quaternion())
        .invert()
        .multiply(world),
    )
    rig.updateMatrixWorld(true)
  }
  const aim = (joint: string, end: string, direction: THREE.Vector3) => {
    const b = bone(joint)
    const old = point(end).sub(point(joint)).normalize()
    setWorld(
      b,
      new THREE.Quaternion()
        .setFromUnitVectors(old, direction.normalize())
        .multiply(b.getWorldQuaternion(new THREE.Quaternion())),
    )
  }
  const pose: Pose = {
    point,
    arm(side, hand) {
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
    },
    turn(n, axis, angle) {
      const b = bone(n)
      setWorld(
        b,
        new THREE.Quaternion()
          .setFromAxisAngle(axis, angle)
          .multiply(b.getWorldQuaternion(new THREE.Quaternion())),
      )
    },
  }
  const clip = asset.animations.find((a) => a.name === base)
  if (!clip) throw new Error(`Animation de référence absente : ${base}`)
  const mixer = new THREE.AnimationMixer(rig)
  mixer.clipAction(clip).reset().play()
  const samples = new Map(bones.map((b) => [b.name, { p: [] as number[], q: [] as number[] }]))
  const times = Array.from({ length: Math.round(duration * 12) + 1 }, (_, i) => i / 12)
  for (const t of times) {
    mixer.setTime(t % clip.duration)
    rig.updateMatrixWorld(true)
    shape(t, pose)
    for (const b of bones) {
      const s = samples.get(b.name) as { p: number[]; q: number[] }
      s.p.push(...b.position.toArray())
      s.q.push(...b.quaternion.toArray())
    }
  }
  mixer.stopAllAction()
  mixer.uncacheRoot(rig)
  return new THREE.AnimationClip(
    name,
    duration,
    bones.flatMap((b) => {
      const s = samples.get(b.name) as { p: number[]; q: number[] }
      return [
        new THREE.VectorKeyframeTrack(`${b.name}.position`, times, s.p),
        new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, s.q),
      ]
    }),
  )
}

export function mealAnimations(asset: Asset): THREE.AnimationClip[] {
  return [
    ['Idle_Neutral', 'HarooEat'],
    ['HarooSitIdle', 'HarooEatSeated'],
  ].map(([base, name]) =>
    author(asset, base, name, 4, (t, { point, arm }) => {
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
    }),
  )
}

/**
 * Asleep on the back (the renderer lays the whole figure on the mattress): legs long, one knee
 * a little bent, the left hand on the belly, the head sunk in the pillow, breathing slowly.
 */
const sleep = (asset: Asset) =>
  author(asset, 'Idle_Neutral', 'HarooSleep', 4, (t, { point, arm, turn }) => {
    const breath = Math.sin((t / 4) * Math.PI * 2)
    turn('Abdomen', X, 0.02 * breath)
    turn('Chest', X, -0.03 * breath)
    turn('Head', X, 0.32)
    turn('Head', Y, -0.35)
    const belly = point('Abdomen').add(new THREE.Vector3(0.04, 0.02, 0.17 + 0.008 * breath))
    arm('L', belly)
    const hip = point('UpperLegR')
    arm('R', hip.add(new THREE.Vector3(0.2, 0.04, 0.03)))
  })

/**
 * Bucket-and-soap shower: lather the hair with both hands, scrub the left arm, then the chest
 * and the right arm, looping back to the hair.
 */
const shower = (asset: Asset) =>
  author(asset, 'Idle_Neutral', 'HarooShower', 6, (t, { point, arm, turn }) => {
    const restL = point('WristL')
    const head = point('Head')
    const chest = point('Chest')
    const scrub = Math.sin(t * Math.PI * 4)
    const circle = new THREE.Vector3(Math.cos(t * Math.PI * 4), Math.sin(t * Math.PI * 4), 0)
    // Weights of the three phases, cross-faded over 0.4 s, wrapping at 6 s.
    const hair = 1 - smooth(1.8, 2.2, t) + smooth(5.6, 6, t)
    const arms = smooth(1.8, 2.2, t) - smooth(3.8, 4.2, t)
    const body = smooth(3.8, 4.2, t) - smooth(5.6, 6, t)
    const hairL = head
      .clone()
      .add(new THREE.Vector3(-0.1, 0.13, 0.03))
      .addScaledVector(circle, 0.03)
    const hairR = head
      .clone()
      .add(new THREE.Vector3(0.1, 0.13, 0.03))
      .addScaledVector(circle, -0.03)
    const upperL = point('LowerArmL')
    const onArmL = upperL.add(new THREE.Vector3(0.06, 0.04 + 0.06 * scrub, 0.06))
    const onChest = chest.clone().add(new THREE.Vector3(0.06 * scrub, -0.08, 0.15))
    const onArmR = point('LowerArmR').add(new THREE.Vector3(-0.06, 0.04 + 0.05 * scrub, 0.06))
    // The left arm lifts a little while it is scrubbed.
    const liftL = restL.clone().add(new THREE.Vector3(-0.12, 0.18, 0.12))
    const mix = (...parts: [THREE.Vector3, number][]) =>
      parts.reduce((v, [p, w]) => v.addScaledVector(p, w), new THREE.Vector3())
    turn('Head', X, -0.18 * hair + 0.2 * (arms + body))
    arm('L', mix([hairL, hair], [liftL, arms], [onArmR, body]))
    arm('R', mix([hairR, hair], [onArmL, arms], [onChest, body]))
  })

/**
 * On the toilet: seated, leaning forward, elbows towards the knees, a phone held in both hands
 * and the thumb scrolling now and then.
 */
const toilet = (asset: Asset) =>
  author(asset, 'HarooSitIdle', 'HarooToilet', 4, (t, { point, arm, turn }) => {
    turn('Abdomen', X, 0.22)
    turn('Chest', X, 0.08)
    turn('Head', X, 0.38)
    const knees = point('LowerLegL').add(point('LowerLegR')).multiplyScalar(0.5)
    const body = point('Body')
    const phone = knees.lerp(body, 0.35).add(new THREE.Vector3(0, 0.2, 0))
    const scroll = Math.max(0, Math.sin(t * Math.PI * 2)) ** 3 * 0.012
    arm('L', phone.clone().add(new THREE.Vector3(-0.045, 0, 0)))
    arm('R', phone.clone().add(new THREE.Vector3(0.045, scroll, 0.01)))
  })

/** Sleeping, washing and the toilet, on the rig's own skeleton. */
export const homeAnimations = (asset: Asset): THREE.AnimationClip[] => [
  sleep(asset),
  shower(asset),
  toilet(asset),
]

export const oneShotClip = (name: string) => name === 'HarooSitEnter' || name === 'HarooSitExit'
