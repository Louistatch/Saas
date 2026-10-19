import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  RIDE_MAX_SPEED,
  remoteAnim,
  remoteVehicle,
  ridePose,
  vehicleMode,
} from '../lib/haroolife/realtime/interpolate'

test('the pose mode names the vehicle, within the 12 characters the relay forwards', () => {
  for (const role of ['drive', 'ride'] as const)
    for (const v of ['taxi', 'moto', 'bus', 'ems'] as const) {
      const mode = vehicleMode(role, v)
      assert.ok(mode.length <= 12, mode)
      assert.deepEqual(remoteVehicle(mode), { role, vehicle: v })
      assert.equal(remoteAnim(mode), 'drive')
    }
  // On foot, and the bare « drive » of an older client: no vehicle is invented.
  for (const mode of ['walk', 'run', 'idle', 'travel', 'drive', 'drive:avion', 'ride:'])
    assert.equal(remoteVehicle(mode), null, mode)
  assert.equal(remoteAnim('walk'), 'walk')
  assert.equal(remoteAnim('travel'), 'idle')
})

test('a ride moves along the streets of its route and lands on time', () => {
  const start = { x: 0, y: 0 }
  // Two cells east, then three north.
  const route = [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
    { x: 2, y: 3 },
  ]
  assert.deepEqual(ridePose(start, route, 0, 5), { x: 0, z: 0, heading: 90 })
  // 5 cells in 5 s: after 1 s, one cell east, facing east (+x is 90° in the game).
  const a = ridePose(start, route, 1, 5)
  assert.equal(a.x, 1)
  assert.equal(a.z, 0)
  assert.equal(a.heading, 90)
  // After 3 s, on the northbound leg, facing north (+z is 0°).
  const b = ridePose(start, route, 3, 5)
  assert.deepEqual([b.x, b.z, b.heading], [2, 1, 0])
  // Done (and after): at the destination, never beyond.
  assert.deepEqual(ridePose(start, route, 9, 5), { x: 2, z: 3, heading: 0 })
})

test('a long ride is shown under the relay speed limit, never as a teleport', () => {
  const route = Array.from({ length: 200 }, (_, i) => ({ x: i + 1, y: 0 }))
  const p = ridePose({ x: 0, y: 0 }, route, 1, 10)
  assert.ok(p.x <= RIDE_MAX_SPEED && RIDE_MAX_SPEED < 14, String(p.x))
  // A ride with no route stays where it is.
  assert.deepEqual(ridePose({ x: 4, y: 5 }, [], 2, 5), { x: 4, z: 5, heading: 0 })
})
