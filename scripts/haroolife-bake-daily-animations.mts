/**
 * npm exec tsx scripts/haroolife-bake-daily-animations.mts <UAL1_Standard.glb> [originals-dir]
 * UAL Standard: Quaternius CC0. Retargets only four sitting clips onto the shipped adults.
 * Keeps their geometry, materials, skeleton and original six clips byte-for-byte in the BIN.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const sourceFile = process.argv[2]
if (!sourceFile) throw new Error('Indique le fichier gratuit UAL1_Standard.glb.')
const directory = 'public/haroolife/vendor/quaternius'
const files = ['Women_Casual', 'Women_Formal', 'Casual_2', 'Casual_Hoodie']
type Document = {
  nodes: { name?: string; mesh?: number }[]
  meshes: { primitives: { material?: number }[] }[]
  images?: unknown[]
  textures?: unknown[]
  buffers: { byteLength: number; uri?: string }[]
  bufferViews: { buffer: number; byteOffset: number; byteLength: number }[]
  accessors: object[]
  animations: object[]
}
function unpack(buffer: Buffer) {
  const length = buffer.readUInt32LE(12)
  return {
    json: JSON.parse(buffer.subarray(20, 20 + length).toString()) as Document,
    binary: buffer.subarray(28 + length),
  }
}
function pack(json: Document, binary: Buffer) {
  const encoded = Buffer.from(JSON.stringify(json))
  const header = Buffer.alloc(20)
  const j = Buffer.concat([encoded, Buffer.alloc((4 - (encoded.length % 4)) % 4, 32)])
  const bin = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4)])
  header.writeUInt32LE(0x46546c67)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(28 + j.length + bin.length, 8)
  header.writeUInt32LE(j.length, 12)
  header.writeUInt32LE(0x4e4f534a, 16)
  const bh = Buffer.alloc(8)
  bh.writeUInt32LE(bin.length)
  bh.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, j, bh, bin])
}
async function parse(buffer: Buffer) {
  const { json, binary } = unpack(buffer)
  for (const mesh of json.meshes)
    for (const primitive of mesh.primitives) primitive.material = undefined
  json.images = undefined
  json.textures = undefined
  const b = pack(json, binary)
  return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')
}
const source = await parse(await readFile(sourceFile))
const sb = new Map<string, THREE.Bone>()
source.scene.traverse((o) => {
  if ((o as THREE.Bone).isBone) sb.set(o.name, o as THREE.Bone)
})
const sm = new THREE.AnimationMixer(source.scene)
sm.clipAction(source.animations.find((a) => a.name === 'A_TPose')!).play()
sm.setTime(0)
source.scene.updateMatrixWorld(true)
const sourceRest = new Map(
  [...sb].map(([name, b]) => [
    name,
    {
      q: b.getWorldQuaternion(new THREE.Quaternion()),
      p: b.getWorldPosition(new THREE.Vector3()),
    },
  ]),
)
const names: Record<string, string> = {
  Body: 'pelvis',
  Abdomen: 'spine_01',
  Torso: 'spine_02',
  Chest: 'spine_03',
  Neck: 'neck_01',
  Head: 'Head',
}
for (const [side, suffix] of [
  ['L', 'l'],
  ['R', 'r'],
]) {
  for (const [t, s] of Object.entries({
    Shoulder: 'clavicle',
    UpperArm: 'upperarm',
    LowerArm: 'lowerarm',
    Wrist: 'hand',
    UpperLeg: 'thigh',
    LowerLeg: 'calf',
    Foot: 'foot',
    PT: 'ball',
  }))
    names[t + side] = `${s}_${suffix}`
  for (const finger of ['Index', 'Middle', 'Pinky', 'Ring', 'Thumb'])
    for (let i = 1; i <= (finger === 'Thumb' ? 3 : 4); i++)
      names[`${finger}${i}${side}`] =
        `${finger.toLowerCase()}_0${i}${i === 4 ? '_leaf' : ''}_${suffix}`
}
for (const file of files) {
  const original = await readFile(path.join(process.argv[3] ?? directory, `${file}.glb`))
  const target = await parse(original)
  if (target.animations.some((a) => a.name.startsWith('HarooSit')))
    throw new Error('Indique un répertoire contenant les quatre GLB originaux sans HarooSit.')
  const bones: THREE.Bone[] = []
  target.scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone)
  })
  target.scene.updateMatrixWorld(true)
  const rest = new Map(
    bones.map((b) => [
      b.name,
      {
        p: b.position.clone(),
        q: b.quaternion.clone(),
        world: b.getWorldQuaternion(new THREE.Quaternion()),
        point: b.getWorldPosition(new THREE.Vector3()),
      },
    ]),
  )
  const bone = (n: string) => bones.find((b) => b.name === n)!
  const scale = rest.get('Body')!.point.y / sourceRest.get('pelvis')!.p.y
  const clips: THREE.AnimationClip[] = []
  for (const [from, to] of [
    ['Sitting_Enter', 'HarooSitEnter'],
    ['Sitting_Idle_Loop', 'HarooSitIdle'],
    ['Sitting_Exit', 'HarooSitExit'],
    ['Sitting_Talking_Loop', 'HarooSitTalk'],
  ]) {
    sm.stopAllAction()
    const clip = source.animations.find((c) => c.name === from)!
    const action = sm.clipAction(clip)
    action.reset().setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    const count = Math.ceil(clip.duration * 24)
    const times = Array.from({ length: count + 1 }, (_, i) =>
      Math.min(clip.duration, (i * clip.duration) / count),
    )
    const samples = new Map(bones.map((b) => [b.name, { q: [] as number[], p: [] as number[] }]))
    for (const t of times) {
      sm.setTime(t)
      source.scene.updateMatrixWorld(true)
      for (const b of bones) {
        const r = rest.get(b.name)!
        b.position.copy(r.p)
        b.quaternion.copy(r.q)
      }
      target.scene.updateMatrixWorld(true)
      for (const b of bones) {
        const mapped = names[b.name]
        const s = mapped && sb.get(mapped)
        const reference = mapped && sourceRest.get(mapped)
        if (!s || !reference) continue
        const r = rest.get(b.name)!
        const world = s
          .getWorldQuaternion(new THREE.Quaternion())
          .multiply(reference.q.clone().invert())
          .multiply(r.world)
        b.quaternion.copy(
          b.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world),
        )
        if (b.name === 'Body') {
          const p = s
            .getWorldPosition(new THREE.Vector3())
            .sub(reference.p)
            .multiplyScalar(scale)
            .add(r.point)
          b.position.copy(b.parent!.worldToLocal(p))
        }
        target.scene.updateMatrixWorld(true)
      }
      // The adults were exported in an A/rest pose, while UAL uses a T pose. Match arm
      // directions in world space; copying the T-pose delta would point the arms backwards.
      for (const [side, suffix] of [
        ['L', 'l'],
        ['R', 'r'],
      ]) {
        for (const [joint, endpoint, sjoint, sendpoint] of [
          [`Shoulder${side}`, `UpperArm${side}`, `clavicle_${suffix}`, `upperarm_${suffix}`],
          [`UpperArm${side}`, `LowerArm${side}`, `upperarm_${suffix}`, `lowerarm_${suffix}`],
          [`LowerArm${side}`, `Wrist${side}`, `lowerarm_${suffix}`, `hand_${suffix}`],
        ]) {
          const b = bone(joint)
          const start = b.getWorldPosition(new THREE.Vector3())
          const old = bone(endpoint).getWorldPosition(new THREE.Vector3()).sub(start).normalize()
          const direction = sb
            .get(sendpoint)!
            .getWorldPosition(new THREE.Vector3())
            .sub(sb.get(sjoint)!.getWorldPosition(new THREE.Vector3()))
            .normalize()
          const q = new THREE.Quaternion()
            .setFromUnitVectors(old, direction)
            .multiply(b.getWorldQuaternion(new THREE.Quaternion()))
          b.quaternion.copy(
            b.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q),
          )
          target.scene.updateMatrixWorld(true)
        }
      }
      // This old modular rig parents its feet to Root, not to the shins. Keep them attached.
      for (const [side, suffix] of [
        ['L', 'l'],
        ['R', 'r'],
      ]) {
        const foot = bone(`Foot${side}`)
        const shin = bone(`LowerLeg${side}`)
        const length = rest.get(`Foot${side}`)!.point.distanceTo(rest.get(`LowerLeg${side}`)!.point)
        const direction = sb
          .get(`foot_${suffix}`)!
          .getWorldPosition(new THREE.Vector3())
          .sub(sb.get(`calf_${suffix}`)!.getWorldPosition(new THREE.Vector3()))
          .normalize()
        foot.position.copy(
          foot.parent!.worldToLocal(
            shin.getWorldPosition(new THREE.Vector3()).addScaledVector(direction, length),
          ),
        )
        target.scene.updateMatrixWorld(true)
      }
      for (const b of bones) {
        const s = samples.get(b.name)!
        s.q.push(...b.quaternion.toArray())
        s.p.push(...b.position.toArray())
      }
    }
    clips.push(
      new THREE.AnimationClip(
        to,
        clip.duration,
        bones.flatMap((b) => {
          const s = samples.get(b.name)!
          return [
            new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, s.q),
            new THREE.VectorKeyframeTrack(`${b.name}.position`, times, s.p),
          ]
        }),
      ),
    )
  }
  const { json, binary } = unpack(original)
  const chunks = [binary]
  let offset = binary.length
  const accessor = (array: ArrayLike<number>, size: number) => {
    const data = Buffer.from(new Float32Array(Array.from(array)).buffer)
    const view = json.bufferViews.length
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length })
    chunks.push(data)
    offset += data.length
    const index = json.accessors.length
    json.accessors.push({
      bufferView: view,
      componentType: 5126,
      count: array.length / size,
      type: size === 4 ? 'VEC4' : size === 3 ? 'VEC3' : 'SCALAR',
      ...(size === 1 ? { min: [array[0]], max: [array[array.length - 1]] } : {}),
    })
    return index
  }
  for (const clip of clips) {
    const samplers: object[] = []
    const channels: object[] = []
    for (const track of clip.tracks) {
      const split = track.name.lastIndexOf('.')
      const name = track.name.slice(0, split)
      const property = track.name.slice(split + 1)
      const node = json.nodes.findIndex((n) => n.name?.replace(/\./g, '') === name)
      if (node < 0) throw new Error(`Os inconnu : ${name}`)
      const sampler = samplers.length
      samplers.push({
        input: accessor(track.times, 1),
        output: accessor(track.values, property === 'quaternion' ? 4 : 3),
        interpolation: 'LINEAR',
      })
      channels.push({
        sampler,
        target: { node, path: property === 'quaternion' ? 'rotation' : 'translation' },
      })
    }
    json.animations.push({ name: clip.name, samplers, channels })
  }
  json.buffers[0].byteLength = offset
  await writeFile(path.join(directory, `${file}.glb`), pack(json, Buffer.concat(chunks)))
  console.log(`${file}: ${clips.length} animations d’assise adaptées, maillage conservé`)
}
