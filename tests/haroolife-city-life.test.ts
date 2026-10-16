import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  actionsFor,
  arrive,
  cityInteract,
  decodeCityLife,
  fromLegacy,
  goToEstate,
  goToLot,
  initialCityLife,
  interiorFor,
  payRide,
  stepDir,
  walkStep,
} from '../lib/haroolife/city/life'
import { landmarks, lotById, toWorld, worldLots } from '../lib/haroolife/city/world'
import { initialLomeLife, interact } from '../lib/haroolife/lome-life-engine'

const byName = (n: string) => landmarks().find((l) => l.name === n)!

test('the player starts in the estate and the engine position stays in sync while inside', () => {
  const s = initialCityLife()
  assert.deepEqual(s.at, { x: 48, y: 34 }) // the estate gate, on avenue x = 48
  const down = stepDir(s, 0, 1)
  assert.deepEqual(down.at, { x: 48, y: 35 })
  assert.deepEqual(down.life.pos, s.life.pos) // outside the fence the estate position is parked
  assert.deepEqual(stepDir(s, -1, 0).at, s.at) // west of the gate: a building, not a road
  // Walking back through the driveway syncs the estate position again.
  let back = goToEstate(s, 11, 10)
  for (let i = 0; i < 40 && back.route.length; i++) back = walkStep(back)
  assert.deepEqual(toWorld(back.life.pos), back.at)
  // Estate venues still work through the engine when standing next to them.
  const home = goToEstate(s, 9, 9)
  let w = home
  for (let i = 0; i < 40 && w.route.length; i++) w = walkStep(w)
  assert.equal(w.route.length, 0)
  assert.equal(interact(w.life, 'enter').inside, 'house')
})

test('walking to a landmark leaves the estate, follows roads, and enters its interior', () => {
  const s = initialCityLife()
  const market = byName('Grand marché d’Assigamé')
  let w = goToLot(s, market)
  assert.ok(w.route.length > 20, `route ${w.route.length}`)
  assert.equal(w.target, market.id)
  const hourBefore = w.life.hour
  for (let i = 0; i < 500 && w.route.length; i++) w = walkStep(w)
  assert.equal(w.route.length, 0)
  assert.deepEqual(w.at, market.door)
  assert.equal(w.life.hour, hourBefore)
  assert.match(w.life.lastEvent, /devant/)
  const inside = cityInteract(w, 'enter')
  assert.equal(inside.insideLot, market.id)
  assert.ok(inside.visited.includes(market.id))
  const wallet = inside.life.wallet
  const fed = cityInteract(inside, 'buy-meal')
  assert.equal(fed.life.wallet, wallet - 650)
  assert.equal(fed.life.meals, inside.life.meals + 1)
  assert.match(cityInteract(fed, 'train').life.lastEvent, /ne propose pas/)
  const out = cityInteract(fed, 'leave')
  assert.equal(out.insideLot, null)
})

test('each place category has an interior and actions with real consequences', () => {
  const s = initialCityLife()
  const gym = arrive(goToLot(s, byName('Salle Fitness Tokoin')))
  const trained = cityInteract(cityInteract(gym, 'enter'), 'train')
  assert.equal(trained.life.wallet, s.life.wallet - 500)
  assert.ok(trained.life.needs.fun > s.life.needs.fun)
  const chapel = cityInteract(arrive(goToLot(s, byName('Cathédrale du Sacré-Cœur'))), 'enter')
  assert.equal(interiorFor(lotById(chapel.insideLot!)!.type), 'chapel')
  assert.ok(cityInteract(chapel, 'pray').life.needs.social > s.life.needs.social)
  const clinic = cityInteract(arrive(goToLot(s, byName('CHU de Tokoin'))), 'enter')
  assert.equal(interiorFor(lotById(clinic.insideLot!)!.type), 'clinic')
  const cared = cityInteract(
    { ...clinic, life: { ...clinic.life, needs: { ...clinic.life.needs, energy: 20 } } },
    'care',
  )
  assert.equal(cared.life.needs.energy, 50)
  const uni = cityInteract(arrive(goToLot(s, byName('Université de Lomé'))), 'enter')
  assert.equal(cityInteract(uni, 'learn').skills, 1)
  const broke = { ...uni, life: { ...uni.life, wallet: 10 } }
  assert.match(cityInteract(broke, 'learn').life.lastEvent, /insuffisant/)
  assert.ok(actionsFor('bank').length === 1 && actionsFor('lot').length === 0)
  const hall = cityInteract(arrive(goToLot(s, byName('Hôtel de ville de Lomé'))), 'enter')
  const worked = cityInteract(hall, 'work-city')
  assert.equal(worked.life.wallet, hall.life.wallet + 1500)
  assert.match(cityInteract(worked, 'work-city').life.lastEvent, /déjà/)
})

test('a warehouse of the industrial zone leads to a paid odd job, once a day', () => {
  const s = initialCityLife()
  const depot = worldLots().find((l) => l.type === 'industry' && !l.service)
  assert.ok(depot, 'Lomé has an industrial zone')
  assert.equal(interiorFor(depot.type), 'hall')
  assert.deepEqual(
    actionsFor(depot.type).map((a) => a.id),
    ['work-city'],
  )
  const inside = cityInteract(arrive(goToLot(s, depot)), 'enter')
  assert.equal(inside.insideLot, depot.id)
  const worked = cityInteract(inside, 'work-city')
  assert.equal(worked.life.wallet, inside.life.wallet + 2200)
  assert.equal(cityInteract(worked, 'work-city').life.wallet, worked.life.wallet)
})

test('les gares et entrepôts proposent des métiers togolais distincts', () => {
  const station = actionsFor('station').find((action) => action.id === 'work-city')
  const industry = actionsFor('industry').find((action) => action.id === 'work-city')
  assert.match(station?.label ?? '', /Livrer/)
  assert.match(industry?.label ?? '', /produits agricoles/)
})

test('rides charge once and land at the destination; saves migrate and reload', () => {
  const s = initialCityLife()
  const going = goToLot(s, byName('Port de pêche de Bè'))
  const paid = payRide(going, 'moto')
  assert.equal(paid.life.wallet, s.life.wallet - 350)
  const landed = arrive(paid)
  assert.equal(landed.route.length, 0)
  assert.deepEqual(landed.at, byName('Port de pêche de Bè').door)
  const json = JSON.parse(JSON.stringify(landed))
  const back = decodeCityLife(json)
  assert.ok(back)
  assert.deepEqual(back.at, landed.at)
  assert.equal(decodeCityLife({ ...json, target: 'nope' }), null)
  assert.equal(decodeCityLife({ ...json, at: { x: 'a', y: 1 } }), null)
  // A save written before the city layer still loads, standing where the estate left the player.
  const legacy = fromLegacy(initialLomeLife())
  assert.deepEqual(legacy.at, toWorld(initialLomeLife().pos))
  assert.ok(decodeCityLife(JSON.parse(JSON.stringify(legacy))))
})
