import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initialCityLife } from '../lib/haroolife/city/life'
import { residentReply } from '../lib/haroolife/city/social'
import {
  POLICE_LINES,
  STUDENT_LINES,
  STUDENT_NAMES,
  isStudent,
  streetLines,
  streetNews,
} from '../lib/haroolife/city/street-talk'
import { rumourOfDay, sermonOf, weekOf } from '../lib/haroolife/togo-buzz'

// Sunday 18 October 2026 in Lomé (GMT): the messe runs from 20:00 to 21:00.
const at = (day: number, hour: number, minute = 0) => Date.UTC(2026, 9, day, hour, minute)
const wednesday = at(14, 12)
const sundayEvening = at(18, 19)
const live = at(18, 20, 25)
const after = at(18, 22)
const said = (lines: { who: string; text: string }[], who: string) =>
  lines.filter((l) => l.who === who).map((l) => l.text)

test('la rue répète le gbairai du jour, celui du milieu du joueur compris', () => {
  const lines = said(streetLines(wednesday, 'nana-benz'), 'habitant')
  assert.ok(lines.some((t) => t.includes(rumourOfDay(wednesday).text)))
  assert.ok(lines.some((t) => t.includes(rumourOfDay(wednesday, 'nana-benz').text)))
  assert.ok(lines.every((t) => t.startsWith('🗣️') || t.startsWith('⛪')))
})

test('la messe du Cardinal : teaser en semaine, rappel avant, « chut » en direct, sermon après', () => {
  const week = said(streetLines(wednesday), 'habitant').join(' ')
  assert.match(week, /Cardinal/)
  assert.match(week, /dans 4 j 8 h/)
  assert.match(said(streetLines(sundayEvening), 'habitant').join(' '), /commence dans 1 h 00/)

  const onAir = streetLines(live)
  const sermon = sermonOf(weekOf(live))
  // Minute 25: the third revelation has just been said; the street talks of the live first.
  assert.equal(said(onAir, 'habitant')[0], '⛪ Chut ! Le Cardinal fait la messe en direct.')
  assert.ok(said(onAir, 'habitant').some((t) => t.includes(sermon[2])))
  assert.equal(said(onAir, 'etudiant')[0], '⛪ Chut ! Le Cardinal fait la messe en direct.')

  const done = said(streetLines(after), 'habitant').join(' ')
  assert.ok(done.includes(sermon[4]))
  assert.match(streetNews(live), /^Chut, le Cardinal/)
  assert.ok(streetNews(after).includes(sermon[4]))
  assert.ok(streetNews(wednesday).includes(rumourOfDay(wednesday).text))
})

test('étudiants et police ont leurs répliques, les étudiants sont des passants nommés', () => {
  const lines = streetLines(wednesday)
  assert.deepEqual(said(lines, 'etudiant'), STUDENT_LINES)
  assert.deepEqual(said(lines, 'police'), POLICE_LINES)
  assert.ok(STUDENT_NAMES.length >= 2)
  assert.ok(STUDENT_NAMES.every(isStudent))
  assert.equal(isStudent('Agent Afi'), false)
  // Bubbles stay short enough to read on a phone.
  for (const l of lines) assert.ok(l.text.length <= 220, l.text)
})

test('vie quotidienne seulement : aucune personne réelle, ni politique, ni foi, ni ethnie', () => {
  const all = [
    ...[wednesday, sundayEvening, live, after].flatMap((t) => streetLines(t).map((l) => l.text)),
    ...STUDENT_LINES,
    ...POLICE_LINES,
  ]
    .join(' ')
    .toLowerCase()
  for (const word of [
    'président',
    'ministre',
    'gouvernement',
    'député',
    'élection',
    'parti',
    'opposition',
    'ferdinand',
    'ayité',
    'faure',
    'gnassingbé',
    'église',
    'mosquée',
    'pasteur',
    'imam',
    'ethnie',
    'tribu',
    'ewe',
    'kabyè',
  ])
    assert.ok(!new RegExp(`(^|[^\\p{L}])${word}s?([^\\p{L}]|$)`, 'u').test(all), word)
})

test('en conversation : « Quoi de neuf ? » donne le gbairai, les étudiants se présentent', () => {
  const s = initialCityLife()
  const habitant = { key: 'npc:Abla', name: 'Abla', role: 'Habitant du quartier' }
  assert.ok(
    residentReply(habitant, 'Quoi de neuf ?', s, wednesday).includes(rumourOfDay(wednesday).text),
  )
  assert.match(residentReply(habitant, 'Et la messe ?', s, live), /^Chut, le Cardinal/)
  const yao = { key: 'npc:Yao', name: 'Yao', role: 'Étudiant à l’université' }
  const hello = residentReply(yao, 'Bonjour, ça va ?', s, wednesday)
  // The street e2e greets the first passer-by in view and expects a welcome.
  assert.match(hello, /^Bienvenue/)
  assert.ok(STUDENT_LINES.some((l) => hello.includes(l)))
})
