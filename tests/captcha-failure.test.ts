import assert from 'node:assert/strict'
import { test } from 'node:test'
import { captchaExceptionCode, captchaFailure } from '../lib/auth/captcha-failure'

test('a domain or widget configuration error asks the site team to fix it, not the player’s network', () => {
  assert.equal(captchaFailure('110200').reason, 'domain')
  assert.equal(captchaFailure('400021').reason, 'domain')
  for (const code of ['110100', '110110', '400020', '400070'])
    assert.equal(captchaFailure(code).reason, 'configuration')
})

test('clock, interaction timeout and loading failures have distinct recovery instructions', () => {
  assert.equal(captchaFailure('200100').reason, 'clock-or-timeout')
  assert.equal(captchaFailure('110620').reason, 'interaction-timeout')
  assert.equal(captchaFailure('script-timeout').reason, 'loading')
  assert.equal(captchaFailure('200500').reason, 'loading')
})

test('diagnostics never propagate tokens, secrets or raw exceptions as a public code', () => {
  for (const value of [
    'XXXX.DUMMY.TOKEN.XXXX',
    '<script>alert(1)</script>',
    new Error('secret'),
    null,
  ])
    assert.equal(captchaFailure(value).code, 'unknown')
  assert.equal(captchaFailure('600010').reason, 'challenge')
  assert.equal(captchaExceptionCode({ code: 110100, message: 'sensitive' }), '110100')
  assert.equal(captchaExceptionCode({ code: 'sensitive', message: 'sensitive' }), 'render')
  assert.equal(captchaExceptionCode(new Error('script-timeout')), 'script-timeout')
})
