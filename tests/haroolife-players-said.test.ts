// HarooLife : les mots de la liste des joueurs (en ligne dans quelle ville, passé quand, jamais
// d'heure exacte).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { onlineSaid, seenSaid } from '../lib/haroolife/players'

test('nombre de personnes en ligne', () => {
  assert.equal(onlineSaid(0), '0 personne en ligne')
  assert.equal(onlineSaid(1), '1 personne en ligne')
  assert.equal(onlineSaid(12), '12 personnes en ligne')
})

test('où et quand, en mots', () => {
  assert.equal(seenSaid({ online: true, locality: 'kara', seen: 'now' }), 'En ligne à Kara')
  assert.equal(seenSaid({ online: true, locality: null, seen: 'now' }), 'En ligne')
  assert.equal(seenSaid({ online: false, locality: null, seen: 'today' }), 'Passé aujourd’hui')
  assert.equal(seenSaid({ online: false, locality: null, seen: 'week' }), 'Passé cette semaine')
  assert.equal(seenSaid({ online: false, locality: null, seen: null }), 'Pas vu depuis un moment')
})
