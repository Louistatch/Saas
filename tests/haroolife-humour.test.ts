// HarooLife : débats et blagues à la togolaise. Même sujet pour tous un jour donné, deux camps,
// messages courts (salon « Togo »), vie quotidienne seulement.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEBATES,
  JOKES,
  debateOfDay,
  jokeAt,
  jokeMessage,
  voteMessage,
} from '../lib/haroolife/humour'

test('débats : identifiants uniques, deux camps distincts, sujet du jour stable', () => {
  assert.equal(new Set(DEBATES.map((d) => d.id)).size, DEBATES.length)
  for (const d of DEBATES) {
    assert.equal(d.sides.length, 2)
    assert.notEqual(d.sides[0], d.sides[1])
  }
  assert.equal(debateOfDay(20000).id, debateOfDay(20000).id)
  assert.notEqual(debateOfDay(20000).id, debateOfDay(20001).id)
  assert.equal(debateOfDay(-1).id, DEBATES[DEBATES.length - 1].id)
  assert.equal(jokeAt(JOKES.length), JOKES[0])
})

test('messages postés au salon : courts, et le camp choisi y figure', () => {
  for (const d of DEBATES)
    for (const side of [0, 1] as const) {
      const m = voteMessage(d, side)
      assert.ok(m.length <= 500)
      assert.ok(m.includes(d.sides[side]))
    }
  for (const j of JOKES) assert.ok(jokeMessage(j).length <= 500)
})

test('vie quotidienne seulement : ni politique, ni religion, ni ethnie', () => {
  const all = [...DEBATES.flatMap((d) => [d.question, ...d.sides]), ...JOKES]
    .join(' ')
    .toLowerCase()
  for (const word of ['président', 'élection', 'parti', 'église', 'mosquée', 'ethnie', 'tribu'])
    assert.ok(!new RegExp(`(^|[^\\p{L}])${word}s?([^\\p{L}]|$)`, 'u').test(all), word)
})
