import assert from 'node:assert/strict'
import { test } from 'node:test'
import { errorFingerprint } from '../lib/errors/record'

test('groups the same error across ids and numbers, separates different errors', () => {
  const a = errorFingerprint(
    'serveur',
    '/api/professionals/0f2c7a44-1b2c-4d5e-8f90-123456789abc/decision',
    'Timeout after 3000 ms',
  )
  const b = errorFingerprint(
    'serveur',
    '/api/professionals/11111111-2222-4333-8444-555555555555/decision?x=1',
    'Timeout after 8000 ms',
  )
  assert.equal(a, b)
  assert.notEqual(
    a,
    errorFingerprint('navigateur', '/api/professionals/x/decision', 'Timeout after 3000 ms'),
  )
  assert.notEqual(a, errorFingerprint('serveur', '/api/haroolife', 'Timeout after 3000 ms'))
  assert.equal(a.length, 64)
})
