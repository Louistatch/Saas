import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ficheAccessRoutes } from '../lib/fiches/access-policy'

const fiche = (status: string, price: number, members = false) => ({
  status,
  price_non_member: price,
  is_free_for_members: members,
})

test('un compte vendu par la plateforme : achat seulement, pas de carte membre', () => {
  assert.deepEqual(ficheAccessRoutes(fiche('published', 1000)), {
    free: false,
    member: false,
    purchase: true,
  })
})

test('un compte de coopérative : gratuit avec la carte, payant sinon', () => {
  assert.deepEqual(ficheAccessRoutes(fiche('published', 500, true)), {
    free: false,
    member: true,
    purchase: true,
  })
})

test('prix nul : libre pour tous, sans carte', () => {
  assert.equal(ficheAccessRoutes(fiche('published', 0, true)).free, true)
  assert.equal(ficheAccessRoutes(fiche('published', 0, true)).member, false)
})

test('retiré de la vente : ceux qui ont payé gardent leur fichier, personne d’autre', () => {
  assert.deepEqual(ficheAccessRoutes(fiche('archived', 1000, true)), {
    free: false,
    member: false,
    purchase: true,
  })
  assert.equal(ficheAccessRoutes(fiche('archived', 0)).free, false)
})

test('un brouillon ne s’ouvre jamais', () => {
  assert.deepEqual(ficheAccessRoutes(fiche('draft', 0, true)), {
    free: false,
    member: false,
    purchase: false,
  })
})
