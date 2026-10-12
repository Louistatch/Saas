import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_AVATAR,
  decodeAvatar,
  loadAvatar,
  pagneColor,
  saveAvatar,
} from '../lib/haroolife/city/avatar'

describe('avatar appearance', () => {
  it('decodes valid choices and rejects the rest', () => {
    assert.deepEqual(decodeAvatar({ v: 1, model: 'character-male-b', pagne: 3 }), {
      v: 1,
      model: 'character-male-b',
      pagne: 3,
    })
    assert.equal(decodeAvatar({ v: 1, model: 'robot', pagne: 1 }), null)
    assert.equal(decodeAvatar({ v: 1, model: 'character-male-a', pagne: 99 })?.pagne, 1)
    assert.equal(decodeAvatar('nope'), null)
  })
  it('round-trips through storage and falls back to the default', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    assert.deepEqual(loadAvatar(storage), DEFAULT_AVATAR)
    saveAvatar(storage, { v: 1, model: 'character-female-c', pagne: 5 })
    assert.deepEqual(loadAvatar(storage), { v: 1, model: 'character-female-c', pagne: 5 })
    assert.match(pagneColor(5), /^#/)
  })
})
