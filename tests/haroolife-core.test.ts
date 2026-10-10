import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type Group, commandSchema, displayState, progress } from '../lib/haroolife/core'

const request_id = '00000000-0000-4000-8000-000000000001'
test('rejects impossible dates, injected authority and invalid contributions', () => {
  const payload = {
    kind: 'work',
    title: 'Travaux',
    activity: 'semis',
    starts_on: '2099-02-28',
    ends_on: '2099-03-01',
    amount: 2,
  }
  const valid = { action: 'create', request_id, payload }
  assert.equal(commandSchema.safeParse(valid).success, true)
  for (const change of [
    { starts_on: '2099-02-30' },
    { amount: -1 },
    { amount: Number.POSITIVE_INFINITY },
    { owner_id: request_id },
  ]) {
    assert.equal(
      commandSchema.safeParse({ ...valid, payload: { ...payload, ...change } }).success,
      false,
    )
  }
  for (const action of ['leave', 'cancel'])
    assert.equal(
      commandSchema.safeParse({ action, request_id, payload: { group_id: request_id } }).success,
      true,
    )
})
test('expiry overrides readiness but preserves cancellation; progress stays bounded', () => {
  const group = { state: 'ready', expires_at: '2026-01-01T00:00:00Z' } as Group
  assert.equal(displayState(group, Date.parse('2026-01-02')), 'expired')
  assert.equal(displayState({ ...group, state: 'cancelled' }, Date.now()), 'cancelled')
  assert.equal(progress({ total: 12, target: 10 }), 100)
  assert.equal(progress({ total: 4, target: 10 }), 40)
  assert.equal(progress({ total: 1, target: 0 }), 0)
})
