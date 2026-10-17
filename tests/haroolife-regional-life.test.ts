import { careerWorkplace, careerWorkStatus, workCareer } from '../lib/haroolife/city/careers'
import { placeScreenMarkers } from '../lib/haroolife/game/core/screen-markers'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LOCALITIES, LOCALITY_IDS, setLocality } from '../lib/haroolife/city/locality'
import {
  type CityLife,
  decodeCityLife,
  initialCityLife,
  travelTo,
  tripTo,
  freelyWalkable,
  interiorFor,
  enterLot,
  useProp,
} from '../lib/haroolife/city/life'
import {
  worldLots,
  landmarks,
  isCityRoad,
  isDriveway,
  terrainAt,
} from '../lib/haroolife/city/world'
import { findPath } from '../lib/haroolife/city/navigation'
import { SOWING } from '../lib/haroolife/city/farm'
import {
  EMPLOYERS,
  employerLot,
  startHourlyShift,
  advanceHourlyShift,
  stopHourlyShift,
} from '../lib/haroolife/city/employment'
import { takeFlight, airTrip } from '../lib/haroolife/city/aviation'
import { purchaseAndConsume } from '../lib/haroolife/city/commerce'
import { drivingRoute } from '../lib/haroolife/city/fares'
import { PlayerController } from '../lib/haroolife/city/player'
import { RoadTraffic } from '../lib/haroolife/city/road-traffic'
import { touchesBody, bodiesOverlap } from '../lib/haroolife/city/collisions'
import { FUEL_REFERENCE, GAME_FUEL_PER_LITRE } from '../lib/haroolife/city/vehicle-economy'
import { LOCALITIES as RELAY_LOCALITIES } from '../lib/haroolife/realtime/protocol'
import boundaries from '../lib/haroolife/togo/boundaries.json'

for (const id of LOCALITY_IDS)
  test(`${id}: playable region, connected services, kiosks and compatible save`, () => {
    setLocality('lome')
    const old = initialCityLife()
    const state = travelTo(old, id)
    setLocality(id)
    assert.equal(state.locality, id)
    assert.ok(isCityRoad(state.at.x, state.at.y) || isDriveway(state.at.x, state.at.y))
    assert.ok(worldLots().length > 300)
    assert.ok(boundaries.prefectures.some((p) => p.name === LOCALITIES[id].geo.prefecture))
    assert.ok(Object.keys(SOWING[id]).length >= 2)
    const buildings = state.life.city.buildings
    for (const type of [
      'market',
      'school',
      'hospital',
      'worship',
      'station',
      'sport',
      'cooperative',
    ] as const) {
      const lot = landmarks().find((l) => l.type === type)
      assert.ok(lot, `${id} ${type}`)
      assert.ok(findPath(state.at, lot.door, new Set()), `${id} ${type} reachable from arrival`)
      assert.ok(interiorFor(lot.type))
    }
    for (const e of EMPLOYERS) {
      const kiosk = employerLot(e.id)
      assert.ok(kiosk, `${id} ${e.name}`)
      assert.ok(findPath(state.at, kiosk.door, new Set()))
    }
    assert.equal(decodeCityLife(JSON.parse(JSON.stringify(state)))?.locality, id)
    assert.equal(state.life.city.buildings, buildings)
    for (const to of LOCALITY_IDS.filter((to) => to !== id)) {
      const t = tripTo(state, to)
      assert.ok(t.fare > 0 && t.hours > 0)
    }
    const solid = worldLots().find((l) => ['house', 'shop', 'hospital'].includes(l.type))!
    assert.equal(freelyWalkable(solid.x, solid.y, new Set(), buildings), false)
    const lake = Array.from({ length: 9600 }, (_, i) => ({
      x: i % 120,
      y: Math.floor(i / 120),
    })).find(
      (p) => ['ocean', 'lagoon', 'hill'].includes(terrainAt(p.x, p.y)) && !isCityRoad(p.x, p.y),
    )
    if (lake) assert.equal(freelyWalkable(lake.x, lake.y, new Set(), buildings), false)
    setLocality('lome')
  })

test('all regional presence IDs match the relay; no region impersonates Lomé', () => {
  assert.deepEqual([...LOCALITY_IDS].sort(), [...RELAY_LOCALITIES].sort())
})

for (const employer of ['mixx', 'moov'] as const)
  test(`${employer}: complete hourly shift, wallet credit, interruption and daily limit`, () => {
    setLocality('lome')
    const initial = initialCityLife()
    const kiosk = employerLot(employer)!
    assert.equal(
      startHourlyShift(initial, employer).employment,
      undefined,
      'must be in the correct kiosk',
    )
    let s: CityLife = { ...initial, insideLot: kiosk.id }
    s = startHourlyShift(s, employer)
    assert.ok(s.employment?.shift)
    const wallet = s.life.wallet
    s = advanceHourlyShift(s)
    assert.equal(s.life.wallet, wallet + 1200)
    assert.equal(s.employment?.hoursToday, 1)
    const interrupted = advanceHourlyShift({ ...s, insideLot: null })
    assert.equal(interrupted.life.wallet, s.life.wallet)
    assert.equal(interrupted.employment?.shift, null)
    const loaded = decodeCityLife(JSON.parse(JSON.stringify(s)))!
    assert.equal(loaded.employment?.shift, null, 'reload does not earn unattended money')
    assert.equal(loaded.employment?.earned, 1200)
    for (let i = 0; i < 3; i++) s = advanceHourlyShift(s)
    assert.equal(s.employment?.shift, null)
    assert.equal(s.employment?.hoursToday, 4)
    assert.equal(s.life.wallet, wallet + 4800)
    assert.equal(startHourlyShift(s, employer).employment?.shift, null)
    assert.equal(stopHourlyShift(s).life.wallet, s.life.wallet)
  })

test('hourly shifts refuse simultaneous driving, hunger and closing time', () => {
  setLocality('lome')
  const s = initialCityLife()
  const kiosk = employerLot('mixx')!
  for (const state of [
    { ...s, duty: 'taxi' as const },
    { ...s, life: { ...s.life, hour: 23 } },
    { ...s, life: { ...s.life, needs: { ...s.life.needs, hunger: 0 } } },
  ])
    assert.equal(
      startHourlyShift({ ...state, insideLot: kiosk.id }, 'mixx').employment?.shift,
      undefined,
    )
})

test('aviation: terminal, sufficient money, one debit, arrival and return', () => {
  setLocality('lome')
  const s = initialCityLife()
  const airport = landmarks().find((l) => /aéroport/i.test(l.name ?? ''))!
  assert.equal(takeFlight(s, 'kara').locality, 'lome')
  const poor = takeFlight({ ...s, insideLot: airport.id }, 'kara')
  assert.equal(poor.life.wallet, s.life.wallet)
  assert.equal(poor.locality, 'lome')
  const flying = takeFlight(
    { ...s, insideLot: airport.id, life: { ...s.life, wallet: 150000 } },
    'kara',
  )
  assert.equal(flying.locality, 'kara')
  assert.equal(flying.life.wallet, 150000 - airTrip('lome', 'kara')!.fare)
  assert.equal(flying.insideLot, null)
  const terminal = landmarks().find((l) => /aéroport/i.test(l.name ?? ''))!
  const home = takeFlight({ ...flying, insideLot: terminal.id }, 'lome')
  assert.equal(home.locality, 'lome')
  assert.equal(home.life.wallet, 150000 - 2 * airTrip('lome', 'kara')!.fare)
  assert.equal(airTrip('dapaong', 'kara'), null, 'do not invent real airports')
})

test('counter: purchase and eat is atomic and preserves an existing item when funds are absent', () => {
  setLocality('lome')
  const s = initialCityLife()
  const market = landmarks().find((l) => l.type === 'market')!
  const eating = purchaseAndConsume(
    { ...s, insideLot: market.id, life: { ...s.life, needs: { ...s.life.needs, hunger: 10 } } },
    'ayimolou',
  )
  assert.equal(eating.life.wallet, s.life.wallet - 500)
  assert.equal(eating.life.needs.hunger, 45)
  assert.equal(eating.commerce?.inventory.ayimolou, 0)
  const poor = {
    ...s,
    insideLot: market.id,
    commerce: { inventory: { ayimolou: 1 }, boughtMeals: 1 },
    life: { ...s.life, wallet: 0 },
  }
  assert.equal(purchaseAndConsume(poor, 'ayimolou').commerce?.inventory.ayimolou, 1)
})

test('gym bike uses skeletal cycling, charges once and refuses exhausted users', () => {
  setLocality('lome')
  const s = initialCityLife()
  const gym = landmarks().find((l) => l.type === 'sport')!
  const inside = enterLot({ ...s, at: gym.door }, gym)
  const used = useProp(inside, 'bike-1')
  assert.equal(used.activity?.anim, 'cycle')
  assert.equal(used.life.wallet, inside.life.wallet - 500)
  assert.equal(used.fitness, 4)
  const tired = useProp(
    { ...inside, life: { ...inside.life, needs: { ...inside.life.needs, energy: 0 } } },
    'bike-1',
  )
  assert.equal(tired.life.wallet, inside.life.wallet)
})

test('oriented vehicle collisions and continuous movement prevent walking through a car', () => {
  const body = { x: 2, z: 0, heading: 90, halfWidth: 0.2, halfLength: 0.65 }
  assert.ok(touchesBody(2.5, 0, 0.1, body))
  assert.ok(!touchesBody(2, 0.7, 0.1, body))
  assert.ok(!bodiesOverlap(body, { ...body, z: 1 }))
  const ctl = new PlayerController(
    { walkable: () => true, drivable: () => true },
    { x: 0, y: 0 },
    { angle: 0 },
  )
  ctl.obstacles = [body]
  ctl.input = { x: 1, y: 0, run: true }
  for (let i = 0; i < 300; i++) ctl.update(1 / 60)
  assert.ok(ctl.pos.x <= body.x - body.halfLength - ctl.config.radius, `car must stop the capsule: ${ctl.pos.x}`)
  ctl.input = { x: 0, y: 1, run: true }
  for (let i = 0; i < 60; i++) ctl.update(1 / 60)
  ctl.input = { x: 1, y: 0, run: true }
  for (let i = 0; i < 150; i++) ctl.update(1 / 60)
  assert.ok(ctl.pos.x > 3, 'can walk around the car')
})

test('visible local traffic moves on roads, includes cars and motos, and yields to a pedestrian', () => {
  const road = (x: number, z: number) =>
    x >= 0 && x <= 40 && z >= 0 && z <= 40 && (x % 6 === 0 || z % 6 === 0)
  const traffic = new RoadTraffic(road)
  traffic.step(1 / 60, 20, 20)
  assert.ok(traffic.cars.some((c) => c.kind === 'moto'))
  assert.ok(traffic.cars.some((c) => c.kind === 'taxi'))
  const before = new Map(traffic.cars.map((c) => [c.id, { x: c.x, z: c.z }]))
  for (let i = 0; i < 180; i++) traffic.step(1 / 60, 20, 20)
  assert.ok(
    traffic.cars.filter(
      (c) => Math.hypot(c.x - before.get(c.id)!.x, c.z - before.get(c.id)!.z) > 0.4,
    ).length >= 5,
  )
  for (const c of traffic.cars) assert.ok(road(Math.round(c.x), Math.round(c.z)))
  const car = traffic.cars[0]
  const angle = (car.heading * Math.PI) / 180
  const pedestrian = {
    x: car.x + Math.sin(angle) * (car.halfLength + 0.25),
    z: car.z + Math.cos(angle) * (car.halfLength + 0.25),
    heading: 0,
    halfWidth: 0.2,
    halfLength: 0.2,
  }
  const at = { x: car.x, z: car.z }
  traffic.step(1 / 60, 20, 20, [pedestrian])
  assert.ok(car.stopped)
  assert.equal(car.x, at.x)
  assert.equal(car.z, at.z)
})

test('fuel uses the dated official Togolese super tariff', () => {
  assert.equal(GAME_FUEL_PER_LITRE, 817)
  assert.equal(FUEL_REFERENCE.effective, '2026-09-11')
  assert.match(FUEL_REFERENCE.source, /^https:\/\/www\.republiquetogolaise\.tg\//)
})

test('mobile equipment and conversation targets never overlap', () => {
  const markers = Array.from({ length: 18 }, (_, n) => ({
    id: String(n),
    x: 200 + (n % 3) * 20,
    y: 400 + (n % 4) * 18,
    priority: n < 9 ? 1 : 2,
  }))
  const positions = [...placeScreenMarkers(markers, 412, 915).values()]
  assert.equal(positions.length, markers.length)
  for (let i = 0; i < positions.length; i++) {
    const a = positions[i]
    assert.ok(a.x >= 24 && a.x <= 388 && a.y >= 24 && a.y <= 891)
    for (const b of positions.slice(i + 1))
      assert.ok(Math.abs(a.x - b.x) >= 48 || Math.abs(a.y - b.y) >= 48)
  }
})

test('traffic clears a following service vehicle instead of freezing in front of it', () => {
  const traffic = new RoadTraffic((x, z) => x === 0 && z >= 0 && z <= 30, 1)
  traffic.cars.push({
    id: 0,
    kind: 'taxi',
    from: { x: 0, z: 10 },
    to: { x: 0, z: 11 },
    t: 0,
    stopped: false,
    x: 0.27,
    z: 10,
    heading: 0,
    halfWidth: 0.2,
    halfLength: 0.54,
  })
  const follower = { x: 0.27, z: 8.6, heading: 0, halfWidth: 0.28, halfLength: 0.7 }
  for (let i = 0; i < 60; i++) traffic.step(1 / 60, 0, 10, [follower])
  assert.ok(traffic.cars[0].z > 10.6)
  assert.equal(traffic.cars[0].stopped, false)
})

for (const id of ['dapaong', 'sokode', 'kpalime', 'atakpame', 'kara'] as const)
  test(`${id}: legacy daily careers use the town's workplace and pay once`, () => {
    setLocality('lome')
    let s = travelTo(initialCityLife(), id)
    assert.equal(careerWorkStatus(s), 'away')
    const place = careerWorkplace(s)
    assert.ok(place)
    s = enterLot({ ...s, at: place.door }, place)
    assert.equal(careerWorkStatus(s), 'ready')
    const wallet = s.life.wallet
    s = workCareer(s)
    assert.equal(s.life.wallet, wallet + 3400)
    assert.equal(workCareer(s).life.wallet, s.life.wallet)
    assert.equal(s.life.inside, null)
    assert.ok(s.life.pos.x >= 0, 'never save the temporary workplace context position')
    setLocality('lome')
  })

test('autopilot detours around a stationary vehicle and completes the trip without crossing it', () => {
  const road = (x: number, z: number) =>
    x >= 0 && x <= 12 && z >= 0 && z <= 6 && (x === 0 || x === 12 || z === 0 || z === 6)
  const ctl = new PlayerController({ walkable: road, drivable: road }, { x: 0, y: 0 })
  ctl.vehicle = { x: 0, z: 0, heading: 90, speed: 0 }
  ctl.enterVehicle()
  const obstacle = { x: 6, z: -0.3, heading: 90, halfWidth: 0.2, halfLength: 0.54 }
  ctl.obstacles = [obstacle]
  assert.ok(ctl.driveAutomatically(Array.from({ length: 12 }, (_, i) => ({ x: i + 1, z: 0 }))))
  let detoured = false
  for (let i = 0; i < 60 * 60; i++) {
    ctl.update(1 / 60)
    if (ctl.vehicle.z > 1) detoured = true
    const p = ctl.shownVehicle!
    assert.equal(bodiesOverlap({ ...p, halfWidth: 0.27, halfLength: 0.67 }, obstacle), false)
  }
  assert.ok(detoured)
  assert.equal(ctl.drivingRouteState, 'arrived')
  assert.ok(Math.hypot(ctl.vehicle.x - 12, ctl.vehicle.z) <= 1)
})

for (const kind of ['taxi', 'moto'] as const)
  test(`Lomé ${kind}: reaches a real market in the bounded moving traffic`, () => {
    setLocality('lome')
    const road = (x: number, z: number) => isCityRoad(x, z) || isDriveway(x, z)
    const from = LOCALITIES.lome.gate
    const ctl = new PlayerController({ walkable: road, drivable: road }, from)
    ctl.vehicle = { x: from.x, z: from.y, heading: 0, speed: 0 }
    ctl.vehicleDimensions =
      kind === 'moto'
        ? { halfWidth: 0.12, halfLength: 0.33 }
        : { halfWidth: 0.27, halfLength: 0.67 }
    ctl.enterVehicle()
    const goal = landmarks().find((l) => l.type === 'market')!.door
    const route = drivingRoute(ctl.vehicle, goal, road)!
    ctl.driveAutomatically(route.map((p) => ({ x: p.x, z: p.y })))
    const traffic = new RoadTraffic(road)
    for (let i = 0; i < 60 * 180 && ctl.drivingRouteState !== 'arrived'; i++) {
      const p = ctl.shownVehicle!
      traffic.step(1 / 60, p.x, p.z, [{ ...p, ...ctl.vehicleDimensions }])
      ctl.obstacles = traffic.cars
      ctl.update(1 / 60)
      assert.ok(road(Math.round(ctl.vehicle.x), Math.round(ctl.vehicle.z)))
    }
    assert.equal(ctl.drivingRouteState, 'arrived')
    assert.ok(Math.hypot(ctl.vehicle.x - goal.x, ctl.vehicle.z - goal.y) <= 2.2)
  })

test('traffic keeps real-time speed on a slow phone instead of losing frame time', () => {
  const road = (x: number, z: number) =>
    x >= 0 && x <= 40 && z >= 0 && z <= 40 && (x % 6 === 0 || z % 6 === 0)
  const normal = new RoadTraffic(road, 1)
  const slow = new RoadTraffic(road, 1)
  for (let i = 0; i < 120; i++) normal.step(1 / 60, 20, 20)
  for (let i = 0; i < 8; i++) slow.step(0.25, 20, 20)
  assert.ok(Math.hypot(normal.cars[0].x - slow.cars[0].x, normal.cars[0].z - slow.cars[0].z) < 0.2)
})

test('a waiting passenger does not block both traffic lanes: body dimensions match the adult models', () => {
  const traffic = new RoadTraffic((x, z) => z === 0 && x >= 0 && x <= 40, 1)
  traffic.cars.push({
    id: 0,
    kind: 'taxi',
    from: { x: 10, z: 0 },
    to: { x: 11, z: 0 },
    t: 0,
    stopped: false,
    x: 10,
    z: -0.3,
    heading: 90,
    halfWidth: 0.2,
    halfLength: 0.54,
  })
  const person = { x: 12, z: 0, heading: 0, halfWidth: 0.07, halfLength: 0.07 }
  for (let i = 0; i < 60 * 5; i++) {
    traffic.step(1 / 60, 10, 0, [person])
    assert.equal(bodiesOverlap(traffic.cars[0], person), false)
  }
  assert.ok(traffic.cars[0].x > 14, 'the customer waits while the lane remains passable')
})

test('oncoming traffic crosses an avenue without random turns locking both lanes', () => {
  const traffic = new RoadTraffic(
    (x, z) => Math.abs(x) <= 20 && Math.abs(z) <= 20 && (x === 0 || z === 0),
    2,
  )
  traffic.cars.push(
    {
      id: 0,
      kind: 'taxi',
      from: { x: -1, z: 0 },
      to: { x: 0, z: 0 },
      t: 1,
      stopped: false,
      x: 0,
      z: -0.3,
      heading: 90,
      halfWidth: 0.2,
      halfLength: 0.54,
    },
    {
      id: 1,
      kind: 'sedan',
      from: { x: 1, z: 0 },
      to: { x: 0, z: 0 },
      t: 1,
      stopped: false,
      x: 0,
      z: 0.3,
      heading: 270,
      halfWidth: 0.2,
      halfLength: 0.54,
    },
  )
  for (let i = 0; i < 180; i++) {
    traffic.step(1 / 60, 0, 0)
    assert.equal(bodiesOverlap(traffic.cars[0], traffic.cars[1]), false)
  }
  assert.ok(traffic.cars[0].x > 2 && traffic.cars[1].x < -2)
})

test('a turn checks the entire body sweep before rotating, then resumes when clear', () => {
  const ctl = new PlayerController({ walkable: () => true, drivable: () => true }, { x: 0, y: 0 })
  ctl.vehicle = { x: 0, z: 0, heading: 0, speed: 0 }
  ctl.enterVehicle()
  ctl.obstacles = [{ x: -0.3, z: 0.8, heading: 0, halfWidth: 0.1, halfLength: 0.1 }]
  ctl.driveAutomatically(Array.from({ length: 4 }, (_, i) => ({ x: -i - 1, z: 0 })))
  for (let i = 0; i < 60; i++) ctl.update(1 / 60)
  assert.equal(ctl.vehicle.heading, 0, 'never freeze halfway into a blocked turn')
  assert.equal(ctl.vehicle.x, 0)
  ctl.obstacles = []
  for (let i = 0; i < 600; i++) ctl.update(1 / 60)
  assert.equal(ctl.drivingRouteState, 'arrived')
  assert.equal(ctl.vehicle.x, -4)
})
