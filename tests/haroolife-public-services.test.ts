import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import type { Bank } from '../lib/haroolife/city/bank'
import { buildingFor } from '../lib/haroolife/city/catalogue'
import { bodiesOverlap } from '../lib/haroolife/city/collisions'
import {
  AmbulanceMission,
  type EmergencyOrder,
  callAmbulance,
  cancelAmbulance,
  decodeEmergency,
  emergencyEvent,
  emergencyOf,
} from '../lib/haroolife/city/emergency'
import { decodeCityLife, enterLot, initialCityLife } from '../lib/haroolife/city/life'
import { LOCALITY_IDS, setLocality } from '../lib/haroolife/city/locality'
import { type PackManifest, decodeModel } from '../lib/haroolife/city/pack'
import {
  SIGNAL_REPAIR_BUDGET,
  municipalRepairDone,
  reportMunicipalSignal,
} from '../lib/haroolife/city/street-civic'
import { landmarks } from '../lib/haroolife/city/world'
import type { StreetBuilding } from '../lib/haroolife/game/core/street'
import { buildCityGeometry } from '../lib/haroolife/game/render/city-models'

test('the live street omits only the non-colliding decorative ambulance from the hospital geometry', () => {
  setLocality('lome')
  const lot = landmarks().find((l) => l.type === 'hospital')
  assert.ok(lot)
  const manifest = JSON.parse(
    fs.readFileSync('public/haroolife/city/kenney-pack.json', 'utf8'),
  ) as PackManifest
  const bytes = fs.readFileSync('public/haroolife/city/kenney-pack.bin')
  const binary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const model = (key: string) => decodeModel(manifest, binary, key)
  const bank: Bank = {
    manifest,
    model,
    lowModel: model,
    sizes: Object.fromEntries(
      Object.entries(manifest.models).map(([key, m]) => [
        key,
        [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]],
      ]),
    ),
  }
  const building: StreetBuilding = { ...lot, floors: 2, color: '#ffffff', roof: '#555555', lot }
  const count = buildingFor(lot, bank.sizes).props.filter((p) => p.model === 'ambulance').length
  assert.ok(count > 0, 'the hospital catalogue actually contains the old decoration')
  const before = buildCityGeometry(bank, [building], true)
  const after = buildCityGeometry(bank, [building], true, true)
  assert.equal(
    (before.index?.count ?? 0) - (after.index?.count ?? 0),
    count * model('ambulance').idx.length,
  )
  assert.equal(
    before.getAttribute('position').count - after.getAttribute('position').count,
    (count * model('ambulance').pos.length) / 3,
  )
  before.dispose()
  after.dispose()
})

for (const locality of LOCALITY_IDS)
  test(`${locality}: ambulance dispatch finds an actual reachable hospital without charging the player`, () => {
    setLocality(locality)
    const hospital = landmarks().find((l) => l.type === 'hospital')
    assert.ok(hospital)
    const s = { ...initialCityLife(), locality }
    s.at = { ...hospital.door }
    const next = callAmbulance(s, { x: hospital.door.x, z: hospital.door.y }, 'ambulance-test')
    assert.ok(next.emergency?.active, next.life.lastEvent)
    assert.equal(next.emergency.active.locality, locality)
    assert.ok(
      landmarks().some((l) => l.type === 'hospital' && l.id === next.emergency?.active?.hospital),
    )
    assert.equal(next.life.wallet, s.life.wallet)
    assert.equal(
      callAmbulance(next, next.emergency.active.patient, 'duplicate').emergency?.active?.id,
      'ambulance-test',
    )
    assert.equal(cancelAmbulance(next).emergency?.active, null)
  })

test('only an ordered arrival gives first aid, exactly once, and it restores into the correct clinic', () => {
  setLocality('lome')
  const hospital = landmarks().find((l) => l.type === 'hospital')
  assert.ok(hospital)
  const base = initialCityLife()
  base.life.needs.energy = 30
  base.life.needs.hygiene = 20
  let s = callAmbulance(base, { x: hospital.door.x, z: hospital.door.y }, 'medical-1')
  const order = emergencyOf(s).active
  assert.ok(order)
  assert.equal(emergencyEvent(s, { id: order.id, type: 'arrived' }), s, 'no early care')
  assert.equal(emergencyEvent(s, { id: 'someone-else', type: 'boarding' }), s)
  s = emergencyEvent(s, { id: order.id, type: 'boarding' })
  s = emergencyEvent(s, { id: order.id, type: 'transport' })
  s = emergencyEvent(s, { id: order.id, type: 'arrived' })
  assert.equal(s.insideLot, order.hospital)
  assert.equal(s.emergency?.completed, 1)
  assert.equal(s.life.needs.energy, 60)
  assert.equal(s.life.needs.hygiene, 40)
  assert.equal(s.life.wallet, base.life.wallet)
  assert.equal(emergencyEvent(s, { id: order.id, type: 'arrived' }), s)
  const outside = { ...s, insideLot: null }
  assert.equal(callAmbulance(outside, order.patient, 'again').emergency?.active, null)
  const restored = decodeCityLife(JSON.parse(JSON.stringify(s)))
  assert.equal(restored?.emergency?.completed, 1)
  assert.equal(restored?.emergency?.active, null)
})

test('interrupted transport resumes dispatch without offline healing; malformed mission data is discarded', () => {
  setLocality('lome')
  const h = landmarks().find((l) => l.type === 'hospital')
  assert.ok(h)
  let s = callAmbulance(initialCityLife(), { x: h.door.x, z: h.door.y }, 'restore')
  s = emergencyEvent(s, { id: 'restore', type: 'boarding' })
  s = emergencyEvent(s, { id: 'restore', type: 'transport' })
  const restored = decodeCityLife(JSON.parse(JSON.stringify(s)))
  assert.equal(restored?.emergency?.active?.phase, 'dispatch')
  assert.deepEqual(restored?.life.needs, s.life.needs)
  assert.equal(
    decodeEmergency({ active: { id: 'invalid', patient: { x: Number.POSITIVE_INFINITY, z: 3 } } })
      .active,
    null,
  )
})

const road = (x: number, z: number) => z === 0 && x >= 0 && x <= 12
const order: EmergencyOrder = {
  id: 'runtime',
  locality: 'lome',
  hospital: 'test-hospital',
  depot: { x: 0, z: 0 },
  patient: { x: 6, z: 0 },
  pickup: { x: 6, z: 0 },
  phase: 'dispatch',
}

test('the actual road controller goes out, stops for pickup and returns before emitting a single arrival', () => {
  const mission = new AmbulanceMission(order, road)
  const events: string[] = []
  let farthest = 0
  for (let i = 0; i < 120 * 60; i++) {
    const e = mission.update(1 / 60, [], i / 60, null, false)
    if (e) events.push(e.type)
    farthest = Math.max(farthest, mission.position.x)
    const v = mission.driver.vehicle
    assert.ok(v)
    assert.ok(road(Math.round(v.x), Math.round(v.z)))
  }
  assert.deepEqual(events, ['boarding', 'transport', 'arrived'])
  assert.ok(farthest > 4)
  assert.ok(mission.position.x < 0.5)
})

test('a blocked ambulance waits and fails safely instead of driving through a vehicle or granting care', () => {
  const mission = new AmbulanceMission(
    { ...order, patient: { x: 11, z: 0 }, pickup: { x: 11, z: 0 } },
    road,
  )
  const blocker = { x: 3, z: -0.25, heading: 90, halfWidth: 0.27, halfLength: 0.67 }
  const events: string[] = []
  for (let i = 0; i < 120 * 60; i++) {
    const e = mission.update(1 / 60, [blocker], i / 60, null, false)
    if (e) events.push(e.type)
    assert.equal(bodiesOverlap(mission.body, blocker, 0), false)
  }
  assert.deepEqual(events, ['failed'])
})

test('the mayor funds a local repair once; the resident is never charged and poor towns are not trapped', () => {
  for (const coins of [0, 1250]) {
    setLocality('lome')
    const hall = landmarks().find((l) => l.type === 'townhall')
    assert.ok(hall)
    const base = initialCityLife()
    base.life.city.coins = coins
    const inside = enterLot(base, hall)
    const s = reportMunicipalSignal(inside)
    assert.equal(s.life.wallet, inside.life.wallet)
    assert.equal(s.life.city.coins, Math.max(0, coins - SIGNAL_REPAIR_BUDGET))
    assert.equal(s.civic?.projects?.lome?.subsidy, Math.max(0, SIGNAL_REPAIR_BUDGET - coins))
    assert.deepEqual(reportMunicipalSignal(s).civic, s.civic)
    assert.equal(reportMunicipalSignal(s).life.city.coins, s.life.city.coins)
    assert.equal(municipalRepairDone(s), false)
    assert.equal(municipalRepairDone({ ...s, life: { ...s.life, hour: s.life.hour + 2 } }), true)
    assert.deepEqual(
      decodeCityLife(JSON.parse(JSON.stringify(s)))?.civic?.projects,
      s.civic?.projects,
    )
  }
})
