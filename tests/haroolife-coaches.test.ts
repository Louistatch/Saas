// HarooLife : les cars entre villes. Compagnies réelles de la ligne Lomé – Kara, route RN1
// réelle (villes dans l'ordre, distances approximatives), prochain départ du jeu.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COMPANIES,
  RN1,
  coachTrip,
  companyById,
  nextDeparture,
  routeOf,
} from '../lib/haroolife/city/coaches'

test('les compagnies réelles de Lomé – Kara', () => {
  assert.deepEqual(
    COMPANIES.map((c) => c.name),
    ['Solim', 'Nagodé Transfert', 'CTT Rakieta'],
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
