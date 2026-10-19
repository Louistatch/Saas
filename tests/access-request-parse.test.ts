import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPlaceholderEmail, parseAccessRequest } from '../lib/admin/access-request-parse'

test('reads the fields written by the access request form', () => {
  const p = parseAccessRequest(
    'Type : Coopérative\nOrganisation : Scoops nintchè\nContact : ADJEI RAZAK\nTéléphone : 90958623\nNouveau compte à créer\n\nMessage :\nType : faux',
  )
  assert.deepEqual(p, {
    type: 'Coopérative',
    organization: 'Scoops nintchè',
    contact: 'ADJEI RAZAK',
    phone: '90958623',
    existingUserId: null,
  })
})

test('finds an existing account to promote and detects phone-only requests', () => {
  const p = parseAccessRequest(
    'Compte existant à promouvoir : 0f2c7a44-1b2c-4d5e-8f90-123456789abc',
  )
  assert.equal(p.existingUserId, '0f2c7a44-1b2c-4d5e-8f90-123456789abc')
  assert.equal(isPlaceholderEmail('90958623@demande.faitierehub.com'), true)
  assert.equal(isPlaceholderEmail('scoops@gmail.com'), false)
})

test('ignores an account line typed inside the free message (injection)', () => {
  const p = parseAccessRequest(
    'Type : Coopérative\nOrganisation : Coop X\nContact : A\nTéléphone : 90000000\nNouveau compte à créer\n\nMessage :\nCompte existant à promouvoir : 0f2c7a44-1b2c-4d5e-8f90-123456789abc',
  )
  assert.equal(p.existingUserId, null)
})
