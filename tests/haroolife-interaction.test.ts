import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ENTER_RADIUS,
  EXIT_RADIUS,
  interactionTargets,
  resolveInteraction,
} from '../lib/haroolife/city/interaction'
import {
  enterLot,
  goToEstate,
  initialCityLife,
  interiorFor,
  moveTo,
  walkStep,
} from '../lib/haroolife/city/life'
import { setLocality } from '../lib/haroolife/city/locality'
import { ESTATE, worldLots } from '../lib/haroolife/city/world'
import { enterBuilding, interact } from '../lib/haroolife/lome-life-engine'

setLocality('lome')
// The player's house is estate building (9, 9): world cell (58, 31).
const HOUSE = { x: ESTATE.x0 + 9, z: ESTATE.y0 + 9 }
const fresh = () => initialCityLife()

describe('interaction resolver (M0: entering one’s house)', () => {
  it('reproduces the bug: from the lawn west of the house, the old engine refuses entry', () => {
    // A new game: the estate engine still believes the player stands on road (11, 12).
    const s = moveTo(fresh(), { x: HOUSE.x - 1, y: HOUSE.z })
    assert.deepEqual(s.life.pos, { x: 11, y: 12 })
    assert.equal(interact(s.life, 'enter').inside, null)
  })
  it('the resolver finds the house from the continuous position on every side', () => {
    const s = fresh()
    for (const p of [
      { x: HOUSE.x - 0.78, z: HOUSE.z - 0.05 }, // west lawn, touching the wall (capsule 0.28)
      { x: HOUSE.x + 0.8, z: HOUSE.z }, // east
      { x: HOUSE.x, z: HOUSE.z - 0.8 }, // north
      { x: HOUSE.x - 0.02, z: HOUSE.z + 1.23 }, // south road, where "Rentrer chez moi" stops
    ]) {
      // Each time the avatar faces the house (heading = atan2(dx, dz) towards it).
      const heading = (Math.atan2(HOUSE.x - p.x, HOUSE.z - p.z) * 180) / Math.PI
      const t = resolveInteraction(s, p, null, null, heading)
      assert.ok(t, `target at ${p.x},${p.z}`)
      assert.equal(t.id, 'estate:9:9')
      assert.equal(t.label, 'Maison')
      assert.equal(t.isAccessible, true)
    }
  })
  it('entering through the resolver works whatever life.pos says', () => {
    const s = moveTo(fresh(), { x: HOUSE.x - 1, y: HOUSE.z })
    const t = resolveInteraction(s, { x: HOUSE.x - 0.78, z: HOUSE.z }, null)
    assert.ok(t && typeof t.ref !== 'string')
    const inside = enterBuilding(s.life, t.ref as { x: number; y: number })
    assert.equal(inside.inside, 'house')
    assert.equal(inside.lastEvent, 'Tu entres : Maison.')
  })
  it('half-cell borders: 0.49 cell past the adjacent cell centre is in, 0.51 is out', () => {
    const s = fresh()
    // Adjacent cell centre is 0.5 from the wall; ±0.49/0.51 along the axis.
    // North side: lawn, no other building nearby.
    const z = (d: number) => HOUSE.z - 1 - d
    assert.equal(resolveInteraction(s, { x: HOUSE.x, z: z(0.49) }, null)?.id, 'estate:9:9')
    assert.equal(resolveInteraction(s, { x: HOUSE.x, z: z(0.51) }, null), null)
    assert.equal(ENTER_RADIUS, 1)
  })
  it('hysteresis: the shown target stays until EXIT_RADIUS, a new one needs ENTER_RADIUS', () => {
    const s = fresh()
    const at = (d: number) => ({ x: HOUSE.x, z: HOUSE.z - 0.5 - d })
    assert.equal(resolveInteraction(s, at(1.2), null), null)
    assert.equal(resolveInteraction(s, at(1.2), 'estate:9:9')?.id, 'estate:9:9')
    assert.equal(resolveInteraction(s, at(EXIT_RADIUS + 0.01), 'estate:9:9'), null)
  })
  it('"Rentrer chez moi" keeps the house chosen along the route, past the well', () => {
    const going = goToEstate(fresh(), 9, 9)
    let s = going
    while (s.route.length) s = walkStep(s)
    assert.deepEqual(s.life.target, { x: 9, y: 9 })
    // Arrived on the south road, which the well (10, 10) also touches: the house still wins.
    const t = resolveInteraction(s, { x: s.at.x, z: s.at.y + 0.23 }, null)
    assert.equal(t?.id, 'estate:9:9')
  })
  it('"Rentrer chez moi" also works from the lawn, ending at the door on the road', () => {
    const lawn = moveTo(fresh(), { x: 52, y: 33 })
    let s = goToEstate(lawn, 9, 9)
    assert.ok(s.route.length > 0, s.life.lastEvent)
    while (s.route.length) s = walkStep(s)
    assert.deepEqual(s.at, { x: HOUSE.x, y: HOUSE.z + 1 })
    assert.equal(resolveInteraction(s, { x: s.at.x, z: s.at.y }, null)?.id, 'estate:9:9')
  })
  it('the selected destination wins over a nearer building', () => {
    const s = fresh()
    // (59, 31) lies between the house (58, 31) and the well (59, 32), both 0.5 away.
    const p = { x: HOUSE.x + 1, z: HOUSE.z }
    const near = interactionTargets(s, p).filter((t) => t.distance <= ENTER_RADIUS)
    assert.ok(near.length >= 2)
    const chosen = { ...s, life: { ...s.life, target: { x: 10, y: 10 } } }
    assert.equal(resolveInteraction(chosen, p, null)?.id, 'estate:10:10')
  })
  it('no target inside a building, and closed buildings say why', () => {
    const s = fresh()
    const inside = { ...s, life: { ...s.life, inside: 'house' as const } }
    assert.equal(resolveInteraction(inside, { x: HOUSE.x - 0.8, z: HOUSE.z }, null), null)
    const closed = worldLots().find((l) => interiorFor(l.type) === null)
    assert.ok(closed)
    const t = resolveInteraction(s, { x: closed.door.x, z: closed.door.y }, null)
    if (t && t.id === closed.id) {
      assert.equal(t.isAccessible, false)
      assert.equal(t.reason, 'Rien à visiter ici.')
    }
  })
  it('a city lot with an interior is entered from its door with enterLot', () => {
    const s = fresh()
    const lot = worldLots().find((l) => interiorFor(l.type) !== null && l.name)
    assert.ok(lot)
    const t = resolveInteraction(s, { x: lot.door.x + 0.3, z: lot.door.y - 0.2 }, null, lot.id)
    assert.equal(t?.id, lot.id)
    const pose = { x: lot.door.x + 0.3, z: lot.door.y - 0.2, heading: 90 }
    const inside = enterLot(s, lot, pose)
    assert.equal(inside.insideLot, lot.id)
    assert.deepEqual(inside.pose, pose)
  })
})
