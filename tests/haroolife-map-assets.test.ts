import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { buildingFor } from '../lib/haroolife/city/catalogue'
import { PACK_BUILD } from '../lib/haroolife/city/pack-version'
import { worldLots } from '../lib/haroolife/city/world'

const kit = path.join(__dirname, '../public/haroolife/vendor/kenney-v3')
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../docs/haroolife-v3-kit/ASSET_MANIFEST.json'), 'utf8'),
)
test('supplied city models retain their original hashes and resolve every external resource', () => {
  let count = 0
  for (const collection of manifest.collections) {
    for (const model of collection.models) {
      const filename = path.join(kit, model.file.replace(/^assets\//, ''))
      const file = fs.readFileSync(filename)
      assert.equal(createHash('sha256').update(file).digest('hex'), model.sha256, model.file)
      assert.equal(file.readUInt32LE(0), 0x46546c67)
      assert.equal(file.readUInt32LE(8), file.length, `GLB length: ${model.file}`)
      for (const uri of model.external_resources)
        assert.ok(fs.statSync(path.join(path.dirname(filename), uri)).size > 0)
      count++
    }
  }
  assert.equal(count, 213)
})
test('active baked map and client share the same binary fingerprint', () => {
  const root = path.join(__dirname, '../public/haroolife/city')
  const bank = JSON.parse(fs.readFileSync(path.join(root, 'kenney-pack.json'), 'utf8'))
  const bin = fs.readFileSync(path.join(root, 'kenney-pack.bin'))
  assert.equal(bank.build, createHash('sha256').update(bin).digest('hex').slice(0, 12))
  assert.equal(bank.build, PACK_BUILD)
  for (const key of ['npc-a', 'npc-b', 'npc-c', 'npc-d']) assert.equal(bank.models[key], undefined)
})
test('all preview images and collection textures retain valid PNG signatures', () => {
  let count = 0
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filename = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(filename)
      else if (entry.name.endsWith('.png')) {
        assert.ok(fs.readFileSync(filename).subarray(0, 8).equals(signature), filename)
        count++
      }
    }
  }
  walk(kit)
  walk(path.join(__dirname, '../docs/haroolife-v3-kit/previews'))
  assert.equal(count, 221)
})
test('ordinary apartments retain courtyards and lower silhouettes without moving their doors', () => {
  const root = path.join(__dirname, '../public/haroolife/city/kenney-pack.json')
  const bank = JSON.parse(fs.readFileSync(root, 'utf8'))
  const sizes = Object.fromEntries(
    Object.entries(bank.models).map(([key, value]) => {
      const m = value as { min: number[]; max: number[] }
      return [key, m.max.map((x, i) => x - m.min[i]) as [number, number, number]]
    }),
  )
  const lots = worldLots().filter((l) => l.type === 'apartment' && !l.name)
  assert.ok(lots.length > 100)
  for (const lot of lots) {
    const before = JSON.stringify(lot)
    const spec = buildingFor(lot, sizes)
    assert.ok(spec.main)
    assert.ok(!spec.main.model.startsWith('sky-'))
    assert.ok(sizes[spec.main.model][1] * spec.main.scale < 4)
    assert.equal(JSON.stringify(lot), before)
  }
})
