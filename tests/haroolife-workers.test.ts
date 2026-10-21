// HarooLife « Mon champ » : recruter un ouvrier (argent du jeu). Une réponse s'applique une seule
// fois ; acceptée, la paie quitte le portefeuille et l'ouvrier entretient le champ ; refusée,
// expirée ou retirée, rien n'est payé. Les voisins fictifs refusent toujours.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CROPS,
  caredDays,
  decodeFarm,
  fieldStatus,
  harvest,
  helperDays,
  sow,
  tend,
} from '../lib/haroolife/city/farm'
import { type CityLife, decodeCityLife, initialCityLife } from '../lib/haroolife/city/life'
import {
  EXCUSES,
  type FieldOffer,
  NEIGHBOURS,
  WAGE_PER_DAY,
  applyAnswer,
  excuseOf,
  helperSaid,
  neighboursOf,
  regionOf,
  wageFor,
} from '../lib/haroolife/city/workers'

const at = (s: CityLife, day: number, hour = 9): CityLife => ({
  ...s,
  life: { ...s.life, day, hour, needs: { ...s.life.needs, energy: 100 } },
})

const offer = (o: Partial<FieldOffer>): FieldOffer => ({
  id: 'offre-1',
  status: 'accepted',
  reason: null,
  days: 3,
  pay: wageFor(3),
  crop: 'mais',
  locality: 'lome',
  created_at: '2026-10-21T08:00:00Z',
  expires_at: '2026-10-22T08:00:00Z',
  answered_at: '2026-10-21T09:00:00Z',
  seen: false,
  worker: 'Afi',
  employer: '@kodjo',
  ...o,
})

const field = () => sow(at({ ...initialCityLife(), locality: 'lome' }, 1), 'mais', 10)

test('acceptée : payée une seule fois, l’ouvrier entretient le champ, récolte complète', () => {
  let s = field()
  const wallet = s.life.wallet
  const spent = s.life.spent
  s = applyAnswer(s, offer({}))
  assert.equal(s.life.wallet, wallet - 3 * WAGE_PER_DAY)
  assert.equal(s.life.spent, spent + 3 * WAGE_PER_DAY)
  assert.deepEqual(s.farm?.field?.helper, { name: 'Afi', offer: 'offre-1', from: 1, days: 3 })
  assert.match(s.life.lastEvent, /Afi a accepté : 3 jours au champ\. −4\s500 FCFA/)
  // Rejouée (autre appareil, rechargement) : rien ne bouge.
  assert.equal(applyAnswer(s, offer({})), s)
  // Les jours de l’ouvrier, le joueur ne passe pas : le bouton le dit.
  const status = fieldStatus(s)
  assert.equal(status.kind === 'growing' && status.tendedToday, true)
  assert.equal(tend(s).farm?.field?.tended, 0)
  assert.match(tend(s).life.lastEvent, /Afi s’occupe de ton champ aujourd’hui/)
  assert.match(helperSaid(s) ?? '', /aujourd’hui \(encore 2 jours ensuite\)/)
  assert.equal(caredDays(s.farm!.field!, 1), 1)
  assert.equal(caredDays(s.farm!.field!, 3), 3)
  // Jour 4 : le joueur reprend, la récolte est complète.
  s = tend(at(s, 4))
  assert.equal(s.farm?.field?.tended, 1)
  assert.match(helperSaid(s) ?? '', /Afi a fini ses 3 jours/)
  s = harvest(at(s, 5))
  assert.equal(s.farm?.stock.mais, CROPS.mais.kg)
})

test('le joueur déjà passé aujourd’hui : l’ouvrier commence demain', () => {
  let s = tend(field())
  s = applyAnswer(s, offer({ days: 1, pay: wageFor(1) }))
  assert.equal(s.farm?.field?.helper?.from, 2)
  assert.match(s.life.lastEvent, /une journée au champ à partir de demain/)
  assert.equal(helperSaid(s), 'Afi commence demain au champ.')
  assert.equal(caredDays(s.farm!.field!, 1), 1)
  assert.equal(caredDays(s.farm!.field!, 2), 2)
})

test('l’ouvrier ne compte que les jours de culture', () => {
  const s = applyAnswer(at(field(), 3), offer({}))
  // Semé le jour 1, mûr le jour 5 : du jour 3, seuls les jours 3 et 4 comptent.
  assert.equal(helperDays(s.farm!.field!), 2)
  assert.equal(caredDays(s.farm!.field!), 2)
})

test('refusée, expirée, retirée : rien n’est payé, la réponse s’applique une fois', () => {
  const s = field()
  for (const [status, said] of [
    ['declined', /Afi ne peut pas venir cette fois\. Rien n’a été payé\./],
    ['expired', /Afi n’a pas répondu à temps\. Rien n’a été payé\./],
    ['cancelled', /Proposition à Afi annulée : Le joueur n’a plus de quoi payer\./],
  ] as const) {
    const after = applyAnswer(
      s,
      offer({ status, reason: status === 'cancelled' ? 'Le joueur n’a plus de quoi payer' : null }),
    )
    assert.equal(after.life.wallet, s.life.wallet)
    assert.equal(after.farm?.field?.helper, undefined)
    assert.match(after.life.lastEvent, said)
    assert.deepEqual(after.farm?.answered, ['offre-1'])
    assert.equal(applyAnswer(after, offer({})), after)
  }
  // Encore en attente : rien.
  assert.equal(applyAnswer(s, offer({ status: 'pending' })), s)
})

test('acceptée mais le champ n’y est plus : payée quand même, le joueur le sait', () => {
  let s = harvest(at(field(), 5))
  const wallet = s.life.wallet
  s = applyAnswer(s, offer({ id: 'offre-2' }))
  assert.equal(s.life.wallet, wallet - 4500)
  assert.equal(s.farm?.field, null)
  assert.match(s.life.lastEvent, /Afi a fait le trajet, mais ton champ de maïs n’y était plus/)
})

test('sauvegarde : l’ouvrier et les réponses appliquées reviennent, une sauvegarde trafiquée est corrigée', () => {
  const s = applyAnswer(field(), offer({}))
  const back = decodeCityLife(JSON.parse(JSON.stringify(s)))
  assert.deepEqual(back?.farm?.field?.helper, { name: 'Afi', offer: 'offre-1', from: 1, days: 3 })
  assert.deepEqual(back?.farm?.answered, ['offre-1'])
  const raw = JSON.parse(JSON.stringify(s.farm))
  raw.field.helper.days = 30
  raw.answered = [1, 'b'.repeat(80), ...Array.from({ length: 20 }, (_, i) => `x${i}`)]
  const farm = decodeFarm(raw)
  assert.equal(farm?.field?.helper, undefined)
  assert.equal(farm?.answered?.length, 10)
  assert.equal(farm?.answered?.[0], 'b'.repeat(40))
})

test('voisins fictifs : toujours trois, les mêmes toute la journée, une excuse qui change', () => {
  const today = neighboursOf(12)
  assert.equal(today.length, 3)
  assert.equal(new Set(today.map((n) => n.name)).size, 3)
  assert.deepEqual(neighboursOf(12), today)
  for (const n of today) assert.ok(NEIGHBOURS.includes(n))
  const first = excuseOf('Kokou', 12, 0)
  assert.equal(excuseOf('Kokou', 12, 0), first)
  assert.ok(EXCUSES.includes(first))
  const said = new Set(Array.from({ length: 6 }, (_, i) => excuseOf('Kokou', 12, i)))
  assert.ok(said.size > 1)
})

test('région de la ville, comme la base la nomme', () => {
  assert.equal(regionOf('lome'), 'Maritime')
  assert.equal(regionOf('kpalime'), 'Plateaux')
  assert.equal(regionOf('atakpame'), 'Plateaux')
  assert.equal(regionOf('dapaong'), 'Savanes')
})
