import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  decodeHousing,
  electricityBill,
  housingOf,
  moveInCost,
  moveTo,
  payBill,
  quartierById,
  receiveGuest,
  settleHousing,
  waterBill,
} from '../lib/haroolife/city/housing'
import { decodeCityLife, initialCityLife } from '../lib/haroolife/city/life'

const at = (day: number, wallet = 0) => {
  const s = initialCityLife()
  return { ...s, life: { ...s.life, day, hour: 9, wallet } }
}
const advance = (s: ReturnType<typeof at>, day: number) =>
  settleHousing({ ...s, life: { ...s.life, day } })

test('CEET and TdE bills follow the real tariffs (before VAT)', () => {
  // < 2.2 kVA: 30 kWh at 60 F, then 93 F; meter rent and upkeep 1 000 F.
  assert.equal(electricityBill('chambre'), 30 * 60 + 1000)
  assert.equal(electricityBill('chambre-salon'), 30 * 60 + 15 * 93 + 1000)
  // ≥ 2.2 kVA: 93 / 130 F per kWh and 600 F per kVA.
  assert.equal(electricityBill('deux-chambres'), 90 * 93 + 1000 + Math.round(600 * 3.3))
  assert.equal(electricityBill('villa'), 120 * 93 + 230 * 130 + 1000 + Math.round(600 * 6.6))
  // Rooms share the compound meter at the social tranche; 15 m³ is billed whole at 380 F.
  assert.equal(waterBill('chambre-salon'), 6 * 190)
  assert.equal(waterBill('deux-chambres'), 15 * 380 + 720)
  assert.equal(waterBill('villa'), 35 * 500 + 765)
})

test('rents by quartier, observed or estimated; moving in at the legal maximum', () => {
  assert.equal(quartierById('tokoin')?.rents['chambre-salon'].amount, 55000)
  assert.equal(quartierById('tokoin')?.rents['chambre-salon'].observed, true)
  assert.equal(quartierById('baguida')?.rents.villa.amount, 1500000)
  assert.equal(quartierById('be')?.rents['chambre-salon'].observed, false)
  // Caution 3 months + advance 3 months (decree 2022-001/PR caps) + 1 month of agency.
  assert.deepEqual(moveInCost(35000), {
    caution: 105000,
    advance: 105000,
    agency: 35000,
    total: 245000,
  })
})

test('the advance pays the first months, then rent and bills are owed', () => {
  let s = settleHousing(at(1))
  const h0 = housingOf(s)
  assert.equal(h0.prepaid, 3)
  for (const day of [31, 61, 91]) s = advance(s, day)
  const h = housingOf(s)
  assert.equal(h.prepaid, 0)
  assert.equal(h.debt.rent, 0)
  assert.equal(h.debt.ceet, 3 * electricityBill('chambre-salon'))
  s = advance(s, 121)
  assert.equal(housingOf(s).debt.rent, 55000)
  assert.equal(housingOf(s).lateSince, 121)
  // Idempotent on the same day.
  assert.deepEqual(advance(s, 121).housing, s.housing)
})

test('the landlord: knock at 5 days, power cut at 10, lock changed at 30; caution pays', () => {
  let s = settleHousing(at(1))
  for (const day of [31, 61, 91, 121]) s = advance(s, day)
  s = advance(s, 126)
  assert.equal(housingOf(s).step, 1)
  assert.match(s.life.lastEvent, /a frappé à ta porte/)
  s = advance(s, 131)
  assert.equal(housingOf(s).step, 2)
  assert.match(s.life.lastEvent, /coupé le courant/)
  // Paying the rent puts the power back and ends the countdown.
  const paid = payBill({ ...s, life: { ...s.life, wallet: 100000 } }, 'rent')
  assert.equal(housingOf(paid).debt.rent, 0)
  assert.equal(housingOf(paid).step, 0)
  assert.equal(paid.life.wallet, 100000 - 55000)
  assert.match(paid.life.lastEvent, /remis le courant/)
  // Not paying: locked out a month after; the caution (3 × 55 000) pays the debt.
  s = advance(s, 151)
  const h = housingOf(s)
  assert.equal(h.evicted, true)
  assert.equal(h.debt.rent + h.debt.ceet + h.debt.tde, 0)
  assert.ok(h.caution < 165000)
  assert.match(s.life.lastEvent, /changé la serrure/)
})

test('moving: debts first, then caution, advance and agency; the old caution comes back', () => {
  const s = settleHousing(at(1, 300000))
  const refused = moveTo({ ...s, life: { ...s.life, wallet: 10 } }, 'agoe', 'deux-chambres')
  assert.match(refused.life.lastEvent, /Il faut/)
  const moved = moveTo(s, 'agoe', 'chambre')
  const h = housingOf(moved)
  assert.equal(h.quartier, 'agoe')
  assert.equal(h.rent, 18000)
  // Paid 7 × 18 000 = 126 000, got back the old caution 3 × 55 000 = 165 000.
  assert.equal(moved.life.wallet, 300000 - 126000 + 165000)
})

test('receiving a friend in the evening: drinks, social, once a day', () => {
  const s = settleHousing(at(1, 5000))
  assert.match(receiveGuest(s, 'Kossi').life.lastEvent, /On reçoit le soir/)
  const evening = { ...s, life: { ...s.life, hour: 19 } }
  const got = receiveGuest(evening, 'Kossi')
  assert.equal(got.life.wallet, 4000)
  assert.match(got.life.lastEvent, /Kossi est venu·e chez toi/)
  assert.match(receiveGuest(got, 'Afi').life.lastEvent, /déjà reçu/)
})

test('the home survives a save, and a hand-edited one is refused', () => {
  const s = settleHousing(at(40))
  const back = decodeCityLife(JSON.parse(JSON.stringify(s)))
  assert.deepEqual(back?.housing, s.housing)
  assert.equal(decodeHousing({ ...s.housing, rent: -5 }), undefined)
})
