import assert from 'node:assert/strict'
import { test } from 'node:test'
import { serviceVehiclePlacement, serviceVehicleSpot } from '../lib/haroolife/city/jobs'
import { decodeCityLife, initialCityLife } from '../lib/haroolife/city/life'

test('a service vehicle is placed on the closest drivable street', () => {
  const streets = new Set(['8:10', '10:12', '12:10'])
  const spot = serviceVehicleSpot({ x: 10.2, z: 10.1 }, (x, z) => streets.has(`${x}:${z}`))
  assert.deepEqual(spot, { x: 12, z: 10 })
})

test('vehicle placement reports when no road exists in reach', () => {
  assert.equal(
    serviceVehicleSpot({ x: 10, z: 10 }, () => false, 2),
    null,
  )
})

test('the service vehicle and driver stop on distinct adjacent cells', () => {
  const streets = new Set(['10:10', '11:10', '12:10', '13:10'])
  const placement = serviceVehiclePlacement({ x: 10, z: 10 }, (x, z) => streets.has(`${x}:${z}`), 4)
  assert.ok(placement)
  assert.notDeepEqual(placement.vehicle, { x: 10, z: 10 })
  assert.equal(
    Math.abs(placement.vehicle.x - placement.approach.x) +
      Math.abs(placement.vehicle.z - placement.approach.z),
    1,
  )
})

test('loading an overlapping legacy service vehicle repairs it and preserves progress', () => {
  const save = initialCityLife()
  save.duty = 'moto'
  save.vehicle = { x: save.at.x, z: save.at.y, heading: 90 }
  save.life.wallet = 100
  save.life.hour = 21
  const restored = decodeCityLife(save)
  assert.ok(restored)
  assert.ok(restored.vehicle)
  assert.ok(
    Math.hypot(restored.vehicle.x - restored.at.x, restored.vehicle.z - restored.at.y) >= 0.75,
  )
  assert.equal(restored.vehicleLocality, 'lome')
  assert.equal(restored.life.wallet, 100)
  assert.equal(restored.life.hour, 21)
  assert.deepEqual(restored.life.city.buildings, save.life.city.buildings)
  assert.deepEqual(decodeCityLife(restored), restored, 'reloading is idempotent')
})

test('an old active service in Kara gets a local vehicle and retains its wallet', () => {
  const save = initialCityLife()
  save.locality = 'kara'
  save.at = { x: 72, y: 45 }
  save.duty = 'moto'
  save.vehicle = { x: 48, z: 37, heading: 0 }
  const restored = decodeCityLife(save)
  assert.ok(restored)
  assert.equal(restored.vehicleLocality, 'kara')
  assert.ok(restored.vehicle && Math.hypot(restored.vehicle.x - 72, restored.vehicle.z - 45) < 8)
  assert.equal(restored.life.wallet, save.life.wallet)
  // Reset the module's active locality for independent callers.
  decodeCityLife(initialCityLife())
})
