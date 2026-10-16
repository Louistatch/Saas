// HarooLife « Mon champ » : saisons réelles (sud à deux saisons, nord à une), entretien, récolte
// et vente au prix réel, sauvegarde vérifiée.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CROPS,
  decodeFarm,
  fieldStatus,
  harvest,
  nextSowing,
  realMonth,
  sell,
  sow,
  sowableNow,
  tend,
} from '../lib/haroolife/city/farm'
import { type CityLife, decodeCityLife, initialCityLife } from '../lib/haroolife/city/life'

const at = (s: CityLife, day: number, hour = 9): CityLife => ({
  ...s,
  life: { ...s.life, day, hour, needs: { ...s.life.needs, energy: 100 } },
})

test('saisons : Lomé sème deux fois par an, Kara une seule', () => {
  assert.deepEqual(sowableNow('lome', 10), ['mais', 'haricot'])
  assert.deepEqual(sowableNow('lome', 4), ['mais', 'haricot'])
  assert.deepEqual(sowableNow('lome', 7), [])
  assert.deepEqual(sowableNow('kara', 6), ['mais', 'sorgho', 'mil', 'soja'])
  assert.deepEqual(sowableNow('kara', 10), [])
  assert.deepEqual(nextSowing('kara', 10), { month: 5, crops: ['mais', 'sorgho', 'mil'] })
  assert.deepEqual(nextSowing('lome', 7)?.month, 9)
  // Le mois réel est celui de Lomé (UTC+0).
  assert.equal(realMonth(new Date('2026-10-31T23:30:00Z')), 10)
  assert.equal(realMonth(new Date('2026-11-01T00:10:00Z')), 11)
})

test('un champ de maïs entretenu chaque jour donne toute sa récolte, vendue au prix réel', () => {
  let s = at({ ...initialCityLife(), locality: 'lome' }, 1)
  const wallet = s.life.wallet
  // Hors saison : refusé, avec le prochain mois.
  assert.equal(sow(s, 'mais', 7).farm, undefined)
  assert.match(sow(s, 'mais', 7).life.lastEvent, /septembre/)
  s = sow(s, 'mais', 10)
  assert.equal(s.life.wallet, wallet - CROPS.mais.cost)
  assert.equal(fieldStatus(s).kind, 'growing')
  // Un passage par jour, pas deux.
  s = tend(s)
  assert.equal(s.farm?.field?.tended, 1)
  assert.equal(tend(s).farm?.field?.tended, 1)
  for (let day = 2; day <= 4; day++) s = tend(at(s, day))
  assert.equal(s.farm?.field?.tended, 4)
  // Pas mûr avant le jour 5 (semé le jour 1, 4 jours).
  assert.equal(harvest(at(s, 4)).farm?.field?.crop, 'mais')
  s = harvest(at(s, 5))
  assert.equal(s.farm?.field, null)
  assert.equal(s.farm?.stock.mais, CROPS.mais.kg)
  // Vente au prix du marché relevé (143 FCFA/kg à Lomé en octobre 2026).
  const before = s.life.wallet
  s = sell(s, 'mais', 143)
  assert.equal(s.life.wallet, before + Math.round(CROPS.mais.kg * 143))
  assert.equal(s.farm?.stock.mais, undefined)
  assert.equal(sell(s, 'mais', 143).life.wallet, s.life.wallet)
})

test('un champ négligé donne moins ; on ne travaille pas la nuit ni dans une autre ville', () => {
  let s = sow(at({ ...initialCityLife(), locality: 'lome' }, 1), 'haricot', 10)
  assert.equal(tend(at(s, 1, 22)).farm?.field?.tended, 0)
  assert.equal(tend({ ...s, locality: 'kara' }).farm?.field?.tended, 0)
  s = harvest(at(s, 4))
  assert.equal(s.farm?.stock.haricot, Math.round(CROPS.haricot.kg * 0.4))
  // Un prix absent ou absurde ne vend rien.
  assert.equal(sell(s, 'haricot', 0).farm?.stock.haricot, Math.round(CROPS.haricot.kg * 0.4))
  assert.equal(sell(s, 'haricot', 999999).farm?.stock.haricot, Math.round(CROPS.haricot.kg * 0.4))
})

test('sauvegarde : le champ revient, une sauvegarde trafiquée est corrigée', () => {
  const s = sow(at({ ...initialCityLife(), locality: 'lome' }, 1), 'mais', 10)
  const back = decodeCityLife(JSON.parse(JSON.stringify(s)))
  assert.equal(back?.farm?.field?.crop, 'mais')
  assert.deepEqual(
    decodeFarm({ field: { crop: 'or', locality: 'lome' }, stock: { mais: 1e9, x: 3 } }),
    {
      field: null,
      stock: { mais: CROPS.mais.kg * 20 },
    },
  )
  assert.equal(decodeFarm('n’importe quoi'), undefined)
})
