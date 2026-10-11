import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canBuild,
  capacity,
  count,
  decodeCity,
  goal,
  initialCity,
  place,
  removeBuilding,
  roadNetwork,
  terrainAt,
  tick,
  within,
} from '../lib/haroolife/townsmen-engine'

test('map terrain is deterministic with finite grid and initial connected town', () => {
  const a = initialCity(),
    b = initialCity()
  assert.deepEqual(a, b)
  assert.equal(capacity(a), 12)
  assert.ok(roadNetwork(a.buildings).size > 0)
  assert.equal(within(22, 5), false)
  assert.equal(terrainAt(2, 20), 'water')
})
test('buildings cannot overlap, float on water or bypass real connected roads', () => {
  const city = initialCity()
  assert.match(canBuild(city, 11, 10, 'house') ?? '', /occupée/)
  assert.match(canBuild(city, 2, 20, 'house') ?? '', /eau/)
  assert.match(canBuild(city, 0, 0, 'house') ?? '', /route/)
  const valid = place(city, 12, 11, 'farm')
  assert.equal(valid.error, null)
  assert.equal(count(valid.city, 'farm'), 1)
  assert.equal(valid.city.coins, city.coins - 150)
  assert.equal(city.buildings.length + 1, valid.city.buildings.length)
  assert.match(place(valid.city, 12, 11, 'farm').error ?? '', /occupée/)
})
test('production chain is conditional, with worker restrictions and resource conservation', () => {
  let city = initialCity()
  const first = tick(city)
  assert.equal(first.maize, 0)
  assert.equal(first.flour, 0)
  assert.ok(first.food < city.food)
  const farm = place(city, 12, 11, 'farm')
  assert.equal(farm.error, null)
  city = farm.city
  city = tick(city)
  assert.ok(city.maize > 0)
  assert.equal(city.flour, 0)
  assert.equal(city.day, 2)
  assert.ok(city.happiness >= 5 && city.happiness <= 100)
})
test('population declines without food, and resources never become negative', () => {
  let city = { ...initialCity(), food: 0 }
  for (let i = 0; i < 20; i++) city = tick(city)
  assert.ok(city.population < 10)
  assert.ok(city.food >= 0)
  assert.ok(city.wood >= 0)
  assert.ok(city.coins >= 0)
  assert.equal(city.day, 21)
})
test('demolition protects city hall and prevents ghost houses', () => {
  const initial = initialCity()
  assert.match(removeBuilding(initial, 11, 10).error ?? '', /mairie/)
  const next = removeBuilding(initial, 9, 9).city
  assert.equal(count(next, 'house'), 1)
  assert.equal(capacity(next), 6)
  assert.equal(next.population, 6)
  assert.equal(count(initial, 'house'), 2)
})
test('save decoding fails closed on damaged or malicious saved games', () => {
  const city = initialCity()
  assert.deepEqual(decodeCity(JSON.parse(JSON.stringify(city))), city)
  assert.equal(decodeCity({ ...city, version: 2 }), null)
  assert.equal(decodeCity({ ...city, coins: -5 }), null)
  assert.equal(decodeCity({ ...city, buildings: [] }), null)
  assert.equal(decodeCity({ ...city, buildings: [...city.buildings, city.buildings[0]] }), null)
  assert.equal(goal(city).total, 5)
})
