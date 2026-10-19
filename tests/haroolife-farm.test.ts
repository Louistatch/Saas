// HarooLife « Mon champ » : saisons réelles (sud à deux saisons, nord à une), entretien, récolte
// et vente au prix réel, sauvegarde vérifiée.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BAG_PRICE,
  CROPS,
  CROP_IDS,
  MAX_BAGS,
  SOWING,
  buyBags,
  cropPrice,
  decodeFarm,
  fieldStatus,
  harvest,
  nextSowing,
  ofCrop,
  realMonth,
  ripeSaid,
  sell,
  settleStore,
  sow,
  sowableNow,
  tend,
  theCrop,
} from '../lib/haroolife/city/farm'
import { type CityLife, decodeCityLife, initialCityLife } from '../lib/haroolife/city/life'

const at = (s: CityLife, day: number, hour = 9): CityLife => ({
  ...s,
  life: { ...s.life, day, hour, needs: { ...s.life.needs, energy: 100 } },
})

test('saisons : Lomé sème deux fois par an, Kara une seule', () => {
  assert.deepEqual(sowableNow('lome', 10), [
    'mais',
    'haricot',
    'manioc',
    'tomate',
    'piment',
    'gombo',
  ])
  assert.deepEqual(sowableNow('lome', 4), [
    'mais',
    'haricot',
    'arachide',
    'manioc',
    'piment',
    'gombo',
  ])
  assert.deepEqual(sowableNow('lome', 7), [])
  assert.deepEqual(sowableNow('kara', 6), [
    'mais',
    'sorgho',
    'mil',
    'soja',
    'manioc',
    'arachide',
    'riz',
    'piment',
    'gombo',
    'cajou',
  ])
  assert.deepEqual(sowableNow('kara', 10), [])
  // Le maraîchage de saison sèche, arrosé à la main, reprend en novembre.
  assert.deepEqual(nextSowing('kara', 10), { month: 11, crops: ['tomate'] })
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

test('cultures de chez nous : chaque région a les siennes, au bon mois', () => {
  // Café et cacao à Kpalimé, igname à Sokodé, cajou au nord, tomates de saison sèche à Lomé.
  assert.ok(sowableNow('kpalime', 6).includes('cafe'))
  assert.ok(sowableNow('kpalime', 6).includes('cacao'))
  assert.ok(!sowableNow('kara', 6).includes('cafe'))
  assert.ok(sowableNow('sokode', 3).includes('igname'))
  assert.ok(sowableNow('dapaong', 6).includes('cajou'))
  assert.ok(sowableNow('lome', 12).includes('tomate'))
  // Chaque culture a un nom au marché, un prix indicatif et se sème quelque part.
  for (const id of CROP_IDS) {
    const c = CROPS[id]
    assert.ok(c.market && c.guide > 0 && c.kg > 0 && c.days > 0, id)
    assert.ok(
      Object.values(SOWING).some((plan) => plan[id]?.length),
      `${id} ne se sème nulle part`,
    )
  }
  // Un champ d'igname entretenu donne toute sa récolte au bout de 7 jours.
  let s = at(
    {
      ...initialCityLife(),
      locality: 'sokode',
      life: { ...initialCityLife().life, wallet: 50000 },
    },
    1,
  )
  s = sow(s, 'igname', 3)
  for (let day = 1; day <= 7; day++) s = tend(at(s, day))
  s = harvest(at(s, 8))
  assert.equal(s.farm?.stock.igname, CROPS.igname.kg)
})

test('le prix dit d’où il vient : relevé récent, référence de la région, sinon prix du jeu', () => {
  const recent = [
    { culture: 'Mais', price: 143, unit: 'kg', market: 'Hédzranawoé', observed_at: '2026-10-16' },
  ]
  const reference = [
    { culture: 'Igname', price: 330, unit: 'kg' },
    { culture: 'Palmier a huile', price: 850, unit: 'litre' },
    { culture: 'Mais', price: 999, unit: 'kg' },
  ]
  assert.deepEqual(cropPrice('mais', recent, reference), {
    price: 143,
    source: 'releve',
    market: 'Hédzranawoé',
    observedAt: '2026-10-16',
  })
  assert.equal(cropPrice('igname', recent, reference).source, 'reference')
  assert.equal(cropPrice('igname', recent, reference).price, 330)
  // Rien dans la région : le prix du jeu, annoncé comme tel.
  assert.deepEqual(cropPrice('cacao', recent, reference), {
    price: CROPS.cacao.guide,
    source: 'jeu',
    market: null,
    observedAt: null,
  })
})

test('grenier : à l’air les charançons mangent le maïs, en sac triple fond il se garde', () => {
  const rich = (s: CityLife): CityLife => ({ ...s, life: { ...s.life, wallet: 100000 } })
  let s = rich(at({ ...initialCityLife(), locality: 'lome' }, 1))
  s = sow(s, 'mais', 10)
  for (let day = 1; day <= 4; day++) s = tend(at(s, day))
  s = harvest(at(s, 5))
  assert.equal(s.farm?.stock.mais, 70)
  // Trois jours sans perte, puis un peu chaque jour (au moins 1 kg).
  const open = settleStore(at(s, 8))
  assert.equal(open.farm?.stock.mais, 70)
  const later = settleStore(at(open, 10))
  assert.equal(later.farm?.stock.mais, 70 - 2 - 2)
  assert.match(later.life.lastEvent, /charançons/)
  // Le même jour, rien de plus.
  assert.equal(settleStore(later).farm?.stock.mais, 66)
  // Avec un sac (100 kg), plus rien ne se perd, même un mois plus tard.
  const bagged = buyBags(s, 1)
  assert.equal(bagged.life.wallet, s.life.wallet - BAG_PRICE)
  assert.equal(bagged.farm?.bags, 1)
  assert.equal(settleStore(at(bagged, 40)).farm?.stock.mais, 70)
  // Des sacs, pas un magasin entier ; et pas sans argent.
  assert.equal(buyBags(bagged, 999).farm?.bags, MAX_BAGS)
  const broke = { ...bagged, life: { ...bagged.life, wallet: 100 } }
  assert.equal(buyBags(broke, 1).farm?.bags, 1)
})

test('grenier : les tomates pourrissent vite, la vente vide le grenier', () => {
  let s = at({ ...initialCityLife(), locality: 'lome' }, 1)
  s = { ...s, life: { ...s.life, wallet: 100000 } }
  s = sow(s, 'tomate', 12)
  for (let day = 1; day <= 3; day++) s = tend(at(s, day))
  s = harvest(at(s, 4))
  assert.equal(s.farm?.stock.tomate, 20)
  assert.match(s.life.lastEvent, /gâte vite/)
  // Deux jours de fraîcheur, puis 30 % par jour : un sac n'y fait rien.
  const bagged = buyBags(s, 1)
  const day7 = settleStore(at(bagged, 7))
  assert.equal(day7.farm?.stock.tomate, 20 - 6)
  assert.match(day7.life.lastEvent, /pourri/)
  // Au bout de deux semaines, il ne reste rien.
  assert.equal(settleStore(at(bagged, 20)).farm?.stock.tomate, undefined)
  const sold = sell(day7, 'tomate', 650)
  assert.equal(sold.farm?.stock.tomate, undefined)
  assert.equal(sold.farm?.since?.tomate, undefined)
})

test('sauvegarde du grenier : fraîcheur, sacs et dernier compte reviennent, vérifiés', () => {
  const back = decodeFarm({
    field: null,
    stock: { mais: 70, cafe: 10 },
    since: { mais: 5, cafe: 3, tomate: 2 },
    bags: 1e9,
    checked: 8,
  })
  assert.deepEqual(back, {
    field: null,
    stock: { mais: 70, cafe: 10 },
    since: { mais: 5, cafe: 3 },
    bags: MAX_BAGS,
    checked: 8,
  })
})

test('les mots justes : le maïs, la tomate, l’igname ; ta tomate est mûre', () => {
  assert.equal(theCrop('mais'), 'le maïs')
  assert.equal(theCrop('tomate'), 'la tomate')
  assert.equal(theCrop('igname'), 'l’igname')
  assert.equal(ofCrop('mais'), 'du maïs')
  assert.equal(ofCrop('tomate'), 'de la tomate')
  assert.equal(ofCrop('arachide'), 'de l’arachide')
  assert.equal(ripeSaid('mais'), 'Ton maïs est mûr : récolte-le dans Mon champ.')
  assert.equal(ripeSaid('tomate'), 'Ta tomate est mûre : récolte-la dans Mon champ.')
  assert.equal(ripeSaid('arachide'), 'Ton arachide est mûre : récolte-la dans Mon champ.')
  assert.equal(ripeSaid('igname'), 'Ton igname est mûr : récolte-le dans Mon champ.')
})
