import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ORIGINS,
  ORIGIN_IDS,
  START_HOMES,
  arrivalLife,
  drawOrigin,
  homeRent,
  startMoney,
} from '../lib/haroolife/city/arrival'
import { decodeCityLife } from '../lib/haroolife/city/life'
import { settleTontine } from '../lib/haroolife/city/tontine'
import { advanceLifeHour, interact } from '../lib/haroolife/lome-life-engine'
import { decodeTraits } from '../lib/haroolife/traits'

const home = (id: string) => START_HOMES.find((h) => h.id === id) ?? START_HOMES[0]

test('the birth lottery: every family can come out, and none starts above a first save cap', () => {
  const seen = new Set(Array.from({ length: 60 }, (_, i) => drawOrigin(i / 60)))
  assert.deepEqual([...seen].sort(), [...ORIGIN_IDS].sort())
  assert.equal(drawOrigin(0.999999), ORIGIN_IDS[ORIGIN_IDS.length - 1])
  for (const id of ORIGIN_IDS) assert.ok(ORIGINS[id].wallet <= 100000, id)
})

test('the first home: the agency month is paid from the family money, a dear home leaves less', () => {
  const tokoin = home('tokoin-chambre-salon')
  assert.deepEqual(homeRent(tokoin), { amount: 55000, observed: true })
  assert.equal(startMoney('nana-benz', tokoin), 40000)
  assert.equal(startMoney('village', tokoin), null)
  assert.equal(startMoney('village', home('adidogome-chambre')), 7000)
  const s = arrivalLife({ traits: ['gourmand', 'bavard'], origin: 'nana-benz', home: tokoin })
  assert.equal(s.life.wallet, 40000)
  assert.equal(s.origin, 'nana-benz')
  assert.equal(s.housing?.quartier, 'tokoin')
  assert.equal(s.housing?.rent, 55000)
  assert.equal(s.housing?.caution, 165000)
  assert.deepEqual(s.life.traits, ['gourmand', 'bavard'])
  // The family's gifts: meals from the village, skills from a teacher's home.
  const v = arrivalLife({ traits: [], origin: 'village', home: home('adidogome-chambre') })
  assert.equal(v.life.meals, 1 + 5)
  assert.equal(v.life.traits, undefined)
  assert.equal(
    arrivalLife({ traits: [], origin: 'enseignant', home: home('be-chambre') }).skills,
    10,
  )
})

test('a new game survives the save round trip, with its traits, family and tontine', () => {
  const s = arrivalLife({
    traits: ['sportif', 'dormeur'],
    origin: 'tontine',
    home: home('be-chambre'),
  })
  const back = decodeCityLife(JSON.parse(JSON.stringify(s)))
  assert.ok(back)
  assert.deepEqual(back.life.traits, ['sportif', 'dormeur'])
  assert.equal(back.origin, 'tontine')
  assert.deepEqual(back.tontine, { left: 36000, weekly: 6000, week: 0 })
  // A forged save keeps two known traits at most.
  assert.deepEqual(decodeTraits(['gourmand', 'gourmand', 'pirate', 'propre', 'sportif']), [
    'gourmand',
    'propre',
  ])
  assert.equal(decodeTraits('gourmand'), undefined)
})

test('the tontine: 6 000 FCFA each new week, what is missing stays owed', () => {
  let s = arrivalLife({ traits: [], origin: 'tontine', home: home('be-chambre') })
  assert.equal(s.life.wallet, 10000)
  // Same week: nothing asked.
  assert.equal(settleTontine(s), s)
  s = { ...s, life: { ...s.life, day: 8 } }
  s = settleTontine(s)
  assert.equal(s.life.wallet, 4000)
  assert.equal(s.tontine?.left, 30000)
  // Two weeks later, 4 000 FCFA in the pocket for 12 000 due: she takes it all, 8 000 short.
  s = settleTontine({ ...s, life: { ...s.life, day: 22 } })
  assert.equal(s.life.wallet, 0)
  assert.equal(s.tontine?.left, 26000)
  assert.match(s.life.lastEvent, /il manque 8\s000 FCFA/)
  // One more week: 6 000 FCFA, never more than the week's share.
  s = settleTontine({ ...s, life: { ...s.life, day: 29, wallet: 50000 } })
  assert.equal(s.life.wallet, 44000)
  assert.equal(s.tontine?.left, 20000)
  // Four weeks later the last 20 000 FCFA are paid: the tontine is gone.
  s = settleTontine({ ...s, life: { ...s.life, day: 57 } })
  assert.equal(s.tontine, undefined)
  assert.equal(s.life.wallet, 24000)
  assert.match(s.life.lastEvent, /remboursée/)
})

test('each trait does what its card says, and nothing for the others', () => {
  const base = arrivalLife({ traits: [], origin: 'fonctionnaire', home: home('be-chambre') }).life
  const withTrait = (t: Parameters<typeof decodeTraits>[0]) => ({
    ...base,
    traits: decodeTraits(t),
  })
  // Gourmand·e: a meal fills hunger by 60 instead of 45.
  const hungry = { ...base, needs: { ...base.needs, hunger: 20 } }
  assert.equal(interact(hungry, 'eat').needs.hunger, 65)
  assert.equal(interact({ ...hungry, traits: ['gourmand'] }, 'eat').needs.hunger, 80)
  // Ambianceur·se: fun drops 3 an hour instead of 2.
  assert.equal(advanceLifeHour(base).needs.fun, base.needs.fun - 2)
  assert.equal(advanceLifeHour(withTrait(['ambianceur'])).needs.fun, base.needs.fun - 3)
  // Roi ou reine de la sieste: energy drops one point less.
  assert.equal(
    advanceLifeHour(withTrait(['dormeur'])).needs.energy,
    advanceLifeHour(base).needs.energy + 1,
  )
  // Toujours propre: hygiene drops every other hour only.
  const twoHours = (l: typeof base) => advanceLifeHour(advanceLifeHour(l)).needs.hygiene
  assert.equal(twoHours(base), base.needs.hygiene - 2)
  assert.equal(twoHours(withTrait(['propre'])), base.needs.hygiene - 1)
})
