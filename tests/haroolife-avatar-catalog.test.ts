import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { AVATAR_MODELS, DEFAULT_AVATAR, isAvatarModel } from '../lib/haroolife/city/avatar'
import {
  AVATAR_CATALOG,
  KENNEY_HEIGHT,
  avatarSpec,
  heightScale,
  playsOnce,
} from '../lib/haroolife/city/avatar-catalog'

const ACTIVITIES = [
  'idle',
  'walk',
  'run',
  'sit',
  'lift',
  'talk',
  'work',
  'pray',
  'rest',
  'drive',
  'enter',
] as const

describe('avatar catalogue', () => {
  it('describes every figure the player can choose, and the default', () => {
    for (const m of AVATAR_MODELS) {
      const spec = AVATAR_CATALOG[m.id]
      assert.ok(spec, `${m.id} missing from the catalogue`)
      assert.equal(spec.kind, m.kind)
      for (const a of ACTIVITIES) assert.equal(typeof spec.clips[a], 'string', `${m.id} ${a}`)
    }
    assert.ok(isAvatarModel(DEFAULT_AVATAR.model))
    assert.equal(avatarSpec('robot'), avatarSpec(DEFAULT_AVATAR.model))
  })
  it('scales every figure to the Kenney height and keeps the pagne for Kenney only', () => {
    for (const spec of Object.values(AVATAR_CATALOG)) {
      assert.ok(Math.abs(spec.height * heightScale(spec) - KENNEY_HEIGHT) < 1e-9, spec.id)
      assert.equal(spec.pagne !== null, spec.kind === 'kenney', spec.id)
      assert.ok(spec.url.startsWith('/haroolife/vendor/'), spec.url)
    }
    const human = avatarSpec('rb-male-04')
    assert.equal(human.kind, 'human')
    assert.ok(heightScale(human) < 0.4)
    assert.equal(playsOnce(human, human.clips.enter), true)
    assert.equal(playsOnce(human, human.clips.walk), false)
    assert.equal(playsOnce(avatarSpec('character-male-a'), 'interact-right'), false)
  })
  it('ships every referenced model file with its licence', () => {
    const pub = path.join(__dirname, '..', 'public')
    for (const spec of Object.values(AVATAR_CATALOG)) {
      const file = path.join(pub, spec.url)
      assert.ok(fs.existsSync(file), `${spec.url} missing`)
      const size = fs.statSync(file).size
      // A human avatar is one download on a phone: stay under 2.5 MB each.
      assert.ok(size < 2.5 * 1024 * 1024, `${spec.url} is ${size} bytes`)
      // The licence sits in the vendor folder (Rocketbox) or the kit folder above it (Kenney).
      const dir = path.dirname(file)
      const licence = [dir, path.dirname(dir)].some((d) =>
        fs.existsSync(path.join(d, 'LICENSE.txt')),
      )
      assert.ok(licence, `${spec.url} licence`)
    }
  })
})
