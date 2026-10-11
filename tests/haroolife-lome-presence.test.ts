import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initialLomeLife } from '../lib/haroolife/lome-life-engine'
import { placeResidents, residentsAt, spotForRoles } from '../lib/haroolife/lome-presence'
import type { Resident } from '../lib/haroolife/world'

const people: Resident[] = [
  { display_name: 'Admin S.', pagne: 2, roles: ['faitiere'], is_me: true },
  { display_name: 'Kossi', pagne: 3, roles: ['ouvrier'], is_me: false },
  { display_name: 'Abalo K.', pagne: 1, roles: ['producteur'], is_me: false },
  { display_name: 'Essi', pagne: 7, roles: ['agronome'], is_me: false },
  { display_name: 'Ama', pagne: 5, roles: ['acheteur'], is_me: false },
  { display_name: 'Yao', pagne: 4, roles: ['acheteur'], is_me: false },
  { display_name: 'Op. Nord', pagne: 6, roles: ['operateur'], is_me: false },
]

test('each role has a building to stand by', () => {
  assert.equal(spotForRoles(['producteur']), 'farm')
  assert.equal(spotForRoles(['acheteur']), 'market')
  assert.equal(spotForRoles(['union']), 'hall')
  assert.equal(spotForRoles(['operateur', 'producteur']), 'farm')
  assert.equal(spotForRoles([]), 'park')
})

test('residents stand on free tiles next to their building, never on a building, me excluded', () => {
  const { buildings } = initialLomeLife().city
  const placed = placeResidents(people, buildings)
  assert.equal(placed.length, 6)
  const occupied = new Set(buildings.filter((b) => b.type !== 'road').map((b) => `${b.x}:${b.y}`))
  for (const p of placed) {
    assert.ok(!occupied.has(`${p.x}:${p.y}`), `${p.resident.display_name} stands on a building`)
    const anchor = buildings.find((b) => b.type === p.at)
    assert.ok(anchor)
    assert.equal(Math.abs(anchor.x - p.x) + Math.abs(anchor.y - p.y), 1)
  }
  // Two buyers share the market but not the same tile when another is free.
  const buyers = placed.filter((p) => p.at === 'market')
  assert.equal(buyers.length, 2)
  assert.notDeepEqual([buyers[0].x, buyers[0].y], [buyers[1].x, buyers[1].y])
  assert.deepEqual(
    residentsAt(placed, 'market').map((r) => r.display_name),
    ['Ama', 'Yao'],
  )
  assert.deepEqual(placeResidents(people, buildings), placed)
})

test('a role whose building is missing falls back to the town hall', () => {
  const buildings = initialLomeLife().city.buildings.filter((b) => b.type !== 'farm')
  const placed = placeResidents(people, buildings)
  assert.equal(placed.find((p) => p.resident.display_name === 'Abalo K.')?.at, 'hall')
  assert.deepEqual(placeResidents(people, []), [])
})
