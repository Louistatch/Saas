import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isLessonCompleted,
  isModuleCompleted,
  missingForLesson,
  percentScore,
} from '../lib/academy/completion-policy'

describe('validation d’une leçon (politique J1)', () => {
  it('exige le quiz réussi et le devoir déposé quand les deux sont obligatoires', () => {
    const req = { quizRequired: true, assignmentRequired: true }
    assert.equal(isLessonCompleted(req, { quizPassed: false, assignmentSubmitted: false }), false)
    assert.equal(isLessonCompleted(req, { quizPassed: true, assignmentSubmitted: false }), false)
    assert.equal(isLessonCompleted(req, { quizPassed: false, assignmentSubmitted: true }), false)
    assert.equal(isLessonCompleted(req, { quizPassed: true, assignmentSubmitted: true }), true)
    assert.deepEqual(missingForLesson(req, { quizPassed: false, assignmentSubmitted: false }), [
      'quiz',
      'assignment',
    ])
    assert.deepEqual(missingForLesson(req, { quizPassed: true, assignmentSubmitted: true }), [])
  })
  it('ignore ce qui n’est pas obligatoire et valide une leçon sans évaluation', () => {
    assert.equal(
      isLessonCompleted(
        { quizRequired: false, assignmentRequired: true },
        { quizPassed: false, assignmentSubmitted: true },
      ),
      true,
    )
    assert.equal(
      isLessonCompleted(
        { quizRequired: false, assignmentRequired: false },
        { quizPassed: false, assignmentSubmitted: false },
      ),
      true,
    )
  })
  it('termine le module seulement quand toutes les leçons sont validées', () => {
    assert.equal(isModuleCompleted(11, 12), false)
    assert.equal(isModuleCompleted(12, 12), true)
    assert.equal(isModuleCompleted(0, 0), false)
  })
  it('calcule le score en pourcentage entier (2 sur 3 = 67, sous le seuil de 70)', () => {
    assert.equal(percentScore(2, 3), 67)
    assert.equal(percentScore(3, 3), 100)
    assert.equal(percentScore(0, 0), 0)
  })
})
