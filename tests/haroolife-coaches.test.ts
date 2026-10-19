// HarooLife : les cars entre villes. Compagnies réelles de la ligne Lomé – Kara, route RN1
// réelle (villes dans l'ordre, distances approximatives), prochain départ du jeu.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COMPANIES,
  RN1,
  coachTrip,
  companiesBetween,
  companyById,
  nextDeparture,
  officialFare,
  routeOf,
} from '../lib/haroolife/city/coaches'
import { LOCALITY_IDS } from '../lib/haroolife/city/locality'

test('les compagnies réelles de Lomé – Kara', () => {
  assert.deepEqual(
    COMPANIES.map((c) => c.name),
    ['LK Transport', 'Solim', 'Nagodé Transfert', 'CTT Rakieta', 'Minibus de la gare routière'],
  )
  assert.equal(companyById('solim')?.fare, 7500)
  assert.equal(companyById('inconnue'), null)
})

test('la RN1 : villes dans l’ordre, du sud au nord, distances croissantes', () => {
  assert.deepEqual(
    RN1.map((s) => s.name),
    ['Lomé', 'Tsévié', 'Notsé', 'Atakpamé', 'Blitta', 'Sokodé', 'Kara'],
  )
  for (let i = 1; i < RN1.length; i++) {
    assert.ok(RN1[i].km > RN1[i - 1].km)
    assert.ok(RN1[i].lat > RN1[i - 1].lat)
  }
  assert.deepEqual(routeOf('kara', 'lome')?.map((s) => s.name)[0], 'Kara')
  assert.equal(routeOf('lome', 'lome'), null)
})

test('prochain départ : attente jusqu’à l’heure, le lendemain après le dernier car', () => {
  const solim = companyById('solim')
  assert.ok(solim)
  if (!solim) return
  assert.deepEqual(nextDeparture(solim, 6), { at: 6, wait: 0 })
  assert.deepEqual(nextDeparture(solim, 7), { at: 9, wait: 2 })
  assert.deepEqual(nextDeparture(solim, 22), { at: 6, wait: 8 })
  const t = coachTrip('lome', 'kara', solim, 7)
  assert.equal(t?.km, 413)
  assert.equal(t?.wait, 2)
  assert.equal(t?.hours, 7)
  assert.equal(coachTrip('lome', 'lome', solim, 7), null)
})

test('toutes les villes se rejoignent en car, au tarif officiel ou au prix réel des compagnies', () => {
  for (const a of LOCALITY_IDS)
    for (const b of LOCALITY_IDS) {
      if (a === b) continue
      const stops = routeOf(a, b)
      assert.ok(stops, `${a} → ${b}`)
      assert.ok(companiesBetween(a, b).length > 0, `${a} → ${b} : une compagnie`)
    }
  // Plafonds officiels depuis Lomé (arrêté n° 011/2024 du 10 décembre 2024).
  assert.deepEqual(
    ['kpalime', 'atakpame', 'sokode', 'kara', 'dapaong'].map((t) =>
      officialFare('lome', t as never),
    ),
    [2000, 2700, 5000, 5850, 8500],
  )
  const minibus = companyById('minibus')
  const lk = companyById('lk')
  const rakieta = companyById('rakieta')
  if (!minibus || !lk || !rakieta) throw new Error('compagnies')
  assert.equal(coachTrip('lome', 'kara', minibus, 6)?.fare, 5850)
  // Prix observés : LK 7 000 vers Kara et 10 000 vers Dapaong ; Rakieta vers 6 000.
  assert.equal(coachTrip('lome', 'kara', lk, 6)?.fare, 7000)
  assert.equal(coachTrip('dapaong', 'lome', lk, 6)?.fare, 10000)
  assert.equal(coachTrip('lome', 'kara', rakieta, 6)?.fare, 6000)
  // Kpalimé est sur sa propre route : pas de car de la RN1, le taxi-brousse y va.
  assert.equal(coachTrip('lome', 'kpalime', lk, 6), null)
  assert.deepEqual(
    routeOf('lome', 'kpalime')?.map((s) => s.name),
    ['Lomé', 'Assahoun', 'Kpalimé'],
  )
  // Durées proches du réel : Lomé – Kara ≈ 7 h, Lomé – Dapaong ≈ 11 h.
  assert.equal(coachTrip('lome', 'kara', lk, 6)?.hours, 7)
  assert.equal(coachTrip('lome', 'dapaong', lk, 6)?.hours, 11)
})
