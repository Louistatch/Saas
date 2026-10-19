import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Model } from '../lib/haroolife/city/pack'
import { simplifyModel } from '../lib/haroolife/city/simplify'

/** A 2×2 grid of quads on the floor (8 triangles) with an extra thin detail strip. */
function grid(n: number): Model {
  const pos: number[] = []
  const nrm: number[] = []
  const col: number[] = []
  const idx: number[] = []
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const base = pos.length / 3
      for (const [dx, dz] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]) {
        pos.push((i + dx) / n, 0, (j + dz) / n)
        nrm.push(0, 1, 0)
        col.push(0.5, 0.6, 0.7)
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  return {
    pos: Float32Array.from(pos),
    nrm: Float32Array.from(nrm),
    col: Float32Array.from(col),
    idx: Uint32Array.from(idx),
  } as unknown as Model
}

describe('model simplification', () => {
  it('reduces a fine grid to far fewer triangles while keeping its extent', () => {
    const fine = grid(16) // 512 triangles
    const low = simplifyModel(fine, 4)
    const trisBefore = fine.idx.length / 3
    const trisAfter = low.idx.length / 3
    assert.ok(trisAfter < trisBefore / 4, `${trisBefore} → ${trisAfter}`)
    let maxX = 0
    for (let i = 0; i < low.pos.length; i += 3) maxX = Math.max(maxX, low.pos[i])
    assert.ok(maxX > 0.9, 'the far edge survives')
    assert.equal(low.pos.length / 3, low.idx.length, 'unwelded output: three vertices per face')
  })
  it('is identity on an empty model and keeps colours', () => {
    const empty = {
      pos: new Float32Array(0),
      nrm: new Float32Array(0),
      col: new Float32Array(0),
      idx: new Uint32Array(0),
    } as unknown as Model
    assert.equal(simplifyModel(empty, 8), empty)
    const low = simplifyModel(grid(8), 3)
    assert.ok(low.col.every((c, i) => Math.abs(c - [0.5, 0.6, 0.7][i % 3]) < 1e-6))
  })
})
