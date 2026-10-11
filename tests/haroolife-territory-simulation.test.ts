import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  advanceTerritoryDays,
  advanceTerritoryDay,
  initialTerritoryWorld,
  invest,
} from '../lib/haroolife/territory-simulation'

test('initial state is isolated and reproducible', () => {
  const a = initialTerritoryWorld()
  const b = initialTerritoryWorld()
  assert.deepEqual(a, b)
  assert.notStrictEqual(a, b)
  assert.equal(a.soldKg, 0)
})

test('investment is paid once and does not mutate source state', () => {
  const initial = initialTerritoryWorld()
  const purchase = invest(initial, 'factory')
  assert.equal(purchase.ok, true)
  assert.equal(initial.projects.factory, false)
  assert.equal(purchase.world.treasury, initial.treasury - 1_800_000)
  const repeat = invest(purchase.world, 'factory')
  assert.equal(repeat.ok, false)
  assert.strictEqual(repeat.world, purchase.world)
})

test('no sales without an actual transformation and transport chain', () => {
  const state = advanceTerritoryDays(initialTerritoryWorld(), 10)
  assert.equal(state.soldKg, 0)
  assert.equal(state.totalDriedKg, 0)
  assert.equal(state.revenue, 0)
  assert.ok(state.rawKg > 300)
})

test('transformation alone creates stocks, but not sales', () => {
  const state = advanceTerritoryDays(invest(initialTerritoryWorld(), 'factory').world, 3)
  assert.ok(state.totalDriedKg > 0)
  assert.equal(state.soldKg, 0)
  assert.equal(state.driedKg, state.totalDriedKg)
})

test('complete chain produces finite results, no negative stock or material creation', () => {
  let world = invest(initialTerritoryWorld(), 'factory').world
  world = invest(world, 'truck').world
  world = invest(world, 'irrigation').world
  world = invest(world, 'solar').world
  const initialProjects = { ...world.projects }
  world = advanceTerritoryDays(world, 30)
  assert.equal(world.day, 30)
  assert.ok(world.soldKg > 0)
  assert.ok(world.revenue > 0)
  assert.ok(world.rawKg >= 0)
  assert.ok(world.driedKg >= 0)
  assert.ok(world.totalDriedKg * 4 <= 300 + world.totalHarvestKg)
  assert.ok(Number.isFinite(world.treasury))
  assert.deepEqual(world.projects, initialProjects)
  assert.equal(world.treasury, 8_000_000 - world.investments + world.revenue - world.expenses)
})

test('same inputs always give same next day', () => {
  const world = invest(initialTerritoryWorld(), 'factory').world
  assert.deepEqual(advanceTerritoryDay(world), advanceTerritoryDay(world))
  assert.throws(() => advanceTerritoryDays(world, 0), RangeError)
  assert.throws(() => advanceTerritoryDays(world, 31), RangeError)
})
