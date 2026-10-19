import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isOrgOnlyPath, safeInternalPath } from '../lib/auth/safe-redirect'
import { extractCardNumber } from '../lib/verify/card-number'

const O = 'https://www.faitierehub.com'

describe('safeInternalPath', () => {
  it('keeps internal paths with their query and hash', () => {
    assert.equal(safeInternalPath('/haroolife', O), '/haroolife')
    assert.equal(safeInternalPath('/dashboard/members?page=2#x', O), '/dashboard/members?page=2#x')
  })
  it('refuses anything that leaves the site', () => {
    for (const raw of [
      '//evil.com',
      '/\\evil.com',
      'https://evil.com',
      'evil.com',
      '',
      null,
      undefined,
    ])
      assert.equal(safeInternalPath(raw, O), null, String(raw))
  })
  it('refuses auth pages only when asked (the middleware would bounce back to them)', () => {
    assert.equal(safeInternalPath('/auth/login', O, { refuseAuthPages: true }), null)
    assert.equal(safeInternalPath('/auth/verify-email', O), '/auth/verify-email')
  })
  it('recognises the organisation-only spaces', () => {
    assert.equal(isOrgOnlyPath('/dashboard'), true)
    assert.equal(isOrgOnlyPath('/dashboard/members'), true)
    assert.equal(isOrgOnlyPath('/admin?x=1'), true)
    assert.equal(isOrgOnlyPath('/haroolife'), false)
    assert.equal(isOrgOnlyPath('/dashboards-public'), false)
  })
})

describe('extractCardNumber', () => {
  it('reads a printed number, in any case', () => {
    assert.equal(extractCardNumber(' fen-66261 '), 'FEN-66261')
    assert.equal(extractCardNumber('HAR-481923'), 'HAR-481923')
  })
  it('reads the verification link of a QR code', () => {
    assert.equal(extractCardNumber('https://www.faitierehub.com/verify/FEN-66261'), 'FEN-66261')
  })
  it('rejects anything else', () => {
    for (const raw of ['', 'bonjour', 'FEN-1', '123456', 'https://example.com/x'])
      assert.equal(extractCardNumber(raw), null, raw)
  })
})
