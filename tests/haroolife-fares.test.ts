// HarooLife : le métier de zémidjan / taxi. Prix à la course, destination choisie, dépôt,
// paiement (argent du jeu uniquement).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  bearingTo,
  canDrop,
  completeFare,
  fareFor,
  pickDestination,
  remaining,
  startFare,
} from '../lib/haroolife/city/fares'
import { initialCityLife } from '../lib/haroolife/city/life'
import type { Lot } from '../lib/haroolife/city/world'

const lot = (id: string, name: string | null, x: number, y: number): Lot => ({
  id,
  type: 'market',
  district: 'd',
  x,
  y,
  w: 2,
  h: 2,
  floors: 1,
  name,
  door: { x, y },
})
const PLACES = [
  lot('near', 'Kiosque', 3, 0),
  lot('mid', 'Grand marché', 20, 0),
  lot('far', 'Port', 90, 0),
  lot('anon', null, 15, 0),
]

test('prix : minimum, par case, arrondi à 50, taxi plus cher que zémidjan', () => {
  assert.equal(fareFor(0, 'moto'), 200)
  assert.equal(fareFor(12, 'moto'), 500)
  assert.equal(fareFor(13, 'moto'), 550) // 525 arrondi
  assert.ok(fareFor(12, 'taxi') > fareFor(12, 'moto'))
  for (const n of [0, 7, 19, 40]) assert.equal(fareFor(n, 'taxi') % 50, 0)
})

test('destination : un lieu nommé, ni trop près ni à l’autre bout de la ville', () => {
  for (const r of [0, 0.3, 0.99])
    assert.deepEqual(pickDestination({ x: 0, y: 0 }, () => r, PLACES), {
      lotId: 'mid',
      name: 'Grand marché',
      x: 20,
      y: 0,
    })
  // Aucun lieu à bonne distance : n'importe quel lieu nommé plutôt que rien.
  const only = pickDestination({ x: 0, y: 0 }, () => 0, [PLACES[0]])
  assert.equal(only?.name, 'Kiosque')
  assert.equal(pickDestination({ x: 0, y: 0 }, () => 0, [PLACES[3]]), null)
})

test('course : prise en charge, distance, direction, dépôt seulement arrêté devant la porte', () => {
  const fare = startFare('Abla', { x: 0, y: 0 }, 'moto', () => 0, PLACES)
  assert.ok(fare)
  if (!fare) return
  assert.equal(fare.passenger, 'Abla')
  assert.equal(fare.cells, 20)
  assert.equal(fare.price, fareFor(20, 'moto'))
  assert.equal(remaining(fare, { x: 0, z: 0 }), 20)
  assert.equal(Math.round(bearingTo(fare, { x: 0, z: 0 })), 90) // vers +X
  assert.equal(canDrop(fare, { x: 10, z: 0 }, 0), false) // trop loin
  assert.equal(canDrop(fare, { x: 19, z: 0 }, 3), false) // roule encore
  assert.equal(canDrop(fare, { x: 19, z: 0.5 }, 0.2), true)
})

test('paiement : le portefeuille et les gains montent du prix de la course, une ligne au journal', () => {
  const s = initialCityLife()
  const fare = startFare('Kossi', { x: 0, y: 0 }, 'taxi', () => 0, PLACES)
  assert.ok(fare)
  if (!fare) return
  const after = completeFare(s, fare, 'taxi')
  assert.equal(after.life.wallet, s.life.wallet + fare.price)
  assert.equal(after.life.earned, s.life.earned + fare.price)
  assert.match(after.life.events[0], /Kossi est arrivé·e à Grand marché : \+\d+ FCFA \(taxi\)/)
})
