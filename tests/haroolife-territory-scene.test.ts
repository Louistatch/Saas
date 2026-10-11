import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DISTRICT_SCENES, visualSignals } from '../lib/haroolife/territory-scene'
import { HUBS, initialTerritoryWorld, invest, advanceTerritoryDays } from '../lib/haroolife/territory-simulation'

test('every selectable real geographic hub has its own illustrative district', () => {
  for (const hub of HUBS) {
    const descriptor = DISTRICT_SCENES[hub.id]
    assert.ok(descriptor.title.length > 2)
    assert.ok(descriptor.subtitle.length > 3)
    assert.match(descriptor.terrain, /^#[0-9a-f]{6}$/i)
  }
  assert.equal(Object.keys(DISTRICT_SCENES).length, HUBS.length)
})

test('construction visuals exist only at Kpalimé, never false factories in other cities', () => {
  let world = initialTerritoryWorld()
  world = invest(world, 'factory').world
  world = invest(world, 'irrigation').world
  world = invest(world, 'solar').world
  const local = visualSignals('kpalime', world)
  assert.equal(local.canDevelop, true)
  assert.equal(local.factoryBuilt, true)
  assert.equal(local.irrigated, true)
  assert.equal(local.solarBuilt, true)
  for (const hub of HUBS.filter((value) => value.id !== 'kpalime')) {
    const other = visualSignals(hub.id, world)
    assert.equal(other.canDevelop, false)
    assert.equal(other.factoryBuilt, false)
    assert.equal(other.solarBuilt, false)
    assert.equal(other.irrigated, false)
  }
})

test('trucks and Lomé delivery cues depend on the economic simulation state', () => {
  let world = initialTerritoryWorld()
  assert.equal(visualSignals('kpalime', world).truckAvailable, false)
  assert.equal(visualSignals('lome', world).delivered, false)
  world = invest(world, 'truck').world
  assert.equal(visualSignals('kpalime', world).truckAvailable, true)
  assert.equal(visualSignals('lome', world).truckAvailable, true)
  assert.equal(visualSignals('kara', world).truckAvailable, false)
  assert.equal(visualSignals('lome', world).delivered, false)
  world = invest(world, 'factory').world
  world = advanceTerritoryDays(world, 3)
  assert.ok(world.soldKg > 0)
  assert.equal(visualSignals('lome', world).delivered, true)
})
