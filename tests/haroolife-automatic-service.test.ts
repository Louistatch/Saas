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

test('a service stop starts at the door when the queue at the light holds the taxi short of it', () => {
  const controller = new PlayerController({ walkable: road, drivable: road }, { x: 0, y: 0 })
  controller.vehicle = { x: 0, z: 0, heading: 90, speed: 0 }
  assert.ok(controller.enterVehicle())
  controller.vehicleDimensions = { halfWidth: 0.205, halfLength: 0.54 }
  // A car waits at the light just past the garage, in the same lane: the taxi stops behind it,
  // a third of a cell before the door (in CI the taxi stood 0.4 cell short for 30 s).
  controller.obstacles = [{ x: 26.85, z: -0.3, heading: 90, halfWidth: 0.2, halfLength: 0.54 }]
  const stops = [{ service: 'garage' as const, name: 'Garage', x: 26, y: 0 }]
  const service = new AutomaticDrivingService(controller, {
    drivable: road,
    places: () => places,
    random: () => 0,
    nextStop: () => stops.shift() ?? null,
  })
  service.start('taxi')
  service.offer({ name: 'Abla', x: 4, y: 0 })
  let seconds = 0
  let pitstop: number | null = null
  let serviced: number | null = null
  while (seconds < 120 && serviced === null) {
    controller.update(1 / 60)
    seconds += 1 / 60
    if (service.update(1 / 60).some((e) => e.type === 'serviced')) serviced = seconds
    if (pitstop === null && service.snapshot().phase === 'pitstop') pitstop = seconds
  }
  const vehicle = controller.vehicle
  assert.ok(vehicle && pitstop !== null && serviced !== null, 'the garage service happens')
  // Driving six cells and the 4 s service, without waiting out the queue first.
  assert.ok(serviced - pitstop < 12, `serviced ${(serviced - pitstop).toFixed(1)} s after leaving`)
  assert.ok(Math.abs(vehicle.x - 26) < 0.5, `in front of the garage (x = ${vehicle.x.toFixed(2)})`)
})

test('a van stopped right behind the taxi does not hold it before a junction', () => {
  // Captured in the browser: heading west 0.45 cell before a junction, then south. The van
  // behind waits for the taxi, 0.01 cell from its body; two people stand at the corner.
  const cross = (x: number, y: number) =>
    (y === 10 && x >= 0 && x <= 20) || (x === 12 && y >= 0 && y <= 20)
  const controller = new PlayerController({ walkable: cross, drivable: cross }, { x: 12, y: 10 })
  controller.vehicle = { x: 12.45, z: 10, heading: 266.5, speed: 0 }
  assert.ok(controller.enterVehicle())
  controller.vehicleDimensions = { halfWidth: 0.205, halfLength: 0.54 }
  assert.ok(
    controller.driveAutomatically([
      { x: 12, z: 10 },
      { x: 12, z: 11 },
      { x: 12, z: 12 },
    ]),
  )
  controller.obstacles = [
    { x: 13.54, z: 10.3, heading: 270, halfWidth: 0.2, halfLength: 0.54 },
    { x: 12.62, z: 9.38, heading: 0, halfWidth: 0.07, halfLength: 0.07 },
    { x: 12.25, z: 9.38, heading: 0, halfWidth: 0.07, halfLength: 0.07 },
  ]
  for (let i = 0; i < 15 * 60 && controller.drivingRouteState !== 'arrived'; i++)
    controller.update(1 / 60)
  const vehicle = controller.vehicle
  assert.ok(vehicle)
  assert.equal(controller.drivingRouteState, 'arrived', `held at ${vehicle.x}, ${vehicle.z}`)
  assert.deepEqual({ x: vehicle.x, z: vehicle.z }, { x: 12, z: 12 })
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
