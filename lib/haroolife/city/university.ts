/**
 * The university: a real timetable (two-hour lectures, Monday to Friday 8 h–12 h and 14 h–18 h,
 * Saturday morning, lunch break and evenings closed), a lecturer at the board when a course is
 * on, and an amphitheatre whose seats fill during the lecture. Pure data, no React.
 *
 * The game day 1 is a Monday; one game week is seven game days.
 */
import type { Layout, Npc, Prop } from './interiors'

export const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
/** 0 = lundi … 6 = dimanche. */
export const weekday = (day: number) => (((Math.trunc(day) - 1) % 7) + 7) % 7

export interface Lecturer {
  name: string
  model: string
}
export interface Course {
  title: string
  lecturer: Lecturer
}
const KPODAR: Lecturer = { name: 'Pr Ama Kpodar', model: 'afi' }
const AGBEKO: Lecturer = { name: 'Dr Kodjo Agbeko', model: 'kossi' }
const SELOM: Lecturer = { name: 'Dr Sélom Amouzou', model: 'koffi' }
const ABLA: Lecturer = { name: 'Dr Abla Dogbé', model: 'abra' }

const C = (title: string, lecturer: Lecturer): Course => ({ title, lecturer })
const AGRO = C('Agronomie générale', KPODAR)
const SOLS = C('Sols et fertilisation', KPODAR)
const ECO = C('Économie rurale', AGBEKO)
const COOP = C('Gestion des coopératives', AGBEKO)
const INFO = C('Informatique', SELOM)
const STAT = C('Statistiques agricoles', SELOM)
const DROIT = C('Droit foncier et coopératif', ABLA)
const COM = C('Expression écrite et orale', ABLA)

/** Lecture slots: start hour, two hours each. 12 h–14 h is the lunch break. */
export const SLOTS = [8, 10, 14, 16] as const
/** Week timetable: one row per weekday, one course (or none) per slot. */
export const TIMETABLE: (Course | null)[][] = [
  [AGRO, ECO, INFO, COM], // lundi
  [SOLS, COOP, STAT, DROIT], // mardi
  [ECO, AGRO, COM, INFO], // mercredi
  [COOP, SOLS, DROIT, STAT], // jeudi
  [AGRO, INFO, ECO, null], // vendredi : après-midi libre à 16 h
  [COM, DROIT, null, null], // samedi : le matin seulement
  [null, null, null, null], // dimanche
]

export interface Session {
  course: Course
  start: number
  end: number
  /** Index of the slot in the day, for the once-per-lecture rule. */
  slot: number
  day: number
}

/** The lecture running at this game day and hour, or null (break, evening, weekend). */
export function sessionAt(day: number, hour: number): Session | null {
  const row = TIMETABLE[weekday(day)]
  for (let slot = 0; slot < SLOTS.length; slot++) {
    const start = SLOTS[slot]
    const course = row[slot]
    if (course && hour >= start && hour < start + 2)
      return { course, start, end: start + 2, slot, day }
  }
  return null
}

/** The next lecture after this hour (this day or the following ones). */
export function nextSession(day: number, hour: number): Session | null {
  for (let d = 0; d < 8; d++) {
    const row = TIMETABLE[weekday(day + d)]
    for (let slot = 0; slot < SLOTS.length; slot++) {
      const start = SLOTS[slot]
      const course = row[slot]
      if (course && (d > 0 || start > hour))
        return { course, start, end: start + 2, slot, day: day + d }
    }
  }
  return null
}

/** « mercredi à 14 h » or « à 14 h » (same day). */
export function whenOf(s: Session, today: number): string {
  if (s.day === today) return `à ${s.start} h`
  if (s.day === today + 1) return `demain à ${s.start} h`
  return `${WEEKDAYS[weekday(s.day)]} à ${s.start} h`
}

/** Key of a lecture: a lecture is followed once. */
export const sessionKey = (s: Session) => `${s.day}:${s.slot}`

const ROWS = [-0.6, 0.9, 2.4]
const SEATS = [-3.3, -1.8, 1.8, 3.3]

/**
 * The amphitheatre at a given time. During a lecture the lecturer walks along the board and
 * students fill most seats; the free seat in the front row is the player's (« Suivre le
 * cours »). Outside lectures the room is empty but for the secretary and a student revising.
 */
export function universityLayout(day: number, hour: number): Layout {
  const session = sessionAt(day, hour)
  const next = session ? null : nextSession(day, hour)
  const props: Prop[] = [
    { id: 'board', kind: 'board', x: 0, z: -4.3 },
    { id: 'board-2', kind: 'board', x: -2.6, z: -4.3 },
    { id: 'board-3', kind: 'board', x: 2.6, z: -4.3 },
    { id: 'lectern', kind: 'desk', x: 2.4, z: -2.9, rot: 0 },
    {
      id: 'timetable',
      kind: 'sign',
      x: -5.2,
      z: 3.4,
      rot: 90,
      action: 'timetable',
      label: 'Consulter l’emploi du temps',
      hint: 'Cours de 8 h à 12 h et de 14 h à 18 h, du lundi au samedi matin',
    },
    { id: 'reception', kind: 'reception', x: 4.4, z: 3.6, rot: 180 },
    { id: 'plant-1', kind: 'plant', x: -5.2, z: -3.8 },
    { id: 'plant-2', kind: 'plant', x: 5.2, z: -3.8 },
    { id: 'cooler', kind: 'water-cooler', x: 5.2, z: 1.8 },
  ]
  for (const [r, z] of ROWS.entries())
    for (const [c, x] of SEATS.entries()) {
      props.push({ id: `bench-${r}-${c}`, kind: 'table', x, z: z - 0.55 })
      props.push({ id: `seat-${r}-${c}`, kind: 'chair', x, z, rot: 180 })
    }
  // The player's seat: front row, next to the aisle.
  const seat = props.find((p) => p.id === 'seat-0-1')
  if (seat) {
    seat.action = 'learn'
    seat.label = session
      ? `Suivre le cours : ${session.course.title} (${session.start} h–${session.end} h)`
      : 'Suivre un cours'
    seat.hint = session
      ? `${session.course.lecturer.name} · Compétence +1 · 1 000 FCFA`
      : next
        ? `Pas de cours maintenant · prochain : ${next.course.title}, ${whenOf(next, day)}`
        : 'Pas de cours cette semaine'
  }
  const npcs: Npc[] = [
    {
      id: 'secretary',
      model: 'abra',
      x: 4.4,
      z: 2.9,
      rot: 0,
      anim: 'work',
      role: session
        ? 'Secrétariat · cours en amphi en ce moment'
        : next
          ? `Secrétariat · prochain cours : ${next.course.title}, ${whenOf(next, day)}`
          : 'Secrétariat',
    },
  ]
  if (session) {
    npcs.unshift({
      id: 'lecturer',
      model: session.course.lecturer.model,
      x: -2.6,
      z: -3.5,
      rot: 0,
      anim: 'talk',
      role: `${session.course.lecturer.name} · ${session.course.title} (${session.start} h–${session.end} h)`,
      to: { x: 2.0, z: -3.5 },
    })
    // Students in every seat but the player's and two left free.
    const free = new Set(['seat-0-1', 'seat-1-3', 'seat-2-0'])
    let n = 0
    for (const p of props)
      if (p.kind === 'chair' && !free.has(p.id))
        npcs.push({
          id: `student-${n}`,
          model: ['koffi', 'afi', 'kossi', 'abra'][n++ % 4],
          x: p.x,
          z: p.z,
          rot: 180,
          anim: 'sit',
          role: 'Étudiant·e en cours',
          extra: true,
        })
  } else {
    npcs.push({
      id: 'student-revising',
      model: 'koffi',
      x: SEATS[3],
      z: ROWS[2],
      rot: 180,
      anim: 'sit',
      role: 'Un étudiant révise entre deux cours',
    })
  }
  return {
    name: session ? `Amphi · ${session.course.title}` : 'Université · amphithéâtre',
    w: 12,
    d: 10,
    floor: '#b58b5a',
    wall: '#efe6d2',
    trim: '#5b3b22',
    props,
    npcs,
    spawn: { x: 0, z: 4.2 },
  }
}
