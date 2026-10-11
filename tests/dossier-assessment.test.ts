import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assessDossier, compareForReview } from '../lib/professionals/core'

const now = Date.parse('2026-10-11T12:00:00Z')
const base = { faitiere_id: 'f1', photo_url: 'p.jpg', created_at: '2026-10-07T12:00:00Z' }

test('a complete dossier is ready, with its waiting time', () => {
  const a = assessDossier(base, ['diplome', 'piece_identite'], now)
  assert.equal(a.verdict, 'pret')
  assert.deepEqual(a.missing, [])
  assert.equal(a.waitingDays, 4)
  assert.equal(a.suggestedReason, null)
})

test('missing photo does not block; missing documents do and are named in the reason', () => {
  assert.equal(
    assessDossier({ ...base, photo_url: null }, ['attestation', 'piece_identite'], now).verdict,
    'pret',
  )
  const a = assessDossier(base, ['diplome'], now)
  assert.equal(a.verdict, 'incomplet')
  assert.deepEqual(a.missing, ['piece_identite'])
  assert.match(a.suggestedReason ?? '', /pièce d’identité/)
})

test('no faitiere wins over everything and review order puts ready and oldest first', () => {
  const noFaitiere = assessDossier(
    { ...base, faitiere_id: null },
    ['diplome', 'piece_identite'],
    now,
  )
  assert.equal(noFaitiere.verdict, 'sans_faitiere')
  const readyNew = assessDossier(
    { ...base, created_at: '2026-10-11T08:00:00Z' },
    ['diplome', 'piece_identite'],
    now,
  )
  const readyOld = assessDossier(base, ['diplome', 'piece_identite'], now)
  const incomplete = assessDossier(base, [], now)
  const sorted = [incomplete, readyNew, noFaitiere, readyOld].sort(compareForReview)
  assert.deepEqual(sorted, [readyOld, readyNew, incomplete, noFaitiere])
})
