import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { layoutFor } from '../lib/haroolife/city/interiors'
import type { Interior } from '../lib/haroolife/city/life'
import { SHAPE_MATERIALS, footprintOf, shapeOf } from '../lib/haroolife/city/prop-shapes'
import { resolveRenderer } from '../lib/haroolife/engine/select'

describe('renderer selection', () => {
  it('defaults to the HarooLife engine (house), React Three Fiber for the other interiors', () => {
    assert.deepEqual(resolveRenderer('', null, undefined), {
      renderer: 'haroo',
      remember: null,
    })
  })
  it('takes ?engine= first and remembers it', () => {
    assert.deepEqual(resolveRenderer('?engine=three', 'playcanvas', 'playcanvas'), {
      renderer: 'three',
      remember: 'three',
    })
  })
  it('?engine=playcanvas is the way back from a remembered choice', () => {
    assert.deepEqual(resolveRenderer('?engine=playcanvas', 'three', undefined), {
      renderer: 'playcanvas',
      remember: 'playcanvas',
    })
  })
  it('then the remembered choice, then the environment', () => {
    assert.equal(resolveRenderer('', 'three', 'playcanvas').renderer, 'three')
    assert.equal(resolveRenderer('', null, 'three').renderer, 'three')
  })
  it('?engine=haroo is accepted and remembered', () => {
    assert.deepEqual(resolveRenderer('?engine=haroo', 'three', undefined), {
      renderer: 'haroo',
      remember: 'haroo',
    })
  })
  it('ignores unknown values', () => {
    assert.equal(resolveRenderer('?engine=unity', 'babylon', 'x').renderer, 'haroo')
  })
})

describe('shared prop shapes', () => {
  const interiors: Interior[] = [
    'house',
    'market',
    'bakery',
    'hall',
    'well',
    'park',
    'gym',
    'chapel',
    'clinic',
  ]
  it('every prop of every interior has a shape with known materials', () => {
    for (const name of interiors) {
      for (const p of layoutFor(name).props) {
        const parts = shapeOf(p.kind)
        assert.ok(parts.length > 0, `${name}/${p.id} (${p.kind}) has a shape`)
        for (const part of parts)
          if (part.t !== 'model') assert.ok(SHAPE_MATERIALS[part.m], `${part.m} is a material`)
      }
    }
  })
  it('a treadmill keeps its exact PlayCanvas geometry', () => {
    const t = shapeOf('treadmill')
    assert.equal(t.length, 8)
    assert.deepEqual(t[0], {
      t: 'box',
      p: [0, 0.07, 0.1],
      s: [0.72, 0.14, 1.6],
      m: 'dark',
      rot: undefined,
    })
  })
  it('footprints block equipment but leave mats and wall signs walkable', () => {
    const tm = footprintOf('treadmill')
    assert.ok(tm && tm.h > 1 && tm.hz > 0.7, 'treadmill blocks its whole length')
    const mat = footprintOf('mat')
    assert.ok(mat && mat.h < 0.15, 'a mat is thin enough to walk over')
    assert.equal(footprintOf('sign'), null, 'a sign high on the wall does not block the floor')
    assert.equal(footprintOf('bed'), null, 'models are measured once loaded')
  })
  it('flattened sub-groups keep their offsets (dumbbells sit on the rack)', () => {
    const bells = shapeOf('dumbbell-rack').filter((p) => p.t === 'cyl')
    assert.equal(bells.length, 15)
    assert.ok(bells.every((b) => b.t === 'cyl' && b.p[1] > 0.3))
  })
})
