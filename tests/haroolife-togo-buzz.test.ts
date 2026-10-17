// HarooLife : le gbairai du jour (par milieu de départ) et la messe du dimanche du Cardinal,
// personnage inventé. Même rumeur pour tous un jour donné, direct le dimanche de 20 h à 21 h
// (heure de Lomé, GMT), une révélation toutes les 10 minutes, vie quotidienne seulement.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ORIGIN_IDS } from '../lib/haroolife/city/arrival'
import {
  CARDINAL,
  FAITHFUL,
  REVELATIONS,
  RUMOURS,
  SUNDAY_TEASER,
  TEASERS,
  inSaid,
  messeAnnouncement,
  messeState,
  revelationMessage,
  rumourMessage,
  rumourOfDay,
  sermonOf,
  weekOf,
} from '../lib/haroolife/togo-buzz'

// Dimanche 18 octobre 2026, Lomé (GMT).
const SUNDAY = Date.parse('2026-10-18T00:00:00Z')
const at = (iso: string) => Date.parse(iso)

test('gbairai : chaque milieu de départ a ses rumeurs, un jour sur deux, les mêmes pour tous', () => {
  assert.equal(new Set(RUMOURS.map((r) => r.id)).size, RUMOURS.length)
  for (const origin of ORIGIN_IDS)
    assert.ok(
      RUMOURS.some((r) => r.layer === origin),
      `${origin} a au moins une rumeur`,
    )
  const day = at('2026-10-18T09:00:00Z')
  assert.deepEqual(rumourOfDay(day, 'enseignant'), rumourOfDay(day + 3_600_000, 'enseignant'))
  // Un jour le milieu du joueur, le lendemain le quartier.
  const layers = new Set([0, 1].map((d) => rumourOfDay(day + d * 86_400_000, 'enseignant').layer))
  assert.deepEqual([...layers].sort(), ['enseignant', 'tous'])
  // Sans milieu connu : le quartier.
  assert.equal(rumourOfDay(day, null).layer, 'tous')
  assert.equal(rumourOfDay(day, 'inconnu').layer, 'tous')
  for (const r of RUMOURS) assert.ok(rumourMessage(r).length <= 500)
})

test('la messe : teaser en semaine, « il va parler » l’heure d’avant, direct, puis le sermon', () => {
  // Lundi : un teaser, la messe dans 6 jours.
  const monday = messeState(at('2026-10-19T12:00:00Z'))
  assert.equal(monday.phase, 'week')
  if (monday.phase === 'week') {
    assert.equal(monday.teaser, TEASERS[0])
    assert.equal(inSaid(monday.startsIn), 'dans 6 j 8 h')
  }
  // Dimanche matin : ce soir.
  const morning = messeState(at('2026-10-18T09:00:00Z'))
  assert.equal(morning.phase === 'week' && morning.teaser, SUNDAY_TEASER)
  // Dimanche 19 h 15 : il va parler dans 45 minutes, le jeu l'annonce.
  const soon = messeState(at('2026-10-18T19:15:00Z'))
  assert.deepEqual(soon, { phase: 'soon', startsIn: 45 * 60_000 })
  assert.match(messeAnnouncement(at('2026-10-18T19:15:00Z')) ?? '', /va parler.*dans 45 min/)
  // 20 h 00 : première révélation ; 20 h 25 : trois ; 20 h 59 : les cinq.
  const sermon = sermonOf(weekOf(SUNDAY))
  for (const [time, n] of [
    ['20:00', 1],
    ['20:25', 3],
    ['20:59', 5],
  ] as const) {
    const s = messeState(at(`2026-10-18T${time}:00Z`))
    assert.equal(s.phase, 'live', time)
    if (s.phase === 'live') assert.deepEqual(s.revealed, sermon.slice(0, n), time)
  }
  assert.match(messeAnnouncement(at('2026-10-18T20:30:00Z')) ?? '', /En direct/)
  // 21 h : la messe est dite, le sermon reste lisible jusqu'à minuit ; plus d'annonce.
  const done = messeState(at('2026-10-18T22:00:00Z'))
  assert.deepEqual(done, { phase: 'done', revealed: sermon })
  assert.equal(messeAnnouncement(at('2026-10-18T22:00:00Z')), null)
  assert.equal(messeAnnouncement(at('2026-10-21T20:30:00Z')), null)
  // Une semaine va du dimanche au samedi : le dimanche suivant, un autre sermon.
  assert.equal(weekOf(at('2026-10-24T23:59:00Z')), weekOf(SUNDAY))
  assert.equal(weekOf(at('2026-10-25T00:00:00Z')), weekOf(SUNDAY) + 1)
})

test('sermons : cinq révélations différentes chaque semaine, et toutes reviennent à leur tour', () => {
  const seen = new Set<string>()
  for (let w = 0; w < REVELATIONS.length; w++) {
    const s = sermonOf(w)
    assert.equal(new Set(s).size, 5)
    for (const r of s) seen.add(r)
    assert.notDeepEqual(sermonOf(w), sermonOf(w + 1))
  }
  assert.equal(seen.size, REVELATIONS.length)
  assert.equal(sermonOf(-3).length, 5)
  for (const r of REVELATIONS) assert.ok(revelationMessage(r).length <= 500)
})

test('vie quotidienne seulement : ni parti, ni ministre, ni personne réelle, ni ethnie, ni foi', () => {
  const all = [
    ...RUMOURS.flatMap((r) => [r.where, r.text]),
    ...REVELATIONS,
    ...TEASERS,
    SUNDAY_TEASER,
    ...FAITHFUL,
    CARDINAL.about,
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
    'régime politique',
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
