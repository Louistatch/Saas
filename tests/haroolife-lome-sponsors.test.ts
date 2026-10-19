import assert from 'node:assert/strict'
import { test } from 'node:test'
import { districtIndexAt } from '../lib/haroolife/lome-districts'
import { initialLomeLife } from '../lib/haroolife/lome-life-engine'
import {
  BILLBOARDS,
  PARTNER_APPS,
  billboardById,
  inventorySummary,
} from '../lib/haroolife/lome-sponsors'
import { terrainAt } from '../lib/haroolife/townsmen-engine'

test('one billboard per district, on dry empty ground, with a list price and a destination', () => {
  const ids = new Set(BILLBOARDS.map((b) => b.id))
  assert.equal(ids.size, BILLBOARDS.length)
  assert.deepEqual([...new Set(BILLBOARDS.map((b) => b.district))].sort(), [0, 1, 2, 3, 4])
  const built = new Set(initialLomeLife().city.buildings.map((b) => `${b.x}:${b.y}`))
  for (const b of BILLBOARDS) {
    assert.equal(districtIndexAt(b.x, b.y), b.district, b.id)
    assert.equal(terrainAt(b.x, b.y), 'grass', b.id)
    assert.ok(!built.has(`${b.x}:${b.y}`), `${b.id} overlaps a starting building`)
    assert.ok(b.priceWeek > 0 && b.headline.length > 3 && b.href.startsWith('/'))
  }
  assert.equal(billboardById('bb-centre')?.headline.includes('Haroo'), true)
  assert.equal(billboardById('nope'), null)
})

test('partner apps: FaîtiereHub services are free house slots, the rest are priced and open', () => {
  for (const a of PARTNER_APPS) {
    if (a.status === 'house') assert.equal(a.priceMonth, 0)
    else assert.ok(a.priceMonth > 0 && a.href.startsWith('/contact'))
  }
  assert.ok(PARTNER_APPS.some((a) => a.status === 'available'))
})

test('the inventory summary reports list prices as a ceiling and zero sales', () => {
  const s = inventorySummary()
  assert.equal(s.sold, 0)
  assert.equal(s.billboards, 5)
  assert.equal(s.billboardsAvailable, 3)
  assert.equal(s.billboardWeekCeiling, 15000 + 20000 + 15000)
  assert.equal(s.partnerAppsAvailable, 3)
  assert.equal(s.partnerMonthCeiling, 150000)
})
