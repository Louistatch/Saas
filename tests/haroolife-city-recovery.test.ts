import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  initialCity, place, tick, cityWarning, emergencyRelief, nextObjective, decodeCity,
} from '../lib/haroolife/townsmen-engine'

test('empty food means no taxation and triggers a critical warning', () => {
  const city = {...initialCity(), food: 0, coins: 100, population: 2}
  const next = tick(city)
  assert.equal(next.coins, 100)
  assert.equal(next.food, 0)
  assert.equal(cityWarning(next).kind, 'critical')
  assert.match(cityWarning(next).message, /Urgence alimentaire/)
})

test('saved older v1 cities remain valid and can receive help exactly once', () => {
  const old = {...initialCity(), day: 572, population: 2, food: 0, happiness: 18}
  delete old.reliefUsed
  const restored = decodeCity(JSON.parse(JSON.stringify(old)))
  assert.ok(restored)
  const result = emergencyRelief(restored)
  assert.equal(result.error, null)
  assert.equal(result.city.day, 572)
  assert.equal(result.city.buildings.length, old.buildings.length)
  assert.equal(result.city.population, 10)
  assert.ok(result.city.food >= 65)
  assert.equal(result.city.reliefUsed, true)
  assert.equal(cityWarning(result.city).kind, 'healthy')
  assert.match(emergencyRelief(result.city).error ?? '', /déjà été utilisé/)
  assert.ok(decodeCity(result.city))
})

test('starter resources encourage guided production, not fake growth without inputs', () => {
  let city = initialCity()
  assert.equal(cityWarning(city).kind, 'healthy')
  assert.match(nextObjective(city), /Champ de maïs/)
  city=place(city,12,11,'farm').city
  city=place(city,13,11,'mill').city
  city=place(city,13,13,'bakery').city
  assert.match(nextObjective(city), /puits/)
  city=tick(city)
  assert.equal(city.maize,3)
  assert.equal(city.flour,0)
  assert.ok(city.food>60-3)
  assert.ok(city.population>=10)
})

test('recovering a saved ruined village never creates new professional users or parcels', () => {
  const ruined={...initialCity(),population:2,food:0,wood:0,coins:0,day:300}
  const rescued=emergencyRelief(ruined).city
  assert.deepEqual(rescued.buildings,ruined.buildings)
  assert.equal(ruined.population,2)
  assert.equal(ruined.food,0)
  assert.equal(rescued.reliefUsed,true)
  assert.equal(decodeCity({...rescued,reliefUsed:'fake'}),null)
})
