import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSmsAcceptance } from '../lib/notifications/delivery'

test('SMS requires provider acceptance for exactly one recipient', () => {
  assert.deepEqual(parseSmsAcceptance({ SMSMessageData: { Recipients: [{ statusCode: 101 }] } }), {
    ok: true,
  })
  for (const payload of [
    null,
    {},
    { SMSMessageData: { Recipients: [] } },
    { SMSMessageData: { Recipients: [{ statusCode: 401 }] } },
  ]) {
    assert.equal(parseSmsAcceptance(payload).ok, false)
  }
})
