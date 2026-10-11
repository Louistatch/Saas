import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EVENT_IDS,
  LIFE_EVENTS,
  eventById,
  resolveEvent,
  rollEvent,
} from '../lib/haroolife/lome-events'
import {
  advanceLifeHour,
  decodeLomeLife,
  initialLomeLife,
  interact,
} from '../lib/haroolife/lome-life-engine'

test('six needs exist, decay hourly, and have a venue to restore them', () => {
  const s = initialLomeLife()
  assert.deepEqual(Object.keys(s.needs).sort(), [
    'bladder',
    'energy',
    'fun',
    'hunger',
    'hygiene',
    'social',
  ])
  const later = advanceLifeHour(s)
  assert.ok(later.needs.fun < s.needs.fun && later.needs.bladder < s.needs.bladder)
  // The player starts next to home: relax (TV) and toilet work there.
  const home = { ...s, pos: { x: 9, y: 10 } }
  assert.ok(interact(home, 'relax').needs.fun > home.needs.fun)
  assert.equal(interact(home, 'toilet').needs.bladder, 100)
  assert.match(interact(s, 'toilet').lastEvent, /toilettes/i)
})

test('events are drawn deterministically in daytime only and never while travelling', () => {
  const s = initialLomeLife()
  const hits: string[] = []
  for (let day = 1; day <= 3; day++)
    for (let hour = 0; hour < 24; hour++) {
      const id = rollEvent({ ...s, day, hour })
      if (id) {
        assert.ok(hour >= 7 && hour <= 20)
        assert.ok(EVENT_IDS.has(id))
        hits.push(id)
      }
    }
  assert.ok(hits.length >= 3 && hits.length <= 12, `got ${hits.length} events in 3 days`)
  const [d, h] = [1, 7]
  const found = [...Array(24).keys()].find((hh) => rollEvent({ ...s, day: d, hour: hh }))
  assert.ok(found !== undefined)
  assert.equal(rollEvent({ ...s, day: d, hour: found, route: [{ x: 11, y: 11 }] }), null)
  assert.equal(rollEvent({ ...s, day: d, hour: found, pendingEvent: 'fete-quartier' }), null)
  assert.equal(h, 7)
})

test('a pending event blocks nothing else and each choice applies its consequence', () => {
  const s = { ...initialLomeLife(), pendingEvent: 'inondation-be' }
  const wade = resolveEvent(s, 0)
  assert.equal(wade.pendingEvent, null)
  assert.equal(wade.needs.hygiene, s.needs.hygiene - 25)
  const clean = resolveEvent(s, 1)
  assert.equal(clean.needs.social, s.needs.social + 20)
  const broke = { ...initialLomeLife(), pendingEvent: 'coupure-ceet', wallet: 100 }
  const maquis = resolveEvent(broke, 1)
  assert.equal(maquis.wallet, 100)
  assert.match(maquis.lastEvent, /Pas assez/)
  const rich = resolveEvent({ ...broke, wallet: 2000 }, 1)
  assert.equal(rich.wallet, 1500)
  assert.equal(rich.city.coins, broke.city.coins + 500)
  assert.equal(resolveEvent({ ...s, pendingEvent: null }, 0).needs.hygiene, s.needs.hygiene)
  assert.equal(eventById('nope'), null)
  assert.ok(LIFE_EVENTS.every((e) => e.choices.length === 2))
})

test('older saves without the new gauges still load, with defaults', () => {
  const s = initialLomeLife()
  const { pendingEvent: _p, ...rest } = JSON.parse(JSON.stringify(s))
  const { fun: _f, bladder: _b, ...needs } = rest.needs
  const old = { ...rest, needs }
  const loaded = decodeLomeLife(old)
  assert.ok(loaded)
  assert.equal(loaded.needs.fun, 70)
  assert.equal(loaded.pendingEvent, null)
  assert.equal(decodeLomeLife({ ...old, pendingEvent: 'unknown-event' }), null)
})
