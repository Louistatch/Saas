import assert from 'node:assert/strict'
import { test } from 'node:test'
import { serviceVehicleSpot } from '../lib/haroolife/city/jobs'

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
