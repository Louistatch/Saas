import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type CollisionBody, bodiesOverlap } from '../lib/haroolife/city/collisions'
import { signalPhase, vehicleAtRed } from '../lib/haroolife/city/pedestrians'
import { PlayerController } from '../lib/haroolife/city/player'

/** A straight avenue along z (x = 0), from z = 0 to z = 40. */
const avenue = (x: number, z: number) => x === 0 && z >= 0 && z <= 40
/** Three parallel streets: a detour around a queue always exists. */
const grid = (x: number, z: number) => x >= 0 && x <= 2 && z >= 0 && z <= 40

function driving(obstacle: CollisionBody, road = avenue) {
  const c = new PlayerController({ walkable: road, drivable: road }, { x: 0, y: 0 })
  c.vehicle = { x: 0, z: 0, heading: 0, speed: 0 }
  assert.ok(c.enterVehicle())
  c.obstacles = [obstacle]
  const route = Array.from({ length: 30 }, (_, i) => ({ x: 0, z: i + 1 }))
  assert.ok(c.driveAutomatically(route))
  return c
}
const body = (c: PlayerController) => {
  const s = c.shownVehicle
  assert.ok(s)
  return { x: s.x, z: s.z, heading: s.heading, ...c.vehicleDimensions }
}

test('le taxi suit une voiture arrêtée : il freine progressivement et ne la touche jamais', () => {
  // A car stopped in the same lane, eight cells ahead.
  const stopped = { x: 0.25, z: 8, heading: 0, halfWidth: 0.2, halfLength: 0.54 }
  const c = driving(stopped)
  let previous = 0
  let hardest = 0
  for (let i = 0; i < 8 * 60; i++) {
    c.update(1 / 60)
    const v = c.vehicle
    assert.ok(v)
    assert.equal(bodiesOverlap(body(c), stopped), false, 'no contact')
    hardest = Math.max(hardest, previous - v.speed)
    previous = v.speed
  }
  const v = c.vehicle
  assert.ok(v)
  assert.equal(v.speed, 0, 'stopped behind it')
  // Braking stays within what the brakes can do in one frame (no slamming from 3 to 0).
  assert.ok(hardest <= (c.config.vehicle.brake + 0.5) / 60, `deceleration ${hardest * 60}`)
})

test('dans une file au feu, le taxi attend sans chercher un détour', () => {
  const stopped = { x: 0.25, z: 3, heading: 0, halfWidth: 0.2, halfLength: 0.54 }
  const c = driving(stopped, grid)
  for (let i = 0; i < 2 * 60; i++) c.update(1 / 60)
  const route = () => JSON.stringify((c as unknown as { drivingRoute: unknown }).drivingRoute)
  const before = route()
  for (let i = 0; i < 12 * 60; i++) c.update(1 / 60)
  assert.equal(route(), before, 'same route: it waits in the queue')
})

test('au feu rouge, un véhicule s’arrête avant les bandes, ou dégage s’il est déjà dessus', () => {
  // A junction at (5, 5) on a cross of roads; the vehicle drives east (heading 90).
  const road = (x: number, z: number) => z === 5 || x === 5
  const red = Array.from({ length: 20 }, (_, s) => s).find((s) => signalPhase(s).x === 'red')
  assert.ok(red !== undefined)
  // Front bumper still before the zebra (0.56–0.92 from the junction centre): stop.
  assert.equal(vehicleAtRed({ x: 3.7, z: 5 }, 90, road, red, true), true)
  // Front bumper already on the zebra when the light turns: clear the junction.
  assert.equal(vehicleAtRed({ x: 4.0, z: 5 }, 90, road, red, true), false)
  // A moto is shorter: at the same place its front is still before the zebra.
  assert.equal(vehicleAtRed({ x: 3.9, z: 5 }, 90, road, red, true, 0.13), true)
})
