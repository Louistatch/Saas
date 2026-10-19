import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  STREET_CAMERA_MODES,
  isStreetCameraMode,
  nextStreetCameraMode,
} from '../lib/haroolife/city/camera-modes'

test('street camera cycles through close, follow and district framings', () => {
  assert.equal(nextStreetCameraMode('close'), 'follow')
  assert.equal(nextStreetCameraMode('follow'), 'district')
  assert.equal(nextStreetCameraMode('district'), 'close')
  assert.ok(STREET_CAMERA_MODES.close.distance < STREET_CAMERA_MODES.follow.distance)
  assert.ok(STREET_CAMERA_MODES.follow.distance < STREET_CAMERA_MODES.district.distance)
})

test('only known street camera modes are restored from storage', () => {
  assert.equal(isStreetCameraMode('close'), true)
  assert.equal(isStreetCameraMode('district'), true)
  assert.equal(isStreetCameraMode('playcanvas'), false)
  assert.equal(isStreetCameraMode(null), false)
})
