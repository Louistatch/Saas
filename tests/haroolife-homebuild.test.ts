// HarooLife « Ma maison » : acheter un terrain à Lomé, bâtir étape par étape au rythme de
// l'argent, emménager et ne plus payer de loyer ; la sauvegarde est vérifiée.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BUILD_COST,
  PLOT_PRICES,
  STAGES,
  buyPlot,
  decodePlot,
  houseReady,
  moveIntoHouse,
  plotLabel,
  plotsForSale,
  settleBuild,
  startStage,
} from '../lib/haroolife/city/homebuild'
import { housingOf, moveTo, settleHousing } from '../lib/haroolife/city/housing'
import { type CityLife, decodeCityLife, initialCityLife } from '../lib/haroolife/city/life'
import { lotById, nameOwnedPlot, worldLots } from '../lib/haroolife/city/world'

const rich = (wallet: number, day = 1): CityLife => {
  const s = initialCityLife()
  return { ...s, locality: 'lome', life: { ...s.life, wallet, day, hour: 9 } }
}
const at = (s: CityLife, day: number): CityLife => ({ ...s, life: { ...s.life, day } })

test('terrains à vendre : des lots libres de Lomé, Agoè le moins cher, Baguida le plus cher', () => {
  const offers = plotsForSale(worldLots())
  assert.ok(offers.length >= 4)
  for (const o of offers) {
    assert.equal(o.lot.type, 'lot')
    assert.equal(o.lot.district, o.quartier)
    assert.equal(o.price, PLOT_PRICES[o.quartier])
  }
  const prices = offers.map((o) => o.price)
  assert.deepEqual(
    prices,
    [...prices].sort((a, b) => a - b),
  )
  assert.ok(PLOT_PRICES.agoe < PLOT_PRICES.baguida)
  // Deux au plus par quartier.
  for (const q of Object.keys(PLOT_PRICES))
    assert.ok(offers.filter((o) => o.quartier === q).length <= 2)
})

test('acheter un terrain : sur place, avec l’argent, une seule fois', () => {
  const offer = plotsForSale(worldLots())[0]
  const s = buyPlot(rich(1_000_000), offer.lot)
  assert.equal(s.plot?.lot, offer.lot.id)
  assert.equal(s.plot?.built, 0)
  assert.equal(s.life.wallet, 1_000_000 - offer.price)
  assert.match(s.life.lastEvent, /Ce terrain n’est pas à vendre/)
  assert.equal(plotLabel(s.plot as NonNullable<CityLife['plot']>), 'Mon terrain')
  // Pas deux terrains, pas sans argent, pas depuis Kara, pas un lot déjà bâti.
  assert.equal(buyPlot(s, plotsForSale(worldLots())[1].lot).plot?.lot, offer.lot.id)
  assert.equal(buyPlot(rich(1000), offer.lot).plot, undefined)
  assert.equal(buyPlot({ ...rich(1_000_000), locality: 'kara' }, offer.lot).plot, undefined)
  const house = worldLots().find((l) => l.type === 'house')
  assert.ok(house)
  assert.equal(buyPlot(rich(1_000_000), house).plot, undefined)
})

test('le chantier avance étape par étape, quand on paie, et le maçon prend ses jours', () => {
  const offer = plotsForSale(worldLots())[0]
  let s = buyPlot(rich(offer.price + BUILD_COST, 1), offer.lot)
  // Les fondations : payées, trois jours de travail.
  s = startStage(s)
  assert.equal(s.life.wallet, BUILD_COST - STAGES[0].cost)
  assert.deepEqual(s.plot?.work, { until: 1 + STAGES[0].days })
  assert.equal(plotLabel(s.plot as NonNullable<CityLife['plot']>), 'Mon chantier')
  // Pas deux étapes à la fois ; rien avant la fin des jours de travail.
  assert.equal(startStage(s).life.wallet, s.life.wallet)
  assert.equal(settleBuild(at(s, 3)).plot?.built, 0)
  s = settleBuild(at(s, 4))
  assert.equal(s.plot?.built, 1)
  assert.equal(s.plot?.work, null)
  assert.match(s.life.lastEvent, /fondations sont coulées/)
  assert.equal(settleBuild(s), s)
  // Le reste, jusqu'à la peinture.
  let day = 4
  while (!houseReady(s.plot)) {
    s = startStage(at(s, day))
    day = (s.plot?.work?.until as number) ?? day
    s = settleBuild(at(s, day))
  }
  assert.equal(s.plot?.built, STAGES.length)
  assert.equal(s.life.wallet, 0)
  assert.equal(plotLabel(s.plot as NonNullable<CityLife['plot']>), 'Ma maison')
  assert.match(startStage(s).life.lastEvent, /finie/)
})

test('sans argent, le chantier attend', () => {
  const offer = plotsForSale(worldLots())[0]
  const s = buyPlot(rich(offer.price + 1000), offer.lot)
  const waiting = startStage(s)
  assert.equal(waiting.plot?.work, null)
  assert.match(waiting.life.lastEvent, /Le chantier attend/)
})

test('emménager chez soi : la caution revient, plus de loyer ni de propriétaire, les factures restent', () => {
  const offer = plotsForSale(worldLots())[0]
  let s = buyPlot(rich(offer.price + BUILD_COST, 1), offer.lot)
  for (let i = 0; i < STAGES.length; i++) {
    s = startStage(s)
    s = settleBuild(at(s, s.plot?.work?.until as number))
  }
  const caution = housingOf(s).caution
  assert.ok(caution > 0)
  const home = moveIntoHouse(s)
  assert.equal(housingOf(home).owned, true)
  assert.equal(housingOf(home).rent, 0)
  assert.equal(housingOf(home).quartier, offer.quartier)
  assert.equal(home.life.wallet, s.life.wallet + caution)
  assert.equal(moveIntoHouse(home).life.wallet, home.life.wallet)
  // Deux mois plus tard : les factures, pas de loyer, personne ne frappe.
  const later = settleHousing(at(home, home.life.day + 70))
  const h = housingOf(later)
  assert.equal(h.debt.rent, 0)
  assert.ok(h.debt.ceet > 0 && h.debt.tde > 0)
  assert.equal(h.lateSince, null)
  assert.equal(h.step, 0)
  assert.match(later.life.lastEvent, /pas de loyer/)
  // On peut relouer ailleurs, puis rentrer chez soi.
  const rented = moveTo(
    {
      ...later,
      housing: { ...h, debt: { rent: 0, ceet: 0, tde: 0 } },
      life: { ...later.life, wallet: 500_000 },
    },
    'tokoin',
    'chambre',
  )
  assert.equal(housingOf(rented).owned, undefined)
  assert.equal(housingOf(moveIntoHouse(rented)).owned, true)
})

test('une dette empêche d’emménager tant qu’elle n’est pas payée', () => {
  const offer = plotsForSale(worldLots())[0]
  let s = buyPlot(rich(offer.price + BUILD_COST, 1), offer.lot)
  for (let i = 0; i < STAGES.length; i++) {
    s = startStage(s)
    s = settleBuild(at(s, s.plot?.work?.until as number))
  }
  const owing = { ...s, housing: { ...housingOf(s), debt: { rent: 25000, ceet: 0, tde: 0 } } }
  assert.equal(housingOf(moveIntoHouse(owing)).owned, undefined)
})

test('sauvegarde : le terrain revient, une sauvegarde trafiquée est corrigée', () => {
  const offer = plotsForSale(worldLots())[0]
  const s = startStage(buyPlot(rich(5_000_000), offer.lot))
  const back = decodeCityLife(JSON.parse(JSON.stringify(s)))
  assert.deepEqual(back?.plot, s.plot)
  assert.equal(decodePlot({ ...s.plot, built: 99 }), undefined)
  assert.equal(decodePlot({ ...s.plot, quartier: 'paris' }), undefined)
  assert.equal(decodePlot({ ...s.plot, built: STAGES.length })?.work, null)
  assert.equal(decodePlot('rien'), undefined)
})

test('dans la rue, le terrain du joueur porte son nom (et le reprend quand il change)', () => {
  const offer = plotsForSale(worldLots())[0]
  assert.equal(lotById(offer.lot.id)?.name, null)
  nameOwnedPlot(offer.lot.id, 'Mon chantier')
  assert.equal(lotById(offer.lot.id)?.name, 'Mon chantier')
  nameOwnedPlot(null, '')
  assert.equal(lotById(offer.lot.id)?.name, null)
})
