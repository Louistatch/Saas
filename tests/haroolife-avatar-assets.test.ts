import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const ROOT = process.cwd()
const AVATARS = ['Casual_2', 'Casual_Hoodie', 'Women_Casual', 'Women_Formal']
const REQUIRED_CLIPS = ['Idle', 'Idle_Neutral', 'Interact', 'Run', 'Walk', 'Wave']

/** Read the JSON chunk from a binary glTF so CI verifies the shipped asset, not its manifest. */
async function glbJson(file: string): Promise<Record<string, unknown>> {
  const data = await readFile(file)
  assert.equal(data.toString('ascii', 0, 4), 'glTF', `${file} must be a binary glTF`)
  assert.equal(data.readUInt32LE(4), 2, `${file} must use glTF 2`)
  const jsonLength = data.readUInt32LE(12)
  assert.equal(data.readUInt32LE(16), 0x4e4f534a, `${file} must begin with a JSON chunk`)
  return JSON.parse(data.toString('utf8', 20, 20 + jsonLength).trim())
}

test('the shipped adult avatars are skinned 3D models with real locomotion clips', async () => {
  for (const name of AVATARS) {
    const file = path.join(ROOT, 'public/haroolife/vendor/quaternius', `${name}.glb`)
    const gltf = await glbJson(file)
    const meshes = gltf.meshes as unknown[]
    const skins = gltf.skins as unknown[]
    const animations = gltf.animations as Array<{ name?: string }>
    assert.ok(meshes.length > 0, `${name}: mesh missing`)
    assert.ok(skins.length > 0, `${name}: skeleton missing`)
    assert.deepEqual(
      animations.map((clip) => clip.name),
      REQUIRED_CLIPS,
      `${name}: embedded animation set changed`,
    )
  }
})

test('the downloaded Quaternius and Kenney asset packs keep their free licences', async () => {
  const licenses = await Promise.all([
    readFile(path.join(ROOT, 'public/haroolife/vendor/quaternius/LICENSE.txt'), 'utf8'),
    readFile(path.join(ROOT, 'public/haroolife/vendor/kenney-3d/LICENSE.txt'), 'utf8'),
    readFile(path.join(ROOT, 'public/haroolife/vendor/kenney-v3/city-roads/License.txt'), 'utf8'),
  ])
  for (const license of licenses) assert.match(license, /CC0|public domain/i)
})
