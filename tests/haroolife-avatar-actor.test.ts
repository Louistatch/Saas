import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { AVATAR_SPECS, avatarSpec, clipFor } from '../lib/haroolife/city/avatar-catalogue'
import {
  avatarAnimations,
  createAvatarActor,
  disposeAvatarActor,
  playAvatarActor,
} from '../lib/haroolife/game/render/avatar-actor'
import { plantSeatedFeet } from '../lib/haroolife/game/render/seated-feet'

for (const spec of AVATAR_SPECS)
  test(`${spec.id}: real skeleton, independent instances, bent driving limbs and attached feet`, async () => {
    const data = await readFile(`public${spec.url}`)
    const gltf = await new GLTFLoader().parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      '',
    )
    const originalBones: number[][] = []
    gltf.scene.traverse((o) => {
      if ((o as THREE.Bone).isBone)
        originalBones.push([...o.position.toArray(), ...o.quaternion.toArray()])
    })
    const a = createAvatarActor(gltf, spec, 1.75, '#e48f25')
    const b = createAvatarActor(gltf, spec, 1.75, '#1a7958')
    assert.equal(a.root.children.length, 1, 'only the imported skinned figure, no box wrap')
    assert.ok(a.root.userData.avatar.skinnedMeshes > 0)
    assert.equal(a.actions.size, 14)
    assert.equal(
      avatarAnimations(gltf),
      avatarAnimations(gltf),
      'generated clips are cached without modifying the asset',
    )
    assert.notEqual(a.root.getObjectByName('UpperLegL'), b.root.getObjectByName('UpperLegL'))
    playAvatarActor(a, clipFor(spec, 'drive'))
    a.mixer.update(0.5)
    b.mixer.update(0.5)
    a.root.updateMatrixWorld(true)
    b.root.updateMatrixWorld(true)
    const point = (actor: typeof a, name: string) => {
      const bone = actor.root.getObjectByName(name)
      assert.ok(bone, name)
      return bone.getWorldPosition(new THREE.Vector3())
    }
    for (const side of ['L', 'R']) {
      const hip = point(a, `UpperLeg${side}`)
      const knee = point(a, `LowerLeg${side}`)
      const foot = point(a, `Foot${side}`)
      const direction = knee.clone().sub(hip).normalize()
      assert.ok(direction.z > 0.85, 'thighs forward on the saddle')
      assert.ok(direction.y > -0.4, 'knees are bent instead of a standing pose')
      assert.ok(foot.y < knee.y && foot.y > 0.15, 'feet follow the lower legs onto the footrests')
      assert.ok(
        Math.abs(
          foot.distanceTo(knee) - point(b, `Foot${side}`).distanceTo(point(b, `LowerLeg${side}`)),
        ) < 0.015,
        'shin length is preserved',
      )
    }
    assert.ok(
      point(b, 'LowerLegL').z < point(a, 'LowerLegL').z - 0.2,
      'the second actor keeps its own neutral animation',
    )
    playAvatarActor(a, clipFor(spec, 'cycle'))
    a.mixer.update(0.35)
    a.root.updateMatrixWorld(true)
    const firstKnee = point(a, 'LowerLegL')
    a.mixer.update(0.25)
    a.root.updateMatrixWorld(true)
    assert.ok(
      firstKnee.distanceTo(point(a, 'LowerLegL')) > 0.03,
      'cycling moves the real leg bones',
    )
    for (const side of ['L', 'R']) {
      const leg = point(a, `LowerLeg${side}`)
      const foot = point(a, `Foot${side}`)
      const neutralLength = point(b, `LowerLeg${side}`).distanceTo(point(b, `Foot${side}`))
      assert.ok(
        Math.abs(leg.distanceTo(foot) - neutralLength) < 0.015,
        'pedalling preserves attached feet',
      )
    }
    let disposedSharedGeometry = 0
    playAvatarActor(a, 'HarooSitIdle')
    a.mixer.update(0.5)
    a.root.position.y = 0.576 - a.seatContact.y
    a.root.updateMatrixWorld(true)
    const body = point(a, 'Body')
    assert.ok(point(a, 'WristL').z > body.z, 'the A-pose adult’s arms rest in front rather than behind the chair')
    plantSeatedFeet(a)
    for (const side of ['L', 'R'] as const) {
      assert.ok(Math.abs(point(a, `Foot${side}`).y - a.footFloor[side]) < 0.002, 'the seated adult plants both feet on the floor')
      assert.ok(point(a, `LowerLeg${side}`).z > point(a, `UpperLeg${side}`).z + 0.15, 'real seated legs bend forwards')
    }
    assert.ok(point(a, 'Body').distanceTo(body) < 0.001, 'foot planting keeps the pelvis supported by the seat')
    playAvatarActor(a, 'HarooEatSeated')
    a.mixer.update(2)
    const mouth = point(a, 'Head').add(new THREE.Vector3(0.02, -0.12, 0.15).multiplyScalar(1.75 / 1.85))
    assert.ok(point(a, 'WristR').distanceTo(mouth) < 0.015, 'the spoon hand actually reaches the mouth')
    assert.ok(point(a, 'Body').distanceTo(body) < 0.015, 'eating does not turn the seated adult into a standing pose')
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.geometry.addEventListener('dispose', () => disposedSharedGeometry++)
    })
    disposeAvatarActor(a)
    disposeAvatarActor(b)
    assert.equal(
      disposedSharedGeometry,
      0,
      'instance disposal keeps cached meshes usable by other characters',
    )
    const after: number[][] = []
    gltf.scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) after.push([...o.position.toArray(), ...o.quaternion.toArray()])
    })
    assert.deepEqual(
      after,
      originalBones,
      'pose generation and instances never change the source rig',
    )
    assert.equal(avatarSpec(`character-${spec.id}`).family, 'quaternius')
  })
