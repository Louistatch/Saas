/** Shared, fully skinned Three.js actor. Sources are CC0 adult GLBs, never primitive people. */
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { type AvatarSpec, clipFor, recolorMap } from '../../city/avatar-catalogue'
import { mealAnimations, oneShotClip } from './daily-animations'
import { createMealProps } from './meal-props'

export interface AvatarActor {
  root: THREE.Group
  mixer: THREE.AnimationMixer
  actions: Map<string, THREE.AnimationAction>
  current: string
  spec: AvatarSpec
  owned: THREE.Material[]
  /** Cushion contact below the pelvis, measured on this rig in the neutral pose. */
  seatOffset: number
  seatContact: THREE.Vector3
  mealProps: ReturnType<typeof createMealProps>
  footFloor: { L: number; R: number }
}
type AvatarAsset = Pick<GLTF, 'scene' | 'animations'>
const cachedAnimations = new WeakMap<AvatarAsset, THREE.AnimationClip[]>()
const key = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase()

/**
 * A real skeletal driving animation, derived from each rig's neutral pose. World-space
 * limb directions are converted back to local bone quaternions; the independent foot bones
 * follow the new shin endpoints. Imported geometry and clips are never modified.
 */
export function avatarAnimations(gltf: AvatarAsset): THREE.AnimationClip[] {
  const cached = cachedAnimations.get(gltf)
  if (cached) return cached
  const rig = cloneSkeleton(gltf.scene)
  const bones = new Map<string, THREE.Bone>()
  rig.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(key(o.name), o as THREE.Bone)
  })
  const neutral = gltf.animations.find((a) => a.name === 'Idle_Neutral')
  if (!neutral) throw new Error('Le modèle adulte ne contient pas sa pose de référence.')
  const mixer = new THREE.AnimationMixer(rig)
  mixer.clipAction(neutral).play()
  mixer.update(0.001)
  rig.updateMatrixWorld(true)
  const snapshots = new Map(
    [...bones].map(([name, bone]) => [
      name,
      {
        point: bone.getWorldPosition(new THREE.Vector3()),
        quaternion: bone.getWorldQuaternion(new THREE.Quaternion()),
      },
    ]),
  )
  const bone = (name: string) => {
    const found = bones.get(key(name))
    if (!found) throw new Error(`Articulation manquante : ${name}`)
    return found
  }
  const original = (name: string) => {
    const found = snapshots.get(key(name))
    if (!found) throw new Error(`Pose de référence manquante : ${name}`)
    return found
  }
  const aim = (name: string, endpoint: string, direction: THREE.Vector3) => {
    const b = bone(name)
    const from = original(name)
    const to = original(endpoint)
    const oldDirection = to.point.clone().sub(from.point).normalize()
    const world = new THREE.Quaternion()
      .setFromUnitVectors(oldDirection, direction.clone().normalize())
      .multiply(from.quaternion)
    if (!b.parent) throw new Error(`Articulation sans parent : ${name}`)
    const parent = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
    b.quaternion.copy(parent.multiply(world))
    rig.updateMatrixWorld(true)
  }
  for (const [side, sign] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    const thigh = new THREE.Vector3(sign * 0.3, -0.2, 0.93).normalize()
    const shin = new THREE.Vector3(sign * 0.05, -0.96, -0.26).normalize()
    aim(`UpperLeg${side}`, `LowerLeg${side}`, thigh)
    aim(`LowerLeg${side}`, `Foot${side}`, shin)
    const foot = bone(`Foot${side}`)
    const knee = bone(`LowerLeg${side}`).getWorldPosition(new THREE.Vector3())
    const length = original(`Foot${side}`).point.distanceTo(original(`LowerLeg${side}`).point)
    if (!foot.parent) throw new Error('Pied sans articulation parente.')
    foot.position.copy(foot.parent.worldToLocal(knee.addScaledVector(shin, length)))
    aim(`UpperArm${side}`, `LowerArm${side}`, new THREE.Vector3(sign * 0.25, -0.55, 0.8))
    aim(`LowerArm${side}`, `Wrist${side}`, new THREE.Vector3(-sign * 0.15, -0.12, 0.97))
  }
  const tracks: THREE.KeyframeTrack[] = []
  for (const b of bones.values()) {
    const q = b.quaternion.clone()
    const middle =
      key(b.name) === 'chest'
        ? q
            .clone()
            .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.008))
        : q
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${b.name}.quaternion`,
        [0, 1.2, 2.4],
        [...q.toArray(), ...middle.toArray(), ...q.toArray()],
      ),
    )
    tracks.push(
      new THREE.VectorKeyframeTrack(
        `${b.name}.position`,
        [0, 2.4],
        [...b.position.toArray(), ...b.position.toArray()],
      ),
    )
  }
  // Derive a looping pedal action on the same adult rig, preserving shin lengths and feet.
  const cycleSamples = new Map<string, { q: number[]; p: number[] }>()
  const times = Array.from({ length: 17 }, (_, i) => i / 16)
  for (const t of times) {
    for (const [side, sign] of [
      ['L', 1],
      ['R', -1],
    ] as const) {
      const phase = t * Math.PI * 2 + (side === 'R' ? Math.PI : 0)
      const thigh = new THREE.Vector3(sign * 0.12, -0.4 + 0.3 * Math.sin(phase), 0.85)
      const shin = new THREE.Vector3(sign * 0.04, -0.9, -0.3 + 0.25 * Math.cos(phase)).normalize()
      aim(`UpperLeg${side}`, `LowerLeg${side}`, thigh)
      aim(`LowerLeg${side}`, `Foot${side}`, shin)
      const foot = bone(`Foot${side}`)
      const knee = bone(`LowerLeg${side}`).getWorldPosition(new THREE.Vector3())
      const length = original(`Foot${side}`).point.distanceTo(original(`LowerLeg${side}`).point)
      if (!foot.parent) throw new Error('Pied sans articulation parente.')
      foot.position.copy(foot.parent.worldToLocal(knee.addScaledVector(shin, length)))
      rig.updateMatrixWorld(true)
    }
    for (const b of bones.values()) {
      const sample = cycleSamples.get(b.name) ?? { q: [], p: [] }
      sample.q.push(...b.quaternion.toArray())
      sample.p.push(...b.position.toArray())
      cycleSamples.set(b.name, sample)
    }
  }
  const cycleTracks: THREE.KeyframeTrack[] = []
  for (const [name, sample] of cycleSamples) {
    cycleTracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, sample.q))
    cycleTracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, times, sample.p))
  }
  mixer.stopAllAction()
  mixer.uncacheRoot(rig)
  const clips = [
    ...gltf.animations,
    new THREE.AnimationClip('HarooDrive', 2.4, tracks),
    new THREE.AnimationClip('HarooCycle', 1, cycleTracks),
    ...mealAnimations(gltf),
  ]
  cachedAnimations.set(gltf, clips)
  return clips
}
export function createAvatarActor(
  gltf: AvatarAsset,
  spec: AvatarSpec,
  height: number,
  pagne?: string,
): AvatarActor {
  const root = new THREE.Group()
  const figure = cloneSkeleton(gltf.scene)
  figure.name = 'figure'
  figure.rotation.y = THREE.MathUtils.degToRad(spec.yaw)
  figure.scale.setScalar(height / spec.height)
  root.add(figure)
  const colors = recolorMap(spec, pagne)
  const owned: THREE.Material[] = []
  const clones = new Map<THREE.Material, THREE.Material>()
  let skinned = 0
  figure.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skinned++
    mesh.castShadow = true
    mesh.frustumCulled = false
    const paint = (m: THREE.Material) => {
      let c = clones.get(m)
      if (!c) {
        c = m.clone()
        const color = colors.get(m.name)
        if (color) (c as THREE.MeshStandardMaterial).color?.set(color)
        clones.set(m, c)
        owned.push(c)
      }
      return c
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(paint) : paint(mesh.material)
  })
  if (!skinned) {
    for (const m of owned) m.dispose()
    throw new Error('Le personnage doit posséder un véritable squelette 3D.')
  }
  const mixer = new THREE.AnimationMixer(figure)
  const actions = new Map(avatarAnimations(gltf).map((clip) => [clip.name, mixer.clipAction(clip)]))
  const current = clipFor(spec, 'idle')
  actions.get(current)?.play()
  mixer.update(0)
  figure.updateWorldMatrix(true, true)
  const hips = figure.getObjectByName('Hips')
  const seatOffset =
    (hips?.getWorldPosition(new THREE.Vector3()).y ?? height * 0.48) - height * 0.04
  const footFloor = {
    L: figure.getObjectByName('FootL')?.getWorldPosition(new THREE.Vector3()).y ?? 0.02,
    R: figure.getObjectByName('FootR')?.getWorldPosition(new THREE.Vector3()).y ?? 0.02,
  }
  root.userData.avatar = {
    model: spec.id,
    family: spec.family,
    skinnedMeshes: skinned,
    clips: actions.size,
  }
  actions.get(current)?.stop()
  actions.get('HarooSitIdle')?.play()
  mixer.update(0)
  root.updateMatrixWorld(true)
  const seatContact =
    figure.getObjectByName('Body')?.getWorldPosition(new THREE.Vector3()) ??
    new THREE.Vector3(0, height * 0.35, 0)
  seatContact.y -= height * 0.045
  actions.get('HarooSitIdle')?.stop()
  actions.get(current)?.reset().play()
  mixer.update(0)
  const mealProps = createMealProps(figure)
  return {
    root,
    mixer,
    actions,
    current,
    spec,
    owned,
    seatOffset,
    seatContact,
    mealProps,
    footFloor,
  }
}
export function playAvatarActor(actor: AvatarActor, clip: string): void {
  if (clip === actor.current) return
  const next = actor.actions.get(clip)
  if (!next) return
  actor.actions.get(actor.current)?.fadeOut(0.2)
  next
    .reset()
    .setLoop(
      oneShotClip(clip) ? THREE.LoopOnce : THREE.LoopRepeat,
      oneShotClip(clip) ? 1 : Number.POSITIVE_INFINITY,
    )
  next.clampWhenFinished = oneShotClip(clip)
  next.fadeIn(0.2).play()
  actor.current = clip
}
export function disposeAvatarActor(actor: AvatarActor): void {
  actor.mealProps.dispose()
  actor.mixer.stopAllAction()
  actor.mixer.uncacheRoot(actor.mixer.getRoot())
  actor.root.removeFromParent()
  actor.root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose()
  })
  for (const material of actor.owned) material.dispose()
}
