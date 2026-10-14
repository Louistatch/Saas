import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  displayTitle,
  learnerLessons,
  objectivesFromSlides,
  remainingCounts,
  resumeLesson,
} from '../lib/academy/learner-view'
import type { ProfileProgressSummary } from '../lib/academy/operator-training'

const lesson = (n: number) => ({
  id: `l${n}`,
  title: `Leçon ${n}`,
  order_index: n,
  duration_min: 30,
  hasQuiz: true,
  hasAssignment: true,
})

const summary = (over: Partial<ProfileProgressSummary> = {}): ProfileProgressSummary => ({
  module_id: 'm',
  lessons: [],
  latest_quiz_attempts: [],
  submissions: [],
  ...over,
})

describe('vue apprenant (J3)', () => {
  it('déduit les quatre états d’une leçon', () => {
    const out = learnerLessons([lesson(1), lesson(2), lesson(3), lesson(4)], {
      module_id: 'm',
      lessons: [
        {
          lesson_id: 'l1',
          status: 'completed',
          progress_percent: 100,
          score: 80,
          last_viewed_at: '2026-10-01',
        },
        {
          lesson_id: 'l2',
          status: 'in_progress',
          progress_percent: 0,
          score: null,
          last_viewed_at: '2026-10-03',
        },
        {
          lesson_id: 'l3',
          status: 'in_progress',
          progress_percent: 0,
          score: null,
          last_viewed_at: '2026-10-02',
        },
      ],
      latest_quiz_attempts: [
        {
          quiz_id: 'q2',
          lesson_id: 'l2',
          score: 80,
          passed: true,
          submitted_at: null,
          attempts: 1,
          any_passed: true,
        },
        {
          quiz_id: 'q3',
          lesson_id: 'l3',
          score: 40,
          passed: false,
          submitted_at: null,
          attempts: 2,
          any_passed: false,
        },
      ],
      submissions: [],
    })
    assert.deepEqual(
      out.map((l) => l.state),
      ['completed', 'quiz_passed', 'in_progress', 'not_started'],
    )
    assert.equal(out[2].quizScore, 40)
  })

  it('reprend la dernière leçon consultée non validée, sinon la première ouverte', () => {
    const out = learnerLessons(
      [lesson(1), lesson(2), lesson(3)],
      summary({
        lessons: [
          {
            lesson_id: 'l1',
            status: 'completed',
            progress_percent: 100,
            score: 90,
            last_viewed_at: '2026-10-05',
          },
          {
            lesson_id: 'l3',
            status: 'in_progress',
            progress_percent: 0,
            score: null,
            last_viewed_at: '2026-10-04',
          },
        ],
      }),
    )
    assert.equal(resumeLesson(out)?.id, 'l3')
    const fresh = learnerLessons([lesson(1), lesson(2)], summary())
    assert.equal(resumeLesson(fresh)?.id, 'l1')
    const done = learnerLessons(
      [lesson(1)],
      summary({
        lessons: [
          {
            lesson_id: 'l1',
            status: 'completed',
            progress_percent: 100,
            score: 90,
            last_viewed_at: null,
          },
        ],
      }),
    )
    assert.equal(resumeLesson(done), null)
  })

  it('compte ce qui reste et signale les corrections à lire', () => {
    const out = learnerLessons(
      [lesson(1), lesson(2)],
      summary({
        latest_quiz_attempts: [
          {
            quiz_id: 'q1',
            lesson_id: 'l1',
            score: 100,
            passed: true,
            submitted_at: null,
            attempts: 1,
            any_passed: true,
          },
        ],
        submissions: [
          {
            assignment_id: 'a1',
            lesson_id: 'l1',
            status: 'revision_required',
            score: 55,
            feedback: 'Reprendre',
            reviewed_at: '2026-10-06',
          },
        ],
      }),
    )
    const counts = remainingCounts(out)
    assert.equal(counts.lessons, 2)
    assert.equal(counts.quizzes, 1)
    assert.equal(counts.assignments, 1)
    assert.equal(counts.reviewed, 1)
    assert.equal(out[0].review?.revision, true)
  })

  it('retire le numéro d’ordre du titre', () => {
    assert.equal(displayTitle('4. Gestion des membres'), 'Gestion des membres')
    assert.equal(displayTitle('Gestion des membres'), 'Gestion des membres')
  })

  it('extrait les objectifs des diapositives « objective »', () => {
    assert.deepEqual(
      objectivesFromSlides([
        {
          slide_type: 'objective',
          body: '- Enregistrer un membre\n• Importer une liste\n\n3) Lire le score',
        },
        { slide_type: 'concept', body: '- pas un objectif' },
      ]),
      ['Enregistrer un membre', 'Importer une liste', 'Lire le score'],
    )
  })
})
