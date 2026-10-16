import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_AVATAR,
  decodeAvatar,
  loadAvatar,
  pagneColor,
  saveAvatar,
  shownModel,
} from '../lib/haroolife/city/avatar'
import {
  AVATAR_SPECS,
  FIGURE_HEIGHT,
  HAIR_COLOR,
  STREET_SCALE,
  adultFor,
  avatarSpec,
  clipFor,
  clipRate,
  figureHeight,
  figureScale,
  recolorMap,
} from '../lib/haroolife/city/avatar-catalogue'

describe('avatar appearance', () => {
  it('decodes valid choices and rejects the rest', () => {
    assert.deepEqual(decodeAvatar({ v: 1, model: 'character-male-b', pagne: 3 }), {
      v: 1,
      model: 'koffi',
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
    assert.equal(mini.id, 'kossi')
    assert.ok(Math.abs(figureScale(mini) * mini.height - FIGURE_HEIGHT * mini.stature) < 1e-9)
    assert.equal(clipFor(afi, 'walk'), 'Walk')
    assert.equal(clipFor(afi, 'run'), 'Run')
    assert.equal(clipFor(afi, 'work'), 'Interact')
    assert.equal(clipFor(afi, 'sit'), 'Idle_Neutral', 'no sit clip in the pack: neutral pose')
    assert.equal(clipFor(mini, 'sit'), 'Idle_Neutral')
    assert.equal(clipFor(mini, 'drive'), 'HarooDrive')
    // V3: the pagne colours a garment (Afi's top), never the hair or the shoes; every other
    // garment has a chosen colour, so no light-grey `White` top is left on screen.
    assert.equal(recolorMap(afi, '#123456').get('White'), '#123456')
    assert.notEqual(recolorMap(afi).get('Orange'), undefined, 'trousers coloured')
    assert.equal(recolorMap(afi).get('Hair_Brown'), HAIR_COLOR)
    const abra = avatarSpec('abra')
    assert.equal(recolorMap(abra, '#123456').get('LimeGreen'), '#123456', 'the dress')
    assert.equal(recolorMap(abra, '#123456').get('Red'), HAIR_COLOR, 'Red is her hair')
    assert.equal(recolorMap(avatarSpec('kossi'), '#123456').get('LightBrown'), '#123456')
    assert.notEqual(recolorMap(avatarSpec('kossi'), '#123456').get('Red_Dark'), '#123456')
    // Unknown NPC names resolve to a shipped adult, never an arbitrary asset URL.
    assert.equal(avatarSpec('character-female-z').url, afi.url)
    assert.equal(avatarSpec('../../unknown.glb').url, afi.url)
    assert.equal(AVATAR_SPECS.length, 4)
    for (const spec of AVATAR_SPECS) assert.equal(spec.family, 'quaternius')
    for (const s of AVATAR_SPECS) assert.ok(s.url.startsWith('/haroolife/vendor/'), s.id)
  })
  it('faces the move direction: one yaw convention, measured 0 for every file', () => {
    // Both renderers turn the figure to `heading` (0 = +Z, atan2(dx, dz)); every file of the
    // catalogue faces +Z in bind pose and in its clips, so no file needs an extra turn.
    for (const s of AVATAR_SPECS) assert.equal(s.yaw, 0, s.id)
  })
  it('plays walk and run at the rate where the feet match the ground', () => {
    const afi = avatarSpec('afi')
    const h = figureHeight(afi, STREET_SCALE)
    assert.ok(Math.abs(clipRate(afi, 'walk', afi.pace.walk * h, STREET_SCALE) - 1) < 1e-9)
    assert.equal(clipRate(afi, 'idle', 3, STREET_SCALE), 1)
    assert.equal(clipRate(afi, 'walk', 0, STREET_SCALE), 1)
    assert.equal(clipRate(afi, 'run', 100, STREET_SCALE), 3, 'capped')
  })
  it('migrates every historic look to a dressed adult, including explicit classic choices', () => {
    const old = { v: 1 as const, model: 'character-male-b', pagne: 4 }
    assert.equal(shownModel(old), 'koffi')
    assert.equal(old.model, 'character-male-b', 'resolving a model does not mutate the input')
    assert.equal(shownModel({ ...old, model: 'character-female-c' }), 'afi')
    assert.equal(shownModel({ ...old, model: 'character-male-c' }), 'kossi')
    assert.equal(shownModel({ ...old, classic: true }), 'koffi')
    assert.deepEqual(decodeAvatar({ ...old, classic: true }), { v: 1, model: 'koffi', pagne: 4 })
    assert.equal(decodeAvatar({ ...old, classic: 'yes' })?.classic, undefined)
    assert.equal(shownModel({ v: 1, model: 'abra', pagne: 1 }), 'abra')
  })
  it('round-trips through storage and falls back to the default', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    assert.deepEqual(loadAvatar(storage), DEFAULT_AVATAR)
    saveAvatar(storage, { v: 1, model: 'character-female-c', pagne: 5 })
    assert.deepEqual(loadAvatar(storage), { v: 1, model: 'afi', pagne: 5 })
    assert.match(pagneColor(5), /^#/)
  })
})

it('persists the migration without touching game progress and preserves the look in a read-only store', () => {
  const old = JSON.stringify({ v: 1, model: 'character-male-b', pagne: 3, classic: true })
  const progress = JSON.stringify({ wallet: 5432, job: 'taxi' })
  const store = new Map([
    ['haroolife.avatar.v1', old],
    ['haroolife.lome-city.v1', progress],
  ])
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
  assert.deepEqual(loadAvatar(storage), { v: 1, model: 'koffi', pagne: 3 })
  assert.equal(store.get('haroolife.lome-city.v1'), progress)
  assert.doesNotMatch(store.get('haroolife.avatar.v1') ?? '', /classic|character-male/)
  const readOnly = {
    getItem: () => old,
    setItem: () => {
      throw Error('quota')
    },
  }
  assert.equal(loadAvatar(readOnly).model, 'koffi')
})
