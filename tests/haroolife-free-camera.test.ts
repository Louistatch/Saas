import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cameraBasis } from '../lib/haroolife/city/player'
import {
  ORBIT_HOLD,
  chaseAngle,
  chasePose,
  freeFog,
  turnTowards,
} from '../lib/haroolife/game/render/free-camera'

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

describe('« Vue libre » : the chase camera behind the player', () => {
  it('turns the short way round', () => {
    assert.equal(turnTowards(350, 10), 20)
    assert.equal(turnTowards(10, 350), -20)
    assert.equal(turnTowards(0, 180), 180)
    assert.equal(turnTowards(90, 90), 0)
  })

  it('swings behind a moving player and settles there', () => {
    let angle = 35
    for (let i = 0; i < 300; i++) angle = chaseAngle(angle, 90, 1 / 60, true, false)
    assert.ok(close(angle, 270, 0.5), `behind a player facing east: ${angle}`)
  })

  it('stays put while the player stands still, or just after a hand orbit', () => {
    assert.equal(chaseAngle(35, 90, 0.5, false, false), 35)
    assert.equal(chaseAngle(35, 90, 0.5, true, false, ORBIT_HOLD / 2), 35)
    assert.notEqual(chaseAngle(35, 90, 0.5, true, false, ORBIT_HOLD + 0.1), 35)
  })

  it('pushing the stick forward walks away from the camera, so the swing never drifts', () => {
    for (const heading of [0, 45, 90, 200, 315]) {
      const { forward } = cameraBasis(heading + 180)
      const a = (heading * Math.PI) / 180
      assert.ok(
        close(forward.x, Math.sin(a)) && close(forward.z, Math.cos(a)),
        `heading ${heading}`,
      )
    }
  })

  it('stands behind and above the player and looks a little ahead of them', () => {
    // Player at the origin facing +z (heading 0): the camera sits at -z, looking towards +z.
    const pose = chasePose(0, 0, 180, 1, 1.15, false)
    assert.ok(pose.position[2] < -3, 'behind')
    assert.ok(pose.position[1] > 1.15, 'above the head')
    assert.ok(pose.look[2] > 0, 'looks ahead of the player')
    assert.ok(close(pose.position[0], 0, 1e-9) && close(pose.look[0], 0, 1e-9))
    // Further back when driving, and with the zoom.
    assert.ok(chasePose(0, 0, 180, 1, 1.15, true).position[2] < pose.position[2])
    assert.ok(chasePose(0, 0, 180, 2, 1.15, false).position[2] < pose.position[2])
  })

  it('the haze closes in before the edge of the drawn city', () => {
    const fog = freeFog(55)
    assert.ok(fog.near < fog.far && fog.far < 55)
  })
})
