import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Bank } from '../lib/haroolife/city/bank'
import type { Model } from '../lib/haroolife/city/pack'
import type { StreetBuilding } from '../lib/haroolife/game/core/street'
import { buildCityGeometry } from '../lib/haroolife/game/render/city-models'
import { cameraGrade, goldenSun, warmthOf } from '../lib/haroolife/game/render/street-atmosphere'
import { SWAY, WIND_REACH, swayWeight, windOffset } from '../lib/haroolife/game/render/street-wind'

/** A model one unit tall: a triangle with a vertex at its foot, its middle and its top. */
function stick(key: string): Model {
  return {
    key,
    pos: Float32Array.from([0, 0, 0, 0.2, 0.5, 0, 0, 1, 0.2]),
    nrm: Float32Array.from([1, 0, 0, 1, 0, 0, 1, 0, 0]),
    col: Float32Array.from([0.3, 0.5, 0.2, 0.3, 0.5, 0.2, 0.3, 0.5, 0.2]),
    idx: Uint32Array.from([0, 1, 2]),
    min: [0, 0, 0],
    max: [0.2, 1, 0.2],
    size: [0.2, 1, 0.2],
  }
}

const bank = {
  manifest: { models: {} },
  sizes: {},
  model: stick,
  lowModel: stick,
} as unknown as Bank

const estate = (type: string, x: number): StreetBuilding => ({
  id: `estate:${x}:0`,
  x,
  y: 0,
  w: 1,
  h: 1,
  floors: 1,
  type: type as StreetBuilding['type'],
  color: '#ffffff',
  roof: '#888888',
  name: null,
})

describe('wind in the street trees', () => {
  it('bends the crown, never the foot of the trunk', () => {
    assert.equal(swayWeight(1, 0), 0)
    assert.equal(swayWeight(1, 1), 1)
    assert.ok(swayWeight(1, 0.5) < swayWeight(1, 0.8))
    assert.equal(swayWeight(0.35, 1), 0.35)
  })

  it('the coconut palm bends most, the mango tree least; buildings not at all', () => {
    assert.ok(SWAY['lome-cocotier'] > SWAY['lome-neem'])
    assert.ok(SWAY['lome-neem'] > SWAY['lome-manguier'])
    assert.equal(SWAY['lome-concession'], undefined)
  })

  it('bakes the weights into the merged city: a tree sways, a house does not', () => {
    const g = buildCityGeometry(bank, [estate('park', 0), estate('house', 3)], true)
    const sway = g.getAttribute('sway')
    assert.ok(sway, 'sway attribute present')
    assert.equal(sway.count, g.getAttribute('position').count)
    // The park is the kit's tree (SWAY.tree), the house a building: its three vertices stay at 0.
    const tree = [0, 1, 2].map((i) => sway.getX(i))
    const house = [3, 4, 5].map((i) => sway.getX(i))
    assert.equal(tree[0], 0, 'foot of the trunk')
    assert.ok(tree[1] > 0 && tree[1] < tree[2], 'the middle moves less than the top')
    assert.ok(Math.abs(tree[2] - SWAY.tree) < 0.01, 'the top bends by the species weight')
    assert.deepEqual(house, [0, 0, 0])
  })

  it('stays within reach and never moves two neighbours in step', () => {
    let max = 0
    for (let t = 0; t < 120; t += 0.37) {
      const [dx, dz] = windOffset(t, 10, 4, 1, WIND_REACH)
      max = Math.max(max, Math.abs(dx), Math.abs(dz))
      assert.deepEqual(windOffset(t, 10, 4, 0, WIND_REACH).map(Math.abs), [0, 0])
    }
    assert.ok(max > 0.1, 'visible')
    assert.ok(max <= WIND_REACH, 'no tree bends further than the reach')
    const a = windOffset(30, 0, 0, 1, WIND_REACH)
    const b = windOffset(30, 6, 3, 1, WIND_REACH)
    assert.notDeepEqual(a, b)
  })

  it('stills every tree when the reach is 0 (reduced motion)', () => {
    assert.deepEqual(windOffset(42, 3, 7, 1, 0).map(Math.abs), [0, 0])
  })
})

describe('light that follows the hour', () => {
  // Sky colours of the day cycle (`daylight()` in city-world.tsx) at those hours.
  const SKY = {
    noon: '#9ed1e8',
    night: '#3b4f7a',
    dawn: '#c3997c',
    dusk: '#bd9175',
    late: '#767a8a',
  }

  it('reads how golden the hour is from the sky colour', () => {
    assert.equal(warmthOf(SKY.noon), 0)
    assert.ok(warmthOf(SKY.night) < 0.05)
    assert.ok(warmthOf(SKY.dawn) > 0.9)
    assert.ok(warmthOf(SKY.dusk) > 0.9)
    const late = warmthOf(SKY.late)
    assert.ok(late > 0.2 && late < 0.45, `a third of the way into dusk: ${late}`)
    assert.equal(warmthOf(undefined), 0)
  })

  it('daytime is unchanged; night is bluer; dawn and dusk are warmer', () => {
    assert.deepEqual(cameraGrade(1, 0), { exposure: 1, fill: '#eef3ff' })
    const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
    const [nr, , nb] = rgb(cameraGrade(0, 0).fill)
    assert.ok(nb > nr, 'moonlight is blue')
    const [gr, , gb] = rgb(cameraGrade(0.3, 1).fill)
    assert.ok(gr > gb, 'golden hour is warm')
  })

  it('dawn and dusk keep a low golden sun; day and night are untouched', () => {
    assert.deepEqual(goldenSun('#fffff5', 1, 0), { color: '#fffff5', boost: 0 })
    assert.deepEqual(goldenSun('#ccd9ff', 0, 0), { color: '#ccd9ff', boost: 0 })
    const dusk = goldenSun('#ccd9ff', 0, 1)
    const [r, , b] = [1, 3, 5].map((i) => Number.parseInt(dusk.color.slice(i, i + 2), 16))
    assert.ok(r > b, 'the dusk sun is warm, not moonlight')
    assert.ok(dusk.boost > 0)
  })

  it('night keeps the street readable on a phone: the blue fill is not darker overall', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const day = cameraGrade(1, 0)
    const night = cameraGrade(0, 0)
    assert.ok(night.exposure > day.exposure)
    assert.ok(lum(night.fill) * night.exposure >= lum(day.fill) * day.exposure * 0.9)
  })
})
