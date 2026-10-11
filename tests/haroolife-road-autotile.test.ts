import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roadAutoTile, N, E, S, W } from '../lib/haroolife/vendor/cimulity-road-autotile'

test('Cimulity road-autotile classifies every main topology', () => {
  const check=(mask:number, kind:string)=>{
    const roads = new Set<string>()
    if(mask & N)roads.add('0,-1')
    if(mask & E)roads.add('1,0')
    if(mask & S)roads.add('0,1')
    if(mask & W)roads.add('-1,0')
    assert.equal(roadAutoTile((dx,dy)=>roads.has(dx+','+dy)).kind,kind)
  }
  check(0,'isolated')
  check(N,'end')
  check(N|S,'straight')
  check(E|W,'straight')
  check(N|E,'corner')
  check(N|E|S,'tee')
  check(N|E|S|W,'cross')
})
