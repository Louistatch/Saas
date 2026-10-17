import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceMeal, beginMeal, cancelMeal, readyMeal } from '../lib/haroolife/city/dining'
import { layoutFor } from '../lib/haroolife/city/interiors'
import { decodeCityLife, initialCityLife, useProp } from '../lib/haroolife/city/life'
import { landmarks } from '../lib/haroolife/city/world'
import { rendererForInterior } from '../lib/haroolife/engine/select'
import { isFree, pathfind } from '../lib/haroolife/game/core/pathfind'
import { HOUSE_SCENE, sceneFromLayout } from '../lib/haroolife/game/core/scene'

function market() {
  const s = initialCityLife()
  const m = landmarks().find((l) => l.type === 'market')!
  return {
    ...s,
    insideLot: m.id,
    at: m.door,
    life: { ...s.life, wallet: 1000, needs: { ...s.life.needs, hunger: 10 } },
  }
}
test('a served meal charges once, reserves its portion until the first bite, then consumes once', () => {
  const original = market()
  const bought = beginMeal(original, 'ayimolou', 'order-1', true)
  assert.equal(bought.life.wallet, 500)
  assert.equal(bought.commerce?.inventory.ayimolou, 1)
  assert.equal(bought.life.needs.hunger, 10)
  assert.equal(beginMeal(bought, 'ayimolou', 'order-2', true), bought)
  let s = readyMeal(bought, 'order-1', 'meal-chair-1')
  for (let i = 0; i < 6; i++) s = advanceMeal(s, 'order-1', 0.2)
  assert.equal(s.commerce?.inventory.ayimolou, 1)
  for (let i = 0; i < 30; i++) s = advanceMeal(s, 'order-1', 0.2)
  assert.equal(s.commerce?.inventory.ayimolou, 0)
  assert.equal(s.life.needs.hunger, 45)
  assert.equal(s.life.wallet, 500)
  assert.equal(s.meal, undefined)
  assert.equal(s.activity?.anim, 'sit')
  assert.equal(advanceMeal(s, 'order-1', 0.2), s)
})
test('interrupting or reloading before a bite preserves the paid portion, without offline eating', () => {
  const s = readyMeal(beginMeal(market(), 'ayimolou', 'cancel', true), 'cancel', null)
  const canceled = cancelMeal(advanceMeal(s, 'cancel', 0.2))
  assert.equal(canceled.commerce?.inventory.ayimolou, 1)
  assert.equal(canceled.life.wallet, 500)
  const restored = decodeCityLife(JSON.parse(JSON.stringify(s)))!
  assert.equal(restored.meal, undefined)
  assert.equal(restored.activity, null)
  assert.equal(restored.commerce?.inventory.ayimolou, 1)
  assert.equal(restored.life.needs.hunger, 10)
})
test('late cancellation never refunds an eaten portion or repeats the effect', () => {
  let s = readyMeal(beginMeal(market(), 'ayimolou', 'late', true), 'late', null)
  for (let i = 0; i < 8; i++) s = advanceMeal(s, 'late', 0.2)
  s = cancelMeal(s)
  assert.equal(s.commerce?.inventory.ayimolou, 0)
  assert.equal(s.life.needs.hunger, 45)
  assert.equal(readyMeal(s, 'late', null), s)
})
test('insufficient money, unavailable items and changed locations cannot give free food', () => {
  const poor = { ...market(), life: { ...market().life, wallet: 100 } }
  assert.equal(beginMeal(poor, 'ayimolou', 'poor', true).meal, undefined)
  assert.equal(beginMeal(market(), 'fish', 'none').meal, undefined)
  let s = readyMeal(beginMeal(market(), 'ayimolou', 'travel', true), 'travel', null)
  s = advanceMeal({ ...s, insideLot: null }, 'travel', 0.2)
  assert.equal(s.meal, undefined)
  assert.equal(s.commerce?.inventory.ayimolou, 1)
})
test('the old estate stock is still edible and clock jumps cannot finish a meal', () => {
  let s = readyMeal(beginMeal(initialCityLife(), 'estate', 'legacy'), 'legacy', null)
  const count = s.life.meals
  s = advanceMeal(s, 'legacy', 86400)
  assert.equal(s.life.meals, count)
  assert.equal(s.meal?.elapsed, 0.25)
  for (let i = 0; i < 30; i++) s = advanceMeal(s, 'legacy', 0.25)
  assert.equal(s.life.meals, count - 1)
})
test('the house and the market offer reachable seats with free exits and no repeated income', () => {
  const lot = landmarks().find((l) => l.type === 'market')!
  const layout = layoutFor('market', lot)
  const scene = sceneFromLayout('market', layout)
  for (const s of [HOUSE_SCENE, scene]) {
    assert.ok(Object.keys(s.seats ?? {}).length >= 2)
    for (const seat of Object.values(s.seats!)) {
      assert.ok(isFree(seat.entry.x, seat.entry.z, s.obstacles, s.bounds))
      assert.ok(pathfind(s.spawn, seat.entry, s.obstacles, s.bounds).length)
    }
  }
  const s = market()
  const seated = useProp(s, 'meal-chair-1')
  assert.equal(seated.activity?.anim, 'sit')
  assert.equal(useProp(seated, 'meal-chair-1').life.wallet, s.life.wallet)
})
test('reference rooms retain their completed interactions with an old remembered R3F preference', () => {
  assert.equal(rendererForInterior('three', 'house'), 'haroo')
  assert.equal(rendererForInterior('three', 'market'), 'haroo')
  assert.equal(rendererForInterior('three', 'gym'), 'three')
})
