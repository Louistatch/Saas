import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SIDEWALK, WALK_SIDE, streetDressing } from '../lib/haroolife/game/core/sidewalks'
import type { GroundKind } from '../lib/haroolife/game/core/street'

// A crossroads at (2,2) in a 5×5 block: one avenue along x, one street along y.
const cells: { x: number; y: number; kind: GroundKind }[] = []
for (let y = 0; y < 5; y++)
  for (let x = 0; x < 5; x++) cells.push({ x, y, kind: x === 2 || y === 2 ? 'road' : 'land' })

test('sidewalks line every road edge that faces a plot, never the carriageway', () => {
  const { sidewalks } = streetDressing(cells)
  // 8 arm cells × 2 plot edges; the crossroads itself faces no plot.
  assert.equal(sidewalks.length, 16)
  for (const s of sidewalks) {
    // Centred half a road + half a sidewalk from a road centre line, on the plot side.
    const offX = Math.abs(s.x - 2)
    const offY = Math.abs(s.y - 2)
    assert.ok(
      Math.abs(offX - (0.5 + SIDEWALK / 2)) < 1e-9 || Math.abs(offY - (0.5 + SIDEWALK / 2)) < 1e-9,
    )
    assert.ok(Math.min(s.w, s.h) === SIDEWALK)
  }
})

test('a zebra on each arm of the crossroads, where people on the sidewalk cross', () => {
  const { zebras } = streetDressing(cells)
  assert.equal(zebras.length, 4 * 5)
  // People walk WALK_SIDE from the centre line: the bars they cross lie at that distance.
  const east = zebras.filter((z) => z.x > 2 && Math.abs(z.y - 2) <= 0.5)
  assert.equal(east.length, 5)
  for (const z of east) assert.ok(z.x - z.w / 2 <= 2 + WALK_SIDE && 2 + WALK_SIDE <= z.x + z.w / 2)
  // No zebra on a straight street without a junction.
  const straight = streetDressing([0, 1, 2].map((x) => ({ x, y: 0, kind: 'road' as GroundKind })))
  assert.equal(straight.zebras.length, 0)
})
