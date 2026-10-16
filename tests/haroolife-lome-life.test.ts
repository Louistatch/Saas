import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LIFE_LOCATIONS,
  SALARIES,
  advanceLifeHour,
  buildInLome,
  canEnter,
  decodeLomeLife,
  directTo,
  initialLomeLife,
  interact,
  jobVenue,
  prepareForWork,
  selectJob,
  simulatedTraffic,
  waitForNextWorkShift,
  workStatus,
} from '../lib/haroolife/lome-life-engine'
import { roadNetwork } from '../lib/haroolife/townsmen-engine'
import {
  zoomSliderDistance,
  zoomSliderValue,
} from '../lib/haroolife/vendor/house-builder-camera-zoom'
import { shortestPathToBuilding, shortestRoadPath } from '../lib/haroolife/vendor/simcity-road-path'

test('Lomé starts with navigable roads, businesses and independent wallets', () => {
  const s = initialLomeLife()
  assert.equal(s.hour, 8)
  assert.ok(s.wallet > 0 && s.city.coins > s.wallet)
  assert.ok(
    LIFE_LOCATIONS.every((p) =>
      s.city.buildings.some((b) => b.x === p.x && b.y === p.y && b.type === p.venue),
    ),
  )
  assert.equal(decodeLomeLife(JSON.parse(JSON.stringify(s)))?.wallet, s.wallet)
  assert.ok(roadNetwork(s.city.buildings).has(s.pos.x + ':' + s.pos.y))
})
test('MIT SimCity-inspired path finder respects disconnected roads', () => {
  const roads = new Set(['1:1', '1:2', '2:2', '5:5'])
  assert.deepEqual(shortestRoadPath(roads, { x: 1, y: 1 }, { x: 2, y: 2 }), [
    { x: 1, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
  ])
  assert.equal(shortestRoadPath(roads, { x: 1, y: 1 }, { x: 5, y: 5 }), null)
  assert.deepEqual(shortestPathToBuilding(roads, { x: 1, y: 1 }, { x: 2, y: 3 }), [
    { x: 1, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
  ])
})
test('player walks along roads into market, buys and eats one meal', () => {
  let s = initialLomeLife()
  const market = { x: 12, y: 11 }
  s = directTo(s, market)
  assert.ok(s.route.length > 0)
  for (let i = 0; i < 8 && s.route.length; i++) s = advanceLifeHour(s)
  assert.equal(s.route.length, 0)
  assert.equal(Math.abs(s.pos.x - market.x) + Math.abs(s.pos.y - market.y), 1)
  assert.equal(canEnter(s, market), true)
  const entered = interact(s, 'enter')
  assert.equal(entered.inside, 'market')
  const oldWallet = entered.wallet,
    oldCoins = entered.city.coins,
    oldStock = entered.city.food
  s = interact(entered, 'buy-meal')
  assert.equal(s.wallet, oldWallet - 650)
  assert.equal(s.city.coins, oldCoins + 650)
  assert.equal(s.city.food, oldStock - 1)
  const before = s.needs.hunger
  s = interact(s, 'eat')
  assert.ok(s.needs.hunger > before)
  s = interact(s, 'leave')
  assert.equal(s.inside, null)
})
test('jobs pay once a day only near workplace with municipal funds', () => {
  let s = initialLomeLife()
  assert.equal(interact(s, 'work').wallet, s.wallet)
  s = directTo(s, { x: 12, y: 11 })
  for (let i = 0; i < 9 && s.route.length; i++) s = advanceLifeHour(s)
  const paid = interact(s, 'work')
  assert.equal(paid.wallet, s.wallet + SALARIES.vendeur)
  assert.equal(paid.city.coins, s.city.coins - SALARIES.vendeur)
  assert.equal(interact(paid, 'work').wallet, paid.wallet)
  assert.equal(jobVenue('boulanger'), 'bakery')
  assert.equal(selectJob(paid, 'agent-communal').job, 'agent-communal')
  assert.equal(jobVenue('livreur'), 'market')
  assert.equal(jobVenue('conducteur-tricycle'), 'hall')
  assert.equal(selectJob(paid, 'vendeur-mobile-money').job, 'vendeur-mobile-money')
})
test('a closed shift can advance to opening and exposes a clear ready state', () => {
  const night = { ...initialLomeLife(), hour: 21, needs: { ...initialLomeLife().needs, energy: 20 } }
  assert.equal(workStatus(night), 'closed')
  const morning = waitForNextWorkShift(night)
  assert.equal(morning.hour, 7)
  assert.equal(morning.day, night.day + 1)
  assert.ok(morning.needs.energy >= 65)
  assert.equal(morning.wallet, night.wallet)
  assert.equal(workStatus(morning), 'away')
})
test('the service break removes an energy or hunger deadlock without changing money', () => {
  const weak = {
    ...initialLomeLife(),
    hour: 10,
    needs: { ...initialLomeLife().needs, energy: 2, hunger: 1 },
  }
  assert.equal(workStatus(weak), 'tired')
  const readyToTravel = prepareForWork(weak)
  assert.equal(readyToTravel.hour, 11)
  assert.ok(readyToTravel.needs.energy >= 45)
  assert.ok(readyToTravel.needs.hunger >= 25)
  assert.equal(readyToTravel.wallet, weak.wallet)
  assert.equal(workStatus(readyToTravel), 'away')
})
test('construction preserves city budget and personal savings', () => {
  const s = initialLomeLife()
  const beforeWallet = s.wallet
  const built = buildInLome(s, 10, 13, 'house')
  assert.equal(built.wallet, beforeWallet)
  assert.equal(built.city.coins, s.city.coins - 85)
  assert.ok(built.city.buildings.some((b) => b.type === 'house' && b.x === 10 && b.y === 13))
  assert.ok(built.events.length <= 8)
})
test('needs diminish while time passes, city recalculates on day boundary', () => {
  let s = initialLomeLife()
  s = { ...s, hour: 23 }
  const next = advanceLifeHour(s)
  assert.equal(next.hour, 0)
  assert.equal(next.day, 2)
  assert.equal(next.city.day, s.city.day + 1)
  assert.ok(next.needs.hunger < s.needs.hunger)
  assert.ok(next.trafficStep > s.trafficStep)
  assert.equal(simulatedTraffic(s).length, 4)
})
test('one save malformed, untrusted, impossible or disconnected is rejected', () => {
  const s = initialLomeLife()
  assert.equal(decodeLomeLife({ ...s, wallet: -1 }), null)
  assert.equal(decodeLomeLife({ ...s, hour: 24 }), null)
  assert.equal(decodeLomeLife({ ...s, route: [{ x: 99, y: 100 }] }), null)
  assert.equal(decodeLomeLife({ ...s, needs: { ...s.needs, hunger: 101 } }), null)
  assert.equal(decodeLomeLife({ ...s, job: 'hacker' }), null)
})
test('MIT house builder zoom utility remains mathematically invertible', () => {
  for (const distance of [2, 6, 15, 40, 80]) {
    const actual = zoomSliderDistance(zoomSliderValue(distance))
    assert.ok(Math.abs(actual - distance) < 2)
  }
})
