import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  actionsFor,
  decodeCityLife,
  initialCityLife,
  interiorFor,
} from '../lib/haroolife/city/life'
import { layoutFor } from '../lib/haroolife/city/interiors'
import { buyEstateMeal, consume, purchase } from '../lib/haroolife/city/commerce'
import { converse } from '../lib/haroolife/city/social'
import { landmarks, worldLots } from '../lib/haroolife/city/world'
import { setLocality } from '../lib/haroolife/city/locality'
import { sceneFor } from '../lib/haroolife/game/core/scene'
import { pathfind } from '../lib/haroolife/game/core/pathfind'
import {
  finishVehicleStop,
  manualVehicleQuote,
  manualVehicleService,
  nextVehicleStop,
  settleVehicleFare,
  vehicleCare,
  VEHICLE_RULES,
  GAME_FUEL_PER_LITRE,
} from '../lib/haroolife/city/vehicle-economy'
import { AutomaticDrivingService } from '../lib/haroolife/city/automatic-service'
import { PlayerController } from '../lib/haroolife/city/player'

for (const locality of ['lome', 'kara'] as const)
  test(`${locality}: every building advertises only supported, reachable furniture actions`, () => {
    setLocality(locality)
    const unique = new Map(worldLots().map((l) => [`${l.type}:${l.service ?? ''}`, l]))
    for (const lot of unique.values()) {
      const room = interiorFor(lot.type)
      if (!room) {
        assert.ok(['lot', 'billboard'].includes(lot.type))
        continue
      }
      const layout = layoutFor(room, lot)
      const actions = actionsFor(lot.type, lot.service)
      const scene = sceneFor(room, layout)
      assert.equal(scene.view.follow, false, 'city rooms open with all inhabitants discoverable')
      for (const prop of layout.props.filter((p) => p.action)) {
        assert.ok(
          actions.some((a) => a.id === prop.action),
          `${lot.type}: unsupported ${prop.action}`,
        )
        const hotspot = scene.hotspots.find((h) => h.ref === prop.id && h.kind === 'prop')
        assert.ok(hotspot, `${lot.type}/${lot.service ?? ''}: missing hotspot for ${prop.id}`)
        assert.ok(
          pathfind(scene.spawn, hotspot.at, scene.obstacles, scene.bounds).length > 0 ||
            Math.hypot(scene.spawn.x - hotspot.at.x, scene.spawn.z - hotspot.at.z) < 0.5,
          `${lot.type}: inaccessible ${prop.id}`,
        )
      }
      for (const npc of layout.npcs) {
        const hotspot = scene.hotspots.find((h) => h.kind === 'npc' && h.ref === npc.id)
        // Figurants (students in the amphitheatre) are present but not talked to.
        if (npc.extra) {
          assert.equal(hotspot, undefined, `${lot.type}: ${npc.id} is a figurant`)
          continue
        }
        assert.ok(hotspot, `${lot.type}: missing conversation hotspot for ${npc.id}`)
        assert.ok(
          pathfind(scene.spawn, hotspot.at, scene.obstacles, scene.bounds).length > 0 ||
            Math.hypot(scene.spawn.x - hotspot.at.x, scene.spawn.z - hotspot.at.z) < 0.5,
          `${lot.type}: cannot reach ${npc.id}`,
        )
      }
      for (const action of actions)
        assert.ok(
          layout.props.some((p) => p.action === action.id),
          `${lot.type}: ${action.id} missing in 3D`,
        )
      assert.equal(
        layoutFor(room, lot),
        layout,
        'stable layout prevents canvas resets on wallet updates',
      )
    }
    for (const service of ['fuel', 'garage', 'police'])
      assert.equal(landmarks().filter((l) => l.service === service).length, 1)
    setLocality('lome')
  })

test('market: purchase, carry, consume, insufficient funds and reload preserve money and stock', () => {
  setLocality('lome')
  const base = initialCityLife()
  const market = landmarks().find((l) => l.type === 'market')!
  const s = {
    ...base,
    insideLot: market.id,
    life: { ...base.life, wallet: 600, needs: { ...base.life.needs, hunger: 10 } },
  }
  const bought = purchase(s, 'ayimolou')
  assert.equal(bought.life.wallet, 100)
  assert.equal(bought.commerce?.inventory.ayimolou, 1)
  assert.equal(bought.commerce?.boughtMeals, 1)
  assert.equal(bought.life.needs.hunger, 10, 'buying is not eating')
  assert.equal(purchase(bought, 'ayimolou').life.wallet, 100)
  const eaten = consume(bought, 'ayimolou')
  assert.equal(eaten.life.needs.hunger, 45)
  assert.equal(consume(eaten, 'ayimolou').life.needs.hunger, 45)
  const saved = decodeCityLife(JSON.parse(JSON.stringify(eaten)))!
  assert.equal(saved.commerce?.inventory.ayimolou, 0)
  assert.equal(saved.commerce?.boughtMeals, 1)
  assert.equal(purchase({ ...s, insideLot: null }, 'water').life.wallet, 600)
})

test('social: contextual replies, persistent relationship and a daily reward instead of infinite social farming', () => {
  const s = initialCityLife()
  const resident = { key: 'npc:Abla', name: 'Abla', role: 'Vendeuse' }
  const a = converse(s, resident, 'Bonjour')
  const b = converse(a, resident, 'Que peut-on acheter au marché ?')
  assert.match(b.social![resident.key].history.at(-1)!.text, /ayimolou/)
  assert.notEqual(
    a.social![resident.key].history.at(-1)!.text,
    b.social![resident.key].history.at(-1)!.text,
  )
  assert.equal(b.life.needs.social, a.life.needs.social)
  assert.equal(b.social![resident.key].affinity, 10)
  const c = converse(
    { ...b, life: { ...b.life, day: b.life.day + 1 } },
    resident,
    'Comment trouver un travail ?',
  )
  assert.equal(c.social![resident.key].affinity, 20)
  assert.match(c.social![resident.key].history.at(-1)!.text, /véhicule est fourni/)
  assert.deepEqual(decodeCityLife(JSON.parse(JSON.stringify(c)))?.social, c.social)
})

for (const kind of ['taxi', 'moto'] as const)
  test(`${kind}: gross, paid fuel and maintenance reconcile; stops never double charge`, () => {
    let s = initialCityLife()
    s = { ...s, duty: kind, life: { ...s.life, wallet: 100 } }
    const fare = {
      passenger: 'Abla',
      to: { lotId: 'test', name: 'Marché', x: 50, y: 34 },
      cells: 50,
      price: 2000,
    }
    s = settleVehicleFare(s, fare, kind, 70)
    const receipt = vehicleCare(s, kind).lastReceipt!
    assert.ok(receipt.fuel > 0 && receipt.maintenance > 0)
    assert.equal(s.life.wallet, 100 + receipt.net)
    assert.equal(receipt.net, receipt.gross - receipt.fuel - receipt.maintenance)
    assert.equal(s.life.earned - s.life.spent, receipt.net)
    assert.equal(s.commerce?.boughtMeals, 0, 'vehicle expenses do not complete the meal objective')
    const c = vehicleCare(s, kind)
    s = {
      ...s,
      fleet: {
        ...s.fleet,
        [kind]: {
          ...c,
          fuelMl: 100,
          fuelReserve: Math.ceil((VEHICLE_RULES[kind].tankMl * GAME_FUEL_PER_LITRE) / 1000),
          sinceMaintenanceKm: 9,
          courses: 3,
        },
      },
    }
    assert.equal(nextVehicleStop(s, kind)?.service, 'fuel')
    const wallet = s.life.wallet
    s = finishVehicleStop(s, kind, 'fuel')
    assert.equal(vehicleCare(s, kind).fuelMl, VEHICLE_RULES[kind].tankMl)
    assert.equal(nextVehicleStop(s, kind)?.service, 'garage')
    s = finishVehicleStop(s, kind, 'garage')
    assert.equal(nextVehicleStop(s, kind)?.service, 'police')
    s = finishVehicleStop(s, kind, 'police')
    assert.equal(nextVehicleStop(s, kind), null)
    assert.equal(s.life.wallet, wallet)
    assert.equal(vehicleCare(s, kind).checks, 1)
    assert.deepEqual(decodeCityLife(JSON.parse(JSON.stringify(s)))?.fleet, s.fleet)
    const quote = manualVehicleQuote(s, kind, 'fuel')
    assert.equal(manualVehicleService(s, 'fuel').life.wallet, s.life.wallet - quote)
  })

test('automatic service drives to each support stop, waits, applies it once and resumes clients', () => {
  const road = (x: number, y: number) => y === 0 && x >= 0 && x <= 30
  const controller = new PlayerController({ walkable: road, drivable: road }, { x: 0, y: 0 })
  controller.vehicle = { x: 0, z: 0, heading: 0, speed: 0 }
  assert.ok(controller.enterVehicle())
  const queue = ['fuel', 'garage', 'police'] as const
  let stops = 0
  const service = new AutomaticDrivingService(controller, {
    drivable: road,
    random: () => 0,
    places: () => [
      {
        id: 'test',
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
    ],
    nextStop: () =>
      stops < 3 ? { service: queue[stops], name: queue[stops], x: stops * 4, y: 0 } : null,
  })
  service.start('moto')
  service.offer({ name: 'Abla', x: 3, y: 0 })
  let paid = 0
  for (let i = 0; i < 150 * 60; i++) {
    controller.update(1 / 60)
    for (const event of service.update(1 / 60)) {
      if (event.type === 'paid') {
        paid++
        assert.ok(event.traveledCells >= event.fare.cells)
      }
      if (event.type === 'serviced') {
        assert.equal(event.service, queue[stops])
        stops++
      }
    }
  }
  assert.equal(paid, 1)
  assert.equal(stops, 3)
  assert.equal(service.snapshot().phase, 'searching')
})

test('mosques keep prayer interactions without cathedral furniture, and a station has its 3D pump', () => {
  setLocality('lome')
  const mosque = landmarks().find((l) => /mosqu/i.test(l.name ?? ''))!
  const room = layoutFor('chapel', mosque)
  assert.ok(room.props.some((p) => p.kind === 'mat' && p.action === 'pray'))
  assert.ok(!room.props.some((p) => p.kind === 'altar' || p.kind === 'pew'))
  const fuel = landmarks().find((l) => l.service === 'fuel')!
  assert.ok(
    layoutFor('market', fuel).props.some((p) => p.kind === 'fuel-pump' && p.action === 'fuel'),
  )
})

test('the original estate market and bakery retain purchases and meal-objective progression', () => {
  const base = initialCityLife()
  assert.equal(
    buyEstateMeal({ ...base, life: { ...base.life, inside: 'house' } }).commerce?.boughtMeals,
    0,
  )
  const market = { ...base, life: { ...base.life, inside: 'market' as const } }
  const legacy = buyEstateMeal(market)
  assert.equal(legacy.life.wallet, base.life.wallet - 650)
  assert.equal(legacy.commerce?.boughtMeals, 1)
  assert.equal(purchase(market, 'water').life.wallet, base.life.wallet - 100)
})

test('all six original estate interiors expose supported actions instead of city-only commands', () => {
  const allowed = {
    house: ['sleep', 'eat', 'relax', 'socialize', 'wash', 'toilet'],
    market: ['buy-meal'],
    bakery: ['buy-meal'],
    hall: ['work', 'bank', 'toilet'],
    well: ['wash'],
    park: ['relax', 'browse'],
  }
  for (const [room, actions] of Object.entries(allowed)) {
    const layout = layoutFor(room as keyof typeof allowed)
    assert.equal(sceneFor(room, layout).view.follow, false)
    for (const prop of layout.props.filter((p) => p.action))
      assert.ok(
        actions.includes(prop.action!),
        `${room}: unsupported estate command ${prop.action}`,
      )
  }
  assert.ok(layoutFor('well').props.some((p) => p.action === 'wash'))
  assert.ok(layoutFor('park').props.some((p) => p.action === 'browse'))
})
