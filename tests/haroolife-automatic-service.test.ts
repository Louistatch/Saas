import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { AutomaticDrivingService, type ServiceEvent } from '../lib/haroolife/city/automatic-service'
import { drivingRoute, planServiceFare } from '../lib/haroolife/city/fares'
import { PlayerController } from '../lib/haroolife/city/player'
import type { Lot } from '../lib/haroolife/city/world'
import { fitTaxiModel } from '../lib/haroolife/game/render/vehicle-scale'

const road = (x: number, y: number) =>
  x >= 0 && x <= 30 && y >= 0 && y <= 20 && (y === 0 || y === 20 || x === 0 || x === 30)
const places: Lot[] = [
  {
    id: 'market',
    type: 'market',
    district: 'test',
    x: 20,
    y: 0,
    w: 1,
    h: 1,
    floors: 1,
    name: 'Marché',
    door: { x: 20, y: 0 },
  },
]
function make() {
  const controller = new PlayerController({ walkable: road, drivable: road }, { x: 0, y: 0 })
  controller.vehicle = { x: 0, z: 0, heading: 0, speed: 0 }
  assert.ok(controller.enterVehicle())
  const service = new AutomaticDrivingService(controller, {
    drivable: road,
    places: () => places,
    random: () => 0,
  })
  service.start('moto')
  return { controller, service }
}
function run(controller: PlayerController, service: AutomaticDrivingService, seconds: number) {
  const events: ServiceEvent[] = []
  for (let i = 0; i < seconds * 60; i++) {
    controller.update(1 / 60)
    const v = controller.vehicle
    assert.ok(v)
    assert.ok(road(Math.round(v.x), Math.round(v.z)), 'the vehicle stays on roads')
    events.push(...service.update(1 / 60))
  }
  return events
}

test('autopilot follows an L-shaped route, ignores the stick and stops exactly at arrival', () => {
  const { controller } = make()
  const vehicle = controller.vehicle
  assert.ok(vehicle)
  const path = drivingRoute(vehicle, { x: 30, y: 15 }, road)
  assert.ok(path)
  assert.ok(path.length > 40)
  assert.ok(controller.driveAutomatically(path.map((p) => ({ x: p.x, z: p.y }))))
  controller.input = { x: -1, y: -1, run: true }
  for (let i = 0; i < 40 * 60; i++) {
    controller.update(1 / 60)
    assert.ok(road(Math.round(vehicle.x), Math.round(vehicle.z)))
  }
  assert.equal(controller.drivingRouteState, 'arrived')
  assert.equal(vehicle.speed, 0)
  assert.deepEqual(controller.pos, { x: 30, z: 15 })
})

test('a client is picked up, transported and paid once without player input', () => {
  const { controller, service } = make()
  service.offer({ name: 'Kossi', x: 4, y: 0 })
  const paid = run(controller, service, 30).filter((e) => e.type === 'paid')
  assert.equal(paid.length, 1)
  assert.equal(paid[0].fare.passenger, 'Kossi')
  assert.ok(paid[0].fare.price >= 200)
  assert.equal(service.snapshot().completed, 1)
  assert.equal(service.snapshot().earned, paid[0].fare.price)
  assert.equal(run(controller, service, 10).filter((e) => e.type === 'paid').length, 0)
})

test('requesting a stop finishes and pays the current fare, then leaves the vehicle', () => {
  const { controller, service } = make()
  service.offer({ name: 'Abla', x: 3, y: 0 })
  for (let i = 0; i < 1000 && service.snapshot().phase !== 'trip'; i++) {
    controller.update(1 / 60)
    service.update(1 / 60)
  }
  assert.equal(service.snapshot().phase, 'trip')
  service.requestStop()
  assert.equal(controller.driving, true)
  assert.equal(run(controller, service, 30).filter((e) => e.type === 'paid').length, 1)
  assert.equal(controller.driving, false)
  assert.equal(service.snapshot().phase, 'off')
})

test('waiting for customers, stopping early or an unreachable destination never pays money', () => {
  const { controller, service } = make()
  assert.equal(run(controller, service, 5).length, 0)
  service.offer({ name: 'Abla', x: 4, y: 0 })
  run(controller, service, 2)
  service.requestStop()
  assert.equal(run(controller, service, 30).filter((e) => e.type === 'paid').length, 0)
  assert.equal(
    planServiceFare(
      'Kossi',
      { x: 0, z: 0 },
      'taxi',
      () => 0,
      (x, y) => y === 0 && x >= 0 && x < 8,
      places,
    ),
    null,
  )
})

test('a second customer starts a new paid cycle automatically', () => {
  const { controller, service } = make()
  service.offer({ name: 'Kossi', x: 4, y: 0 })
  run(controller, service, 30)
  places[0].door = { x: 2, y: 0 }
  try {
    service.offer({ name: 'Abla', x: 18, y: 0 })
    assert.equal(run(controller, service, 30).filter((e) => e.type === 'paid').length, 1)
    assert.equal(service.snapshot().completed, 2)
  } finally {
    places[0].door = { x: 20, y: 0 }
  }
})

test('a compact taxi fits the street and is lower than the adult character', () => {
  const model = new THREE.Group()
  model.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 2.775)))
  fitTaxiModel(model, 1.15, 2)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  assert.ok(size.x < 1.2, 'room remains on both sides of a two-unit street')
  assert.ok(size.y < 1.15, 'sedan roof is below the adult head')
  assert.ok(size.z > 2.5 && size.z < 2.8)
  assert.ok(Math.abs(box.min.y) < 1e-6, 'wheels rest on the road')
  model.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose()
  })
})
