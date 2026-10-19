import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutFor } from '../lib/haroolife/city/interiors'
import {
  decodeCityLife,
  enterLot,
  finishGuidedWalk,
  freelyWalkable,
  goToLot,
  initialCityLife,
  interiorFor,
  moveTo,
  roadsOf,
} from '../lib/haroolife/city/life'
import { LOCALITY_IDS, setLocality } from '../lib/haroolife/city/locality'
import {
  PavementGraph,
  PedestrianWatch,
  crossingAt,
  guidedCellRoute,
  mayCross,
  onCarriageway,
  onPavement,
  pickupRoad,
  signalPhase,
  vehicleAtRed,
} from '../lib/haroolife/city/pedestrians'
import { PlayerController } from '../lib/haroolife/city/player'
import {
  municipalRepairDone,
  pedestrianTicket,
  reportMunicipalSignal,
} from '../lib/haroolife/city/street-civic'
import {
  WORLD_H,
  WORLD_W,
  isCityRoad,
  isDriveway,
  landmarks,
  worldLots,
} from '../lib/haroolife/city/world'
import { rendererForInterior } from '../lib/haroolife/engine/select'
import { pathfind } from '../lib/haroolife/game/core/pathfind'
import { sceneFor } from '../lib/haroolife/game/core/scene'
const road = (x: number, z: number) => x >= 0 && z >= 0 && x < 11 && z < 11 && (x === 5 || z === 5)

test('a straight pavement route has no backward step at a cell seam', () => {
  const graph = new PavementGraph(road, 11, 11)
  const path = graph.route({ x: 4.38, z: 1 }, { x: 4.38, z: 9 })
  assert.ok(path)
  for (let i = 1; i < path.length; i++) assert.ok(path[i].z >= path[i - 1].z)
})

test('the adult capsule passes a car from the pavement but still stops at its body', () => {
  const c = new PlayerController(
    { walkable: road, drivable: road, pavement: (x, z) => onPavement({ x, z }, road) },
    { x: 3, y: 4 },
  )
  c.obstacles = [{ x: 5, z: 4.7, heading: 90, halfWidth: 0.2, halfLength: 0.54 }]
  c.pos = { x: 3.7, z: 4.38 }
  c.route = [{ x: 6.3, z: 4.38 }]
  for (let i = 0; i < 240; i++) c.update(1 / 60)
  assert.equal(c.route.length, 0, 'a taxi must not trap a walker on the pavement')
  c.pos = { x: 3.7, z: 4.7 }
  c.route = [{ x: 6.3, z: 4.7 }]
  for (let i = 0; i < 240; i++) c.update(1 / 60)
  assert.ok(c.pos.x < 4.46, 'the avatar cannot pass through the car')
})

test('drivers pick waiting people up on the road while keeping clear of the pavement', () => {
  assert.deepEqual(pickupRoad({ x: 5.62, z: 2 }, road), { x: 5, z: 2 })
  assert.equal(pickupRoad({ x: 1, z: 1 }, road), null)
  const straight = (x: number, z: number) => z === 0 && x >= 0 && x <= 24
  const c = new PlayerController({ walkable: straight, drivable: straight }, { x: 0, y: 0 })
  c.vehicle = { x: 0, z: 0, heading: 90, speed: 0 }
  c.enterVehicle()
  c.obstacles = Array.from({ length: 20 }, (_, i) => ({
    x: i + 2,
    z: -0.62,
    heading: 0,
    halfWidth: 0.07,
    halfLength: 0.07,
  }))
  c.driveAutomatically(Array.from({ length: 20 }, (_, i) => ({ x: i + 1, z: 0 })))
  for (let i = 0; i < 60 * 15; i++) c.update(1 / 60)
  assert.equal(
    c.drivingRouteState,
    'arrived',
    'ordinary sidewalk pedestrians must not send the taxi into an endless detour',
  )
})

test('guided walking connects pavements through the painted zebras, never the middle of a junction', () => {
  const graph = new PavementGraph(road, 11, 11)
  const path = graph.route({ x: 4.38, z: 2 }, { x: 5.62, z: 8 })
  assert.ok(path && path.length > 3)
  let crossings = 0
  for (let n = 1; n < path.length; n++) {
    const a = path[n - 1]
    const b = path[n]
    for (let i = 0; i <= 20; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / 20, z: a.z + ((b.z - a.z) * i) / 20 }
      if (onCarriageway(p, road)) {
        assert.ok(crossingAt(p, road), `unsafe segment at ${JSON.stringify(p)}`)
        crossings++
      } else assert.ok(onPavement(p, road))
    }
  }
  assert.ok(crossings > 0)
})
test('the player waits at red, crosses on green and reaches the opposite pavement', () => {
  const c = new PlayerController(
    { walkable: road, drivable: road, pavement: (x, z) => onPavement({ x, z }, road) },
    { x: 6, y: 4 },
  )
  c.pavements = new PavementGraph(road, 11, 11)
  c.repairedSignals = true
  c.pos = { x: 5.62, z: 4.38 }
  c.route = [{ x: 5.62, z: 5.62 }]
  for (let i = 0; i < 120; i++) c.update(1 / 60)
  assert.equal(c.waitingForSignal, true)
  assert.ok(c.pos.z <= 4.5)
  c.streetSeconds = 15
  for (let i = 0; i < 180; i++) c.update(1 / 60)
  assert.ok(Math.hypot(c.pos.x - 5.62, c.pos.z - 5.62) < 0.1)
  assert.equal(c.route.length, 0)
  assert.equal(c.policeStopped, false)
})
test('signals separate car directions and the pedestrian phase; blinking amber is not a red-light offence', () => {
  assert.equal(signalPhase(2).x, 'green')
  assert.equal(signalPhase(9).z, 'green')
  assert.equal(signalPhase(16).pedestrian, true)
  assert.equal(vehicleAtRed({ x: 3.8, z: 5 }, 90, road, 16, true), true)
  assert.equal(vehicleAtRed({ x: 3.8, z: 5 }, 90, road, 2, true), false)
  assert.equal(mayCross({ x: 5.62, z: 5 }, road, 2, true), false)
  assert.equal(mayCross({ x: 5.62, z: 5 }, road, 16, true), true)
})
test('manual jaywalking causes one stop per excursion with a grace period and cooldown', () => {
  const watch = new PedestrianWatch()
  let count = 0
  for (let n = 0; n < 3000; n++)
    if (watch.step(1 / 60, { x: 5, z: 2 }, true, road, n / 60, true)) count++
  assert.equal(count, 1)
  for (let n = 0; n < 1800; n++) watch.step(1 / 60, { x: 5.62, z: 2 }, true, road, 0, true)
  let next = null
  for (let n = 0; n < 100; n++) next ??= watch.step(1 / 60, { x: 5, z: 2 }, true, road, 0, true)
  assert.equal(next, 'outside-crossing')
  watch.reset()
  assert.equal(
    watch.step(0.2, { x: 5, z: 2 }, true, road, 0, true),
    null,
    'spawns and vehicle exits get time to step onto the kerb',
  )
})
test('the city driveway cannot invalidate the estate cursor or erase a saved wallet', () => {
  const s = initialCityLife()
  s.life.wallet = 12345
  const next = moveTo(s, { x: 49, y: 34 }, undefined, true)
  assert.deepEqual(next.life.pos, s.life.pos)
  assert.equal(decodeCityLife(JSON.parse(JSON.stringify(next)))?.life.wallet, 12345)
  const old = JSON.parse(JSON.stringify(next))
  old.life.pos = { x: 0, y: 12 }
  assert.equal(
    decodeCityLife(old)?.life.wallet,
    12345,
    'recover older driveway saves without changing their balance',
  )
  old.life.wallet = -1
  assert.equal(decodeCityLife(old), null, 'the migration cannot bypass balance validation')
})

test('a pavement pose keeps a road anchor for the next trip and survives reload at the same position', () => {
  setLocality('lome')
  const s = initialCityLife()
  const roads = roadsOf(s)
  const road = (x: number, z: number) => isCityRoad(x, z) || isDriveway(x, z)
  const c = new PlayerController(
    { walkable: (x, z) => freelyWalkable(x, z, roads, s.life.city.buildings), drivable: road },
    s.at,
  )
  c.pavements = new PavementGraph(road, WORLD_W, WORLD_H)
  c.pos = { x: 47.38, z: 33.38 }
  assert.ok(road(c.cell.x, c.cell.y))
  const state = { ...s, at: c.cell, pose: { ...c.pos, heading: c.heading } }
  assert.deepEqual(decodeCityLife(JSON.parse(JSON.stringify(state)))?.pose, state.pose)
  const place = landmarks().find((l) => l.type === 'market')
  assert.ok(place)
  assert.ok(goToLot(state, place).route.length > 0)
})

test('the last steps into a private estate are retained even close to a city pavement', () => {
  const graph = new PavementGraph(road, 11, 11)
  const path = guidedCellRoute(graph, { x: 5, z: 2 }, [
    { x: 5, z: 3 },
    { x: 6, z: 3 },
  ])
  assert.ok(path)
  assert.deepEqual(path.at(-1), { x: 6, z: 3 })
})

test('guided movement preserves the chosen estate door and arrival clears the route without a reward', () => {
  const s = initialCityLife()
  const house = s.life.city.buildings.find((b) => b.type === 'house')
  assert.ok(house)
  s.life.target = { x: house.x, y: house.y }
  s.route = [{ x: 58, y: 34 }]
  const moved = moveTo(s, { x: 58, y: 34 }, undefined, true)
  assert.deepEqual(moved.life.target, s.life.target)
  assert.equal(moved.route, s.route, 'the continuous route must not restart at each cell')
  const arrived = finishGuidedWalk(moved)
  assert.equal(arrived.route.length, 0)
  assert.deepEqual(arrived.life.target, s.life.target)
  assert.equal(arrived.life.wallet, s.life.wallet)
  assert.match(arrived.life.lastEvent, /arrivé/)
  // At home, the next step is the door, not a bubble (there is none outside).
  assert.equal(arrived.life.lastEvent, 'Tu es arrivé devant ta maison. Appuie sur Entrer.')
})

test('fictional fines warn first, reconcile the wallet and survive reload without creating debt', () => {
  let s = initialCityLife()
  s.life.wallet = 1200
  s = pedestrianTicket(s, 'outside-crossing')
  assert.equal(s.life.wallet, 1200)
  s = pedestrianTicket(s, 'red-light')
  assert.equal(s.life.wallet, 700)
  assert.equal(s.civic?.paid, 500)
  assert.equal(decodeCityLife(JSON.parse(JSON.stringify(s)))?.civic?.paid, 500)
  const poor = pedestrianTicket({ ...s, life: { ...s.life, wallet: 100 } }, 'red-light')
  assert.equal(poor.life.wallet, 100)
  assert.equal(poor.civic?.fines, 1)
})
test('a municipal report is local, free, idempotent and repairs signals after two game hours', () => {
  setLocality('lome')
  const lot = landmarks().find((l) => l.type === 'townhall')!
  const base = initialCityLife()
  assert.equal(reportMunicipalSignal(base), base, 'must actually be in a town hall')
  const s = reportMunicipalSignal(enterLot(base, lot))
  assert.equal(s.life.wallet, base.life.wallet)
  assert.equal(municipalRepairDone(s), false)
  assert.deepEqual(reportMunicipalSignal(s).civic, s.civic)
  assert.equal(municipalRepairDone({ ...s, life: { ...s.life, hour: s.life.hour + 2 } }), true)
  assert.equal(
    municipalRepairDone({ ...s, locality: 'kara', life: { ...s.life, hour: s.life.hour + 2 } }),
    false,
  )
})
for (const locality of LOCALITY_IDS)
  test(`${locality}: every interior has the same controller, reachable action and conversation bubbles`, () => {
    setLocality(locality)
    const graph = new PavementGraph(
      (x, z) => isCityRoad(x, z) || isDriveway(x, z),
      WORLD_W,
      WORLD_H,
    )
    assert.ok(graph.nodes.length > 0)
    const places = landmarks()
    const from = { x: places[0].door.x, z: places[0].door.y }
    for (const place of places)
      assert.ok(
        graph.route(from, { x: place.door.x, z: place.door.y }),
        `${locality}: disconnected ${place.name}`,
      )
    const unique = new Map(worldLots().map((l) => [`${l.type}:${l.service ?? ''}`, l]))
    for (const lot of unique.values()) {
      const interior = interiorFor(lot.type)
      if (!interior) continue
      assert.equal(rendererForInterior('three', interior), 'haroo')
      const layout = layoutFor(interior, lot, { day: 1, hour: 8 })
      const scene = sceneFor(interior, layout)
      for (const prop of layout.props.filter((p) => p.action)) {
        const hotspot = scene.hotspots.find((h) => h.ref === prop.id)
        assert.ok(hotspot, `${locality}/${lot.type}/${prop.id}`)
        assert.ok(
          pathfind(scene.spawn, hotspot.at, scene.obstacles, scene.bounds).length > 0 ||
            Math.hypot(scene.spawn.x - hotspot.at.x, scene.spawn.z - hotspot.at.z) < 0.5,
        )
      }
      if (lot.type === 'university') {
        assert.ok(scene.hotspots.find((h) => h.ref === 'timetable'))
        assert.equal(
          scene.seats?.['seat-0-1']?.mealAllowed,
          false,
          'a meal cannot silently buy a lecture',
        )
        assert.ok(Object.values(scene.seats ?? {}).some((seat) => seat.mealAllowed))
      }
    }
    setLocality('lome')
  })
