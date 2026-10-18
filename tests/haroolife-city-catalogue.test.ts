import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { CATALOGUE_MODELS, buildingFor, facing, streetFor } from '../lib/haroolife/city/catalogue'
import { activitiesOf, animFor, layoutFor } from '../lib/haroolife/city/interiors'
import { arrive, cityInteract, goToLot, initialCityLife, useProp } from '../lib/haroolife/city/life'
import { LOCALITY_IDS, setLocality } from '../lib/haroolife/city/locality'
import { type PackManifest, appendModel, decodeModel, fitScale } from '../lib/haroolife/city/pack'
import { CELL, isCityRoad, landmarks, worldLots } from '../lib/haroolife/city/world'

const ROOT = path.join(__dirname, '..', 'public', 'haroolife', 'city')
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'kenney-pack.json'), 'utf8'),
) as PackManifest
const binBuf = fs.readFileSync(path.join(ROOT, 'kenney-pack.bin'))
const bin = binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength)
const sizes = Object.fromEntries(
  Object.entries(manifest.models).map(([k, m]) => [
    k,
    [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]] as [number, number, number],
  ]),
)

test('the baked Kenney pack decodes every model with consistent geometry', () => {
  assert.equal(manifest.license.startsWith('CC0'), true)
  assert.ok(Object.keys(manifest.models).length >= 60)
  for (const key of Object.keys(manifest.models)) {
    const m = decodeModel(manifest, bin, key)
    assert.equal(m.pos.length, m.nrm.length)
    assert.equal(m.pos.length, m.col.length)
    assert.equal(m.idx.length % 3, 0)
    for (const i of m.idx) assert.ok(i < m.pos.length / 3, `${key}: index in range`)
    assert.ok(m.size[0] > 0 && m.size[1] > 0 && m.size[2] > 0, `${key}: has volume`)
    // Baked colours come from the kit's colormap: not all white, not all black.
    let sum = 0
    for (const c of m.col) sum += c
    const mean = sum / m.col.length
    assert.ok(mean > 0.05 && mean < 0.98, `${key}: mean colour ${mean.toFixed(2)}`)
  }
  for (const key of CATALOGUE_MODELS)
    assert.ok(manifest.models[key], `catalogue model ${key} is baked`)
})

test('every model drawn on any lot of any town is in the pack (kit models left out are unused)', () => {
  const missing = new Set<string>()
  for (const id of LOCALITY_IDS) {
    setLocality(id)
    for (const lot of worldLots()) {
      const spec = buildingFor(lot, sizes)
      for (const key of [spec.main?.model, ...spec.props.map((p) => p.model)])
        if (key && !manifest.models[key]) missing.add(`${id}:${lot.type}:${key}`)
    }
  }
  setLocality('lome')
  assert.deepEqual([...missing], [])
})

test('appendModel transforms geometry and keeps indices valid', () => {
  const m = decodeModel(manifest, bin, 'sub-a')
  const out = { pos: [], nrm: [], col: [], idx: [] }
  appendModel(out, m, { x: 10, y: 0, z: -5, rot: 90, scale: 2 })
  appendModel(out, m, { x: 0, y: 1, z: 0, scale: [1, 2, 1], tint: [1, 0.5, 0.5] })
  assert.equal(out.pos.length, m.pos.length * 2)
  assert.equal(out.col.length, (m.pos.length / 3) * 2 * 4)
  assert.equal(out.idx.length, m.idx.length * 2)
  assert.equal(Math.max(...out.idx), (m.pos.length / 3) * 2 - 1)
  // The first copy sits around x=10, z=-5 and is twice as big.
  const xs = out.pos.filter((_, i) => i % 3 === 0 && i < m.pos.length)
  assert.ok(
    Math.min(...xs) > 10 - m.size[2] * 2 - 0.01 && Math.max(...xs) < 10 + m.size[2] * 2 + 0.01,
  )
  assert.ok(fitScale(m, 2, 2) > 0.5)
})

test('every lot gets a deterministic, footprint-fitting building spec', () => {
  const lots = worldLots()
  const counts = new Map<string, number>()
  for (const lot of lots) {
    const a = buildingFor(lot, sizes)
    const b = buildingFor(lot, sizes)
    assert.deepEqual(a, b, 'deterministic')
    if (a.main) {
      const size = sizes[a.main.model]
      assert.ok(size, `${lot.type}: model ${a.main.model} exists`)
      const side = a.main.rot === 90 || a.main.rot === 270
      const w = (side ? size[2] : size[0]) * a.main.scale
      const d = (side ? size[0] : size[2]) * a.main.scale
      assert.ok(
        w <= lot.w * CELL + 0.3 && d <= lot.h * CELL + 0.3,
        `${lot.type} ${lot.id}: fits ${w.toFixed(2)}×${d.toFixed(2)} in ${lot.w}×${lot.h}`,
      )
      counts.set(a.main.model, (counts.get(a.main.model) ?? 0) + 1)
    }
    for (const p of a.props) assert.ok(sizes[p.model], `prop ${p.model} exists`)
    assert.ok(a.far.height >= 0)
    const f = facing(lot)
    assert.ok([0, 90, 180, 270].includes(f))
  }
  // Variety: at least 25 distinct main models across the city, none above 20 % of the total.
  const total = [...counts.values()].reduce((s, n) => s + n, 0)
  assert.ok(counts.size >= 25, `distinct models: ${counts.size}`)
  for (const [k, n] of counts) assert.ok(n / total < 0.2, `${k} used ${n}/${total}`)
})

/** The pack without HarooLife's Lomé models (an older cached pack): the kit dresses every lot. */
const kitOnly = Object.fromEntries(Object.entries(sizes).filter(([k]) => !k.startsWith('lome-')))

test('landmark types are dressed as what they are', () => {
  const by = (name: RegExp) => landmarks().find((l) => name.test(l.name ?? ''))!
  // Lomé's models carry their dome and minaret, bell tower, cross or sign themselves; with the
  // kit alone the catalogue adds them as extras.
  const mosque = buildingFor(by(/Grande mosquée/), sizes)
  assert.equal(mosque.main?.model, 'lome-mosquee')
  assert.ok(buildingFor(by(/Grande mosquée/), kitOnly).extras.some((e) => e.kind === 'dome'))
  assert.ok(buildingFor(by(/Grande mosquée/), kitOnly).extras.some((e) => e.kind === 'minaret'))
  assert.equal(buildingFor(by(/Cathédrale/), sizes).main?.model, 'lome-eglise')
  assert.ok(buildingFor(by(/Cathédrale/), kitOnly).extras.some((e) => e.kind === 'steeple'))
  const chu = buildingFor(by(/CHU de Tokoin/), sizes)
  assert.equal(chu.main?.model, 'lome-dispensaire')
  assert.ok(buildingFor(by(/CHU de Tokoin/), kitOnly).extras.some((e) => e.kind === 'cross'))
  assert.ok(chu.props.some((p) => p.model === 'ambulance'))
  const market = buildingFor(by(/Grand marché/), sizes)
  assert.ok(market.extras.filter((e) => e.kind === 'canopy').length >= 6)
  assert.ok(market.props.some((p) => p.model === 'display-fruit'))
  const stadium = buildingFor(by(/Stade de Kégué/), sizes)
  assert.ok(stadium.extras.some((e) => e.kind === 'field' && e.stands))
  assert.equal(buildingFor(by(/Salle Fitness Tokoin/), sizes).main?.model, 'lome-sport')
  const gym = buildingFor(by(/Salle Fitness Tokoin/), kitOnly)
  assert.ok(gym.main && gym.extras.some((e) => e.kind === 'sign'))
})

test('street furniture appears on avenues and crosswalks at junctions', () => {
  let lamps = 0
  let trees = 0
  let crosswalks = 0
  for (let y = 0; y < 80; y++)
    for (let x = 0; x < 120; x++) {
      if (!isCityRoad(x, y)) continue
      const s = streetFor(x, y)
      if (s.lamp) lamps++
      if (s.tree) trees++
      if (s.crosswalk) crosswalks++
    }
  assert.ok(lamps > 150, `lamps ${lamps}`)
  assert.ok(trees > 100, `trees ${trees}`)
  assert.ok(crosswalks > 30, `crosswalks ${crosswalks}`)
})

test('interiors are furnished rooms with staff, and the gym has real equipment', () => {
  for (const kind of ['gym', 'house', 'market', 'hall', 'chapel', 'clinic', 'park'] as const) {
    const l = layoutFor(kind)
    assert.ok(l.props.length >= 8, `${kind}: ${l.props.length} props`)
    assert.ok(l.npcs.length >= 1, `${kind}: has characters`)
    assert.ok(activitiesOf(l).length >= 1, `${kind}: offers activities`)
    const ids = new Set(l.props.map((p) => p.id))
    assert.equal(ids.size, l.props.length, `${kind}: unique prop ids`)
  }
  const gym = layoutFor('gym')
  const kinds = gym.props.map((p) => p.kind)
  for (const k of [
    'treadmill',
    'bench-press',
    'dumbbell-rack',
    'locker',
    'reception',
    'shower',
    'toilet',
    'mat',
  ])
    assert.ok(kinds.includes(k as never), `gym has ${k}`)
  assert.equal(gym.props.filter((p) => p.kind === 'treadmill').length, 3)
  assert.ok(
    gym.npcs.some((n) => n.anim === 'run'),
    'someone runs on a treadmill',
  )
  assert.ok(
    gym.npcs.some((n) => /coach/i.test(n.role)),
    'a coach is present',
  )
  assert.equal(animFor('treadmill'), 'run')
})

test('using the treadmill costs energy, builds fitness and starts the running animation', () => {
  const gymLot = landmarks().find((l) => l.name === 'Salle Fitness Tokoin')!
  const inside = cityInteract(arrive(goToLot(initialCityLife(), gymLot)), 'enter')
  assert.equal(inside.insideLot, gymLot.id)
  const s = useProp(inside, 'treadmill-1')
  assert.equal(s.activity?.prop, 'treadmill-1')
  assert.equal(s.activity?.anim, 'run')
  assert.equal(s.fitness, 6)
  assert.equal(s.life.wallet, inside.life.wallet - 500)
  assert.equal(s.life.needs.energy, inside.life.needs.energy - 15)
  const again = useProp(s, 'bench-1')
  assert.equal(again.fitness, 14)
  assert.equal(again.activity?.anim, 'lift')
  // A broke player is refused and no animation starts.
  const broke = useProp({ ...inside, life: { ...inside.life, wallet: 100 } }, 'treadmill-1')
  assert.equal(broke.activity, null)
  assert.equal(broke.fitness, 0)
  // Showers are free and lockers are not an activity.
  assert.equal(useProp(s, 'shower-1').life.needs.hygiene, Math.min(100, s.life.needs.hygiene + 40))
  assert.equal(useProp(s, 'locker-1').activity, s.activity)
  // Leaving clears the activity.
  assert.equal(cityInteract(s, 'leave').activity, null)
})
