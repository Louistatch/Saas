import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  gameReturnPath,
  gameReturnCookiePath,
  withGameReturn,
  resolveGameReturn,
} from '../lib/haroolife/entry'

test('game return accepts existing HarooLife routes with their query, never another host or auth loop', () => {
  for (const path of [
    '/haroolife',
    '/haroolife/territoire/lome?engine=three',
    '/haroolife/territoire/carte#lieux',
  ])
    assert.equal(gameReturnPath(path), path)
  for (const path of [
    '//evil.test/haroolife',
    '/\\evil.test/haroolife',
    'https://evil.test/haroolife',
    '/auth/login',
    '/haroolife-other',
    '/dashboard',
    '/haroolife/../../admin',
    '/haroolife/%2e%2e/admin',
  ])
    assert.equal(gameReturnPath(path), null, path)
  assert.equal(gameReturnCookiePath('%2Fharoolife%3Fengine%3Dthree'), '/haroolife?engine=three')
  assert.equal(gameReturnCookiePath('%broken'), null)
  assert.equal(resolveGameReturn('/operator/training', '%2Fharoolife'), null)
  assert.equal(resolveGameReturn('//evil.test', '%2Fharoolife'), null)
  assert.equal(resolveGameReturn(null, '%2Fharoolife'), '/haroolife')
})

test('registration links preserve the profession and game intent, with other account flows unchanged', () => {
  const link = new URL(
    withGameReturn('/auth/signup/haroo?type=AGRONOME', '/haroolife?engine=three'),
    'https://faitierehub.test',
  )
  assert.equal(link.searchParams.get('type'), 'AGRONOME')
  assert.equal(link.searchParams.get('redirect'), '/haroolife?engine=three')
  assert.equal(
    withGameReturn('/auth/login?redirect=/operator/training', null),
    '/auth/login?redirect=/operator/training',
  )
  assert.equal(
    withGameReturn('/auth/login?redirect=/operator/training', '/haroolife'),
    '/auth/login?redirect=%2Fharoolife',
  )
  assert.equal(withGameReturn('/auth/login', '//evil.test'), '/auth/login')
})
