import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  advanceLifeHour, chooseTransport, directTo, initialLomeLife,
  interact, TRAVEL_COST, walkLifeStep,
} from '../lib/haroolife/lome-life-engine'

test('auto-walking follows roads without skipping time or spending money', () => {
  const start=initialLomeLife()
  let moving=directTo(start,{x:12,y:11})
  assert.ok(moving.route.length>0)
  const distance=moving.route.length
  for(let i=0;i<distance;i++)moving=walkLifeStep(moving)
  assert.equal(moving.route.length,0)
  assert.equal(moving.hour,start.hour)
  assert.equal(moving.day,start.day)
  assert.equal(moving.wallet,start.wallet)
  assert.equal(Math.abs(moving.pos.x-12)+Math.abs(moving.pos.y-11),1)
  assert.match(moving.lastEvent,/Destination atteinte/)
})
test('route cancellation if roads disappear; never teleports off connected road',()=>{
  let state=directTo(initialLomeLife(),{x:12,y:11})
  assert.ok(state.route.length>0)
  const p=state.route[0]
  const gone={...state.city,buildings:state.city.buildings.filter(b=>!(b.x===p.x&&b.y===p.y))}
  state=walkLifeStep({...state,city:gone})
  assert.equal(state.route.length,0)
  assert.match(state.lastEvent,/interrompu/)
})
test('paid transport charges only fictional wallet and credits city treasury once',()=>{
  const initial=directTo(initialLomeLife(),{x:12,y:11})
  const next=chooseTransport(initial,'moto')
  assert.equal(next.wallet,initial.wallet-TRAVEL_COST.moto)
  assert.equal(next.city.coins,initial.city.coins+TRAVEL_COST.moto)
  assert.equal(next.spent,initial.spent+TRAVEL_COST.moto)
  assert.equal(walkLifeStep(next).wallet,next.wallet)
  assert.equal(chooseTransport(initial,'walk').wallet,initial.wallet)
  assert.match(chooseTransport({...initial,wallet:0},'taxi').lastEvent,/insuffisant/)
  assert.match(chooseTransport({...initial,route:[]},'taxi').lastEvent,/destination/)
})
test('main daily mechanics still exist with independent real-time movement',()=>{
  const start=initialLomeLife()
  let s=directTo(start,{x:12,y:11})
  while(s.route.length)s=walkLifeStep(s)
  const bought=interact(s,'buy-meal')
  assert.equal(bought.wallet,start.wallet-650)
  const fed=interact(bought,'eat')
  assert.ok(fed.needs.hunger>s.needs.hunger)
  const paid=interact(fed,'work')
  assert.ok(paid.wallet>fed.wallet)
  const tomorrow=advanceLifeHour({...paid,hour:23})
  assert.equal(tomorrow.day,2)
  assert.equal(tomorrow.workToday,false)
})
