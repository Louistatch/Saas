import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutFor } from '../lib/haroolife/city/interiors'
import { cityInteract, enterLot, initialCityLife, useProp } from '../lib/haroolife/city/life'
import {
  TIMETABLE,
  nextSession,
  sessionAt,
  universityLayout,
  weekday,
} from '../lib/haroolife/city/university'
import { landmarks } from '../lib/haroolife/city/world'

const university = () => landmarks().find((l) => l.type === 'university')!
const at = (day: number, hour: number) => {
  const s = enterLot(initialCityLife(), university())
  return { ...s, life: { ...s.life, day, hour, wallet: 5000 } }
}

test('the timetable: two-hour lectures, lunch break, evenings and Sunday closed', () => {
  assert.equal(weekday(1), 0) // day 1 is a Monday
  assert.equal(weekday(7), 6)
  assert.equal(weekday(8), 0)
  assert.equal(sessionAt(1, 8)?.course.title, 'Agronomie générale')
  assert.equal(sessionAt(1, 9)?.course.title, 'Agronomie générale')
  assert.equal(sessionAt(1, 10)?.course.title, 'Économie rurale')
  assert.equal(sessionAt(1, 12), null) // lunch
  assert.equal(sessionAt(1, 13), null)
  assert.equal(sessionAt(1, 14)?.course.title, 'Informatique')
  assert.equal(sessionAt(1, 18), null) // evening
  assert.equal(sessionAt(1, 7), null)
  assert.equal(sessionAt(6, 14), null) // Saturday afternoon
  assert.equal(sessionAt(7, 10), null) // Sunday
  assert.ok(TIMETABLE.slice(0, 5).every((row) => row.filter(Boolean).length >= 3))
  // After Friday 14 h the next lecture is Saturday 8 h; after Saturday, Monday.
  assert.deepEqual([nextSession(5, 16)?.day, nextSession(5, 16)?.start], [6, 8])
  assert.deepEqual([nextSession(6, 12)?.day, nextSession(6, 12)?.start], [8, 8])
})

test('during a lecture the lecturer is at the board and the seats fill; after, the room empties', () => {
  const on = universityLayout(1, 8)
  const lecturer = on.npcs.find((n) => n.id === 'lecturer')
  assert.ok(lecturer)
  assert.match(lecturer.role, /Pr Ama Kpodar · Agronomie générale \(8 h–10 h\)/)
  assert.equal(lecturer.anim, 'talk')
  assert.ok(lecturer.to, 'the lecturer walks along the board')
  assert.ok(on.npcs.filter((n) => n.anim === 'sit').length >= 8)
  assert.ok(on.props.filter((p) => p.kind === 'board').length >= 1)
  const seat = on.props.find((p) => p.action === 'learn')
  assert.match(seat?.label ?? '', /Suivre le cours : Agronomie générale \(8 h–10 h\)/)
  const off = universityLayout(1, 12)
  assert.equal(
    off.npcs.find((n) => n.id === 'lecturer'),
    undefined,
  )
  assert.ok(off.npcs.filter((n) => n.anim === 'sit').length <= 1)
  assert.match(
    off.props.find((p) => p.action === 'learn')?.hint ?? '',
    /prochain : Informatique, à 14 h/,
  )
  // The city layout of the university's lot is the amphitheatre, with its lecture.
  const lot = university()
  assert.match(layoutFor('hall', lot, { day: 2, hour: 10 }).name, /Gestion des coopératives/)
})

test('following a lecture: only while it runs, once per lecture, paid', () => {
  const lunch = cityInteract(at(1, 12), 'learn')
  assert.match(
    lunch.life.lastEvent,
    /Pas de cours en ce moment\. Prochain cours : Informatique avec Dr Sélom Amouzou, à 14 h/,
  )
  assert.equal(lunch.life.wallet, 5000)
  const s = at(1, 8)
  const seat = layoutFor('hall', university(), s.life).props.find((p) => p.action === 'learn')!
  const followed = useProp(s, seat.id)
  assert.equal(followed.skills, s.skills + 1)
  assert.equal(followed.life.wallet, 4000)
  assert.equal(followed.activity?.anim, 'sit')
  assert.match(followed.life.lastEvent, /Agronomie générale avec Pr Ama Kpodar/)
  const again = cityInteract({ ...followed, life: { ...followed.life, hour: 9 } }, 'learn')
  assert.equal(again.skills, followed.skills)
  assert.match(again.life.lastEvent, /Tu suis déjà ce cours/)
  const nextLecture = cityInteract({ ...followed, life: { ...followed.life, hour: 10 } }, 'learn')
  assert.equal(nextLecture.skills, followed.skills + 1)
})
