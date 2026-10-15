import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_CONFIG,
  FOLLOW_DISTANCE,
  MAP_DISTANCE,
  PlayerController,
  type WorldQuery,
  angleDelta,
  cameraBasis,
  cameraPitch,
  joystickVector,
} from '../lib/haroolife/city/player'

/** A 20×20 world: a horizontal road on row 10, a vertical road on column 10, grass around,
 * a wall of blocked cells on column 15 and a water strip on row 18. */
const world: WorldQuery = {
  walkable: (x, y) => x >= 0 && y >= 0 && x < 20 && y < 20 && x !== 15 && y !== 18,
  drivable: (x, y) => (y === 10 && x >= 0 && x < 20) || (x === 10 && y >= 0 && y < 20),
}
const make = (x = 10, y = 10) => new PlayerController(world, { x, y }, { angle: 0 })
const hold = (
  p: PlayerController,
  x: number,
  y: number,
  seconds: number,
  run = false,
  dt = 1 / 60,
) => {
  p.input = { x, y, run }
  for (let t = 0; t < seconds; t += dt) p.update(dt)
}

describe('joystick vector', () => {
  it('applies a dead zone and clamps to the unit circle', () => {
    assert.deepEqual(joystickVector(2, 0, 48), { x: 0, y: 0, magnitude: 0 })
    const v = joystickVector(100, -100, 48)
    assert.ok(Math.hypot(v.x, v.y) <= 1.0001)
    assert.equal(v.magnitude, 1)
    assert.ok(v.x > 0 && v.y > 0, 'up-right on screen is forward-right')
  })
  it('keeps diagonals proportional', () => {
    const v = joystickVector(24, -24, 48)
    assert.ok(Math.abs(v.x - v.y) < 1e-9)
    assert.ok(v.magnitude > 0.5 && v.magnitude < 1)
  })
})

describe('angles and camera basis', () => {
  it('finds the shortest turn', () => {
    assert.equal(angleDelta(350, 10), 20)
    assert.equal(angleDelta(10, 350), -20)
  })
  it('forward is away from the camera', () => {
    const b = cameraBasis(0)
    assert.ok(Math.abs(b.forward.z + 1) < 1e-9 && Math.abs(b.right.x - 1) < 1e-9)
  })
  it('pitch flattens when close', () => {
    assert.ok(cameraPitch(9) > cameraPitch(28))
  })
  it('the game camera follows from about 40° above, the map from much higher', () => {
    assert.equal(cameraPitch(FOLLOW_DISTANCE), -40)
    assert.ok(MAP_DISTANCE > FOLLOW_DISTANCE * 5)
    const p = new PlayerController({ walkable: () => true, drivable: () => false }, { x: 0, y: 0 })
    assert.equal(p.camera.distance, FOLLOW_DISTANCE)
  })
})

describe('walking', () => {
  it('moves continuously, speed independent of the frame rate', () => {
    const slow = make()
    hold(slow, 0, 0.7, 2, false, 1 / 20)
    const fast = make()
    hold(fast, 0, 0.7, 2, false, 1 / 120)
    // 0.7 stick = 0.63 cells/s at the V3 walk speed (0.9 cells/s, matched to the stride).
    assert.ok(slow.pos.z < 10 - 1, `walked ${10 - slow.pos.z} cells`)
    assert.ok(
      Math.abs(slow.pos.z - fast.pos.z) < 0.15,
      `20 Hz ${slow.pos.z} vs 120 Hz ${fast.pos.z}`,
    )
    assert.equal(slow.mode, 'walk')
  })
  it('runs with the run flag or a full stick, and stops without sliding', () => {
    const p = make()
    hold(p, 0, 1, 1, true)
    assert.equal(p.mode, 'run')
    const z = p.pos.z
    hold(p, 0, 0, 0.3)
    assert.equal(p.mode, 'idle')
    assert.equal(p.speed, 0)
    assert.ok(z - p.pos.z < 0.6, 'braking distance stays short')
  })
  it('turns the body towards the motion', () => {
    const p = make()
    hold(p, 1, 0, 0.5)
    assert.ok(Math.abs(angleDelta(p.heading, 90)) < 2, `heading ${p.heading}`)
    hold(p, 0, -1, 0.5)
    assert.ok(Math.abs(angleDelta(p.heading, 0)) < 2, `heading ${p.heading}`)
  })
  it('slides along a wall instead of crossing it', () => {
    const p = make(14, 10)
    hold(p, 1, 1, 2)
    assert.ok(p.pos.x < 14.5, `stays west of the wall: ${p.pos.x}`)
    assert.ok(p.pos.z < 9, 'keeps moving along the wall')
    p.drain()
    hold(p, 1, 0, 1) // straight into the wall: fully stuck
    assert.ok(p.drain().some((e) => e.type === 'blocked'))
  })
  it('never enters the water', () => {
    const p = make(5, 17)
    hold(p, 0, -1, 2)
    assert.ok(p.pos.z < 17.5)
  })
  it('reports cell changes once per cell', () => {
    const p = make()
    hold(p, 0, 1, 1.2)
    const cells = p.drain().filter((e) => e.type === 'cell')
    assert.ok(cells.length >= 2)
    const keys = new Set(
      cells.map((e) => `${e.type === 'cell' && e.x}:${e.type === 'cell' && e.y}`),
    )
    assert.equal(keys.size, cells.length)
  })
  it('follows a route when the stick is idle and the stick cancels the route', () => {
    const p = make()
    p.route = [
      { x: 10, z: 9 },
      { x: 10, z: 8 },
    ]
    hold(p, 0, 0, 1.5)
    assert.equal(p.route.length, 0)
    assert.ok(Math.abs(p.pos.z - 8) < 0.01)
    assert.ok(p.drain().filter((e) => e.type === 'reached').length === 2)
    p.route = [{ x: 10, z: 7 }]
    hold(p, 1, 0, 0.1)
    assert.equal(p.route.length, 0)
  })
  it('does not move while inside a building', () => {
    const p = make()
    p.setInside(true)
    hold(p, 0, 1, 1)
    assert.deepEqual(p.pos, { x: 10, z: 10 })
    p.setInside(false)
    p.teleport({ x: 3, y: 3 })
    assert.deepEqual(p.cell, { x: 3, y: 3 })
  })
})

describe('vehicle', () => {
  it('enters only within reach, drives on roads, brakes and leaves on the kerb', () => {
    const p = make(10, 10)
    p.vehicle = { x: 14, z: 10, heading: 90, speed: 0 }
    assert.equal(p.enterVehicle(), false)
    hold(p, 1, 0, 1.6)
    assert.ok(p.canEnterVehicle(), `at ${p.pos.x}`)
    assert.ok(p.enterVehicle())
    assert.equal(p.mode, 'drive')
    // Reverse back west along the road at full throttle.
    hold(p, 0, -1, 2)
    assert.ok(p.vehicle.x < 13, `reversed to ${p.vehicle.x}`)
    hold(p, 0, 1, 2)
    assert.ok(p.vehicle.speed > 3)
    assert.equal(p.canExitVehicle(), false)
    hold(p, 0, -1, 0.8) // brake
    hold(p, 0, 0, 1.5)
    assert.equal(p.vehicle.speed, 0)
    assert.ok(p.canExitVehicle())
    assert.ok(p.exitVehicle())
    assert.equal(p.mode, 'idle')
    assert.equal(p.driving, false)
    assert.ok(
      Math.abs(p.pos.z - p.vehicle.z) > 0.5 || Math.abs(p.pos.x - p.vehicle.x) > 0.5,
      'steps out beside the car',
    )
  })
  it('stops at the edge of the road instead of leaving it', () => {
    const p = make(10, 10)
    p.vehicle = { x: 10, z: 10, heading: 0, speed: 0 }
    assert.ok(p.enterVehicle())
    hold(p, 0, 1, 4) // south along column 10 until the world ends
    assert.ok(p.vehicle.z <= 19.5)
    assert.ok(p.vehicle.speed === 0)
  })
  it('steers while moving', () => {
    const p = make(10, 10)
    p.vehicle = { x: 10, z: 5, heading: 0, speed: 0 }
    // Walk to the car (simulated time: 3.2 cells at the V3 walk speed).
    hold(p, 0, 0.7, 6)
    assert.ok(p.enterVehicle())
    hold(p, 0.6, 1, 0.8)
    assert.ok(Math.abs(angleDelta(0, p.vehicle.heading)) > 5)
  })
})

describe('camera rig', () => {
  it('follows the player smoothly and stops following when released', () => {
    const p = make()
    hold(p, 0, 1, 1)
    assert.ok(p.camera.tz < 10 && p.camera.tz > p.pos.z - 0.5)
    p.camera.follow = false
    const tz = p.camera.tz
    hold(p, 0, 1, 0.5)
    assert.equal(p.camera.tz, tz)
  })
  it('keeps the default config sane', () => {
    assert.ok(DEFAULT_CONFIG.runSpeed > DEFAULT_CONFIG.walkSpeed)
  })
})

describe('quality governor', () => {
  it('steps down after three slow checks and back up after a fast minute, within the ceiling', async () => {
    const { QualityGovernor } = await import('../lib/haroolife/city/quality')
    const g = new QualityGovernor('high')
    assert.equal(g.sample(20, 'high'), null)
    assert.equal(g.sample(20, 'high'), null)
    assert.equal(g.sample(20, 'high'), 'balanced')
    // Right after a step down, fast frames do not climb for a minute.
    for (let i = 0; i < 19; i++) assert.equal(g.sample(60, 'balanced'), null)
    let up: string | null = null
    for (let i = 0; i < 40 && !up; i++) up = g.sample(60, 'balanced')
    assert.equal(up, 'high')
    const capped = new QualityGovernor('balanced')
    for (let i = 0; i < 60; i++) assert.equal(capped.sample(60, 'balanced'), null)
  })
  it('keeps the 6 FPS floor on a software renderer', async () => {
    const { QualityGovernor } = await import('../lib/haroolife/city/quality')
    const g = new QualityGovernor('eco', true)
    for (let i = 0; i < 5; i++) assert.equal(g.sample(10, 'balanced'), null)
  })
})
