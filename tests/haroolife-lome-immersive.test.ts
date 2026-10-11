import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  TRAVEL_COST,
  advanceLifeHour,
  chooseTransport,
  directTo,
  initialLomeLife,
  interact,
  walkLifeStep,
} from '../lib/haroolife/lome-life-engine'

test('auto-walking follows roads without skipping time or spending money', () => {
  const start = initialLomeLife()
  let moving = directTo(start, { x: 12, y: 11 })
  assert.ok(moving.route.length > 0)
  const distance = moving.route.length
  for (let i = 0; i < distance; i++) moving = walkLifeStep(moving)
  assert.equal(moving.route.length, 0)
  assert.equal(moving.hour, start.hour)
  assert.equal(moving.day, start.day)
  assert.equal(moving.wallet, start.wallet)
  assert.equal(Math.abs(moving.pos.x - 12) + Math.abs(moving.pos.y - 11), 1)
  assert.match(moving.lastEvent, /Destination atteinte/)
})
test('route cancellation if roads disappear; never teleports off connected road', () => {
  let state = directTo(initialLomeLife(), { x: 12, y: 11 })
  assert.ok(state.route.length > 0)
  const p = state.route[0]
  const gone = {
    ...state.city,
    buildings: state.city.buildings.filter((b) => !(b.x === p.x && b.y === p.y)),
  }
  state = walkLifeStep({ ...state, city: gone })
  assert.equal(state.route.length, 0)
  assert.match(state.lastEvent, /interrompu/)
})
test('paid transport charges only fictional wallet and credits city treasury once', () => {
  const initial = directTo(initialLomeLife(), { x: 12, y: 11 })
  const next = chooseTransport(initial, 'moto')
  assert.equal(next.wallet, initial.wallet - TRAVEL_COST.moto)
  assert.equal(next.city.coins, initial.city.coins + TRAVEL_COST.moto)
  assert.equal(next.spent, initial.spent + TRAVEL_COST.moto)
  assert.equal(walkLifeStep(next).wallet, next.wallet)
  assert.equal(chooseTransport(initial, 'walk').wallet, initial.wallet)
  assert.match(chooseTransport({ ...initial, wallet: 0 }, 'taxi').lastEvent, /insuffisant/)
  assert.match(chooseTransport({ ...initial, route: [] }, 'taxi').lastEvent, /destination/)
})
test('main daily mechanics still exist with independent real-time movement', () => {
  const start = initialLomeLife()
  let s = directTo(start, { x: 12, y: 11 })
  while (s.route.length) s = walkLifeStep(s)
  const bought = interact(s, 'buy-meal')
  assert.equal(bought.wallet, start.wallet - 650)
  const fed = interact(bought, 'eat')
  assert.ok(fed.needs.hunger > s.needs.hunger)
  const paid = interact(fed, 'work')
  assert.ok(paid.wallet > fed.wallet)
  const tomorrow = advanceLifeHour({ ...paid, hour: 23 })
  assert.equal(tomorrow.day, 2)
  assert.equal(tomorrow.workToday, false)
})

import { stepPlayer, trafficLoop, trafficVehicles } from '../lib/haroolife/lome-life-engine'
import { roadNetwork } from '../lib/haroolife/townsmen-engine'

test('direct control steps only onto connected roads and selects a door when facing a venue', () => {
  const start = initialLomeLife() // player at 11:12, roads around the town hall
  const roads = roadNetwork(start.city.buildings)
  const left = stepPlayer(start, -1, 0)
  assert.deepEqual(left.pos, { x: 10, y: 12 })
  assert.ok(roads.has('10:12'))
  assert.equal(left.route.length, 0)
  const blocked = stepPlayer(left, 0, 1) // 10:13 is open ground, not a road
  assert.deepEqual(blocked.pos, left.pos)
  assert.match(blocked.lastEvent, /Pas de route/)
  // From 11:11 (road), stepping up faces the town hall at 11:10.
  const belowHall = { ...start, pos: { x: 11, y: 11 } }
  const facing = stepPlayer(belowHall, 0, -1)
  assert.deepEqual(facing.pos, { x: 11, y: 11 })
  assert.deepEqual(facing.target, { x: 11, y: 10 })
  assert.equal(interact(facing, 'enter').inside, 'hall')
  assert.match(stepPlayer(interact(facing, 'enter'), 1, 0).lastEvent, /Sors/)
})

test('traffic drives along adjacent road tiles instead of teleporting', () => {
  const state = initialLomeLife()
  const roads = roadNetwork(state.city.buildings)
  const loop = trafficLoop(roads)
  assert.ok(loop.length >= roads.size)
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    assert.equal(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1, `tiles ${i} and ${i + 1} must touch`)
    assert.ok(roads.has(`${a.x}:${a.y}`))
  }
  const now = trafficVehicles(state)
  const later = trafficVehicles({ ...state, trafficStep: state.trafficStep + 1 })
  assert.equal(now.length, 4)
  now.forEach((v, i) => {
    assert.equal(Math.abs(v.x - later[i].x) + Math.abs(v.y - later[i].y), 1)
    assert.ok([0, 90, 180, -90, 270].includes(((v.heading % 360) + 360) % 360))
  })
  assert.deepEqual(trafficVehicles({ ...state, city: { ...state.city, buildings: [] } }), [])
})

import { skipTravel } from '../lib/haroolife/lome-life-engine'

test('skipping a ride lands on the last road tile of the route without extra cost', () => {
  const start = initialLomeLife()
  const moving = directTo(start, { x: 12, y: 11 })
  const last = moving.route[moving.route.length - 1]
  const landed = skipTravel(moving)
  assert.deepEqual(landed.pos, last)
  assert.equal(landed.route.length, 0)
  assert.equal(landed.wallet, moving.wallet)
  assert.equal(Math.abs(landed.pos.x - 12) + Math.abs(landed.pos.y - 11), 1)
  assert.equal(skipTravel(start), start)
})
