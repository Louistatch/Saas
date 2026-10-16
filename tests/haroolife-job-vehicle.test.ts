import assert from 'node:assert/strict'
import { test } from 'node:test'
import { serviceVehiclePlacement, serviceVehicleSpot } from '../lib/haroolife/city/jobs'

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
  const placement = serviceVehiclePlacement(
    { x: 10, z: 10 },
    (x, z) => streets.has(`${x}:${z}`),
    4,
  )
  assert.ok(placement)
  assert.notDeepEqual(placement.vehicle, { x: 10, z: 10 })
  assert.equal(
    Math.abs(placement.vehicle.x - placement.approach.x) +
      Math.abs(placement.vehicle.z - placement.approach.z),
    1,
  )
})
