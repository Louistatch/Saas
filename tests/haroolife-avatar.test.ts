import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_AVATAR,
  decodeAvatar,
  loadAvatar,
  pagneColor,
  saveAvatar,
} from '../lib/haroolife/city/avatar'
import {
  AVATAR_SPECS,
  FIGURE_HEIGHT,
  HAIR_COLOR,
  adultFor,
  avatarSpec,
  clipFor,
  figureScale,
  needsPagneWrap,
  recolorMap,
} from '../lib/haroolife/city/avatar-catalogue'

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
    // Adult characters and legacy mini characters share the same storage shape.
    assert.equal(decodeAvatar({ v: 1, model: 'kossi', pagne: 2 })?.model, 'kossi')
    assert.equal(DEFAULT_AVATAR.model, 'afi')
  })
  it('scales every model to the same world height and maps clips with a documented fallback', () => {
    const afi = avatarSpec('afi')
    const mini = avatarSpec('character-male-a')
    assert.ok(Math.abs(figureScale(afi) * afi.height - FIGURE_HEIGHT * afi.stature) < 1e-9)
    assert.equal(adultFor('character-male-b'), 'koffi')
    assert.equal(adultFor('afi'), 'afi')
    assert.ok(Math.abs(figureScale(mini) * mini.height - FIGURE_HEIGHT) < 1e-9)
    assert.equal(clipFor(afi, 'walk'), 'Walk')
    assert.equal(clipFor(afi, 'run'), 'Run')
    assert.equal(clipFor(afi, 'work'), 'Interact')
    assert.equal(clipFor(afi, 'sit'), 'Idle_Neutral', 'no sit clip in the pack: neutral pose')
    assert.equal(clipFor(mini, 'sit'), 'sit')
    assert.equal(needsPagneWrap(mini), true)
    assert.equal(needsPagneWrap(afi), false)
    assert.equal(recolorMap(afi, '#123456').get('Orange'), '#123456')
    assert.equal(recolorMap(afi).get('Hair_Brown'), HAIR_COLOR)
    // An NPC model name unknown to the catalogue still resolves to a mini character file.
    assert.match(avatarSpec('character-female-z').url, /mini-characters\/character-female-z\.glb$/)
    for (const s of AVATAR_SPECS) assert.ok(s.url.startsWith('/haroolife/vendor/'), s.id)
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
