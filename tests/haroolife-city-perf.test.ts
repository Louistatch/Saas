import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FrameRing, percentile } from '../lib/haroolife/city/perf'
import {
  PRESETS,
  autoQuality,
  isQuality,
  lowerQuality,
  renderPixelRatio,
} from '../lib/haroolife/city/quality'

test('frame ring reports percentiles of the last frames only', () => {
  const ring = new FrameRing(4)
  for (const ms of [100, 10, 20, 30, 40]) ring.push(ms) // the 100 falls out of the window
  const s = ring.summary()
  assert.equal(s.n, 4)
  assert.equal(s.p50, 20)
  assert.equal(s.p95, 40)
  assert.equal(s.max, 40)
  assert.equal(s.fps, 40)
  ring.push(Number.NaN)
  ring.push(-1)
  assert.equal(ring.summary().n, 4)
  assert.equal(percentile([], 50), 0)
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 99), 10)
})

test('quality presets are ordered and chosen from the device', () => {
  assert.ok(PRESETS.eco.maxPixelRatio < PRESETS.balanced.maxPixelRatio)
  assert.ok(PRESETS.balanced.maxPixelRatio <= PRESETS.high.maxPixelRatio)
  assert.ok(PRESETS.eco.maxAnimated < PRESETS.balanced.maxAnimated)
  assert.ok(PRESETS.balanced.maxAnimated < PRESETS.high.maxAnimated)
  assert.equal(autoQuality({ saveData: true, deviceMemory: 16, hardwareConcurrency: 16 }), 'eco')
  assert.equal(autoQuality({ mobile: true, deviceMemory: 2, hardwareConcurrency: 4 }), 'eco')
  assert.equal(autoQuality({ mobile: true, deviceMemory: 4, hardwareConcurrency: 8 }), 'balanced')
  assert.equal(autoQuality({ mobile: false, deviceMemory: 8, hardwareConcurrency: 8 }), 'high')
  assert.equal(autoQuality({ mobile: false, deviceMemory: 4, hardwareConcurrency: 4 }), 'balanced')
  assert.equal(isQuality('high'), true)
  assert.equal(isQuality('ultra'), false)
})

test('software rasterizers render at half resolution and quality steps down one level at a time', () => {
  assert.equal(renderPixelRatio('high', false), PRESETS.high.maxPixelRatio)
  assert.equal(renderPixelRatio('high', true), 0.5)
  assert.equal(renderPixelRatio('eco', true), 0.5)
  assert.equal(renderPixelRatio('eco', false), 1)
  assert.equal(lowerQuality('high'), 'balanced')
  assert.equal(lowerQuality('balanced'), 'eco')
  assert.equal(lowerQuality('eco'), null)
})
