import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  attemptGate,
  gradeQuestion,
  gradeQuiz,
  stableShuffle,
} from '../lib/academy/assessment-policy'

const single = { id: 'q1', type: 'single_choice' as const, points: 1, correctOptionIds: ['b'] }
const multi = {
  id: 'q2',
  type: 'multiple_choice' as const,
  points: 2,
  correctOptionIds: ['a', 'b', 'c'],
}
const open = { id: 'q3', type: 'case' as const, points: 1, correctOptionIds: [] }

describe('notation des questions', () => {
  it('choix unique : tout ou rien, et rien sans réponse', () => {
    assert.equal(gradeQuestion(single, ['b']).earned, 1)
    assert.equal(gradeQuestion(single, ['a']).earned, 0)
    assert.equal(gradeQuestion(single, []).earned, 0)
  })
  it('choix multiple : crédit partiel, tout cocher ne rapporte rien', () => {
    assert.equal(gradeQuestion(multi, ['a', 'b', 'c']).earned, 2)
    assert.equal(gradeQuestion(multi, ['a', 'b']).earned, 1.33)
    assert.equal(gradeQuestion(multi, ['a', 'b', 'c', 'd']).earned, 1.33)
    assert.equal(gradeQuestion(multi, ['a', 'd']).earned, 0)
    assert.equal(gradeQuestion(multi, ['a', 'b', 'c', 'd', 'e', 'f']).earned, 0)
    assert.equal(gradeQuestion(multi, ['a', 'b', 'c', 'd']).correct, false)
  })
  it('question ouverte : hors total, en attente', () => {
    const g = gradeQuestion(open, [])
    assert.equal(g.pending, true)
    assert.equal(g.points, 0)
  })
  it('un quiz de 5 questions à 1 point passe à 4 bonnes réponses avec un seuil de 70', () => {
    const qs = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
      id,
      type: 'true_false' as const,
      points: 1,
      correctOptionIds: [`${id}-ok`],
    }))
    const answers = Object.fromEntries(qs.map((q) => [q.id, [`${q.id}-ok`]]))
    assert.equal(gradeQuiz(qs, answers, 70).score, 100)
    answers.e = ['e-no']
    const four = gradeQuiz(qs, answers, 70)
    assert.equal(four.score, 80)
    assert.equal(four.passed, true)
    answers.d = ['d-no']
    assert.equal(gradeQuiz(qs, answers, 70).passed, false)
  })
  it('les questions ouvertes ne comptent pas dans le total', () => {
    const g = gradeQuiz([single, open], { q1: ['b'] }, 70)
    assert.equal(g.score, 100)
    assert.equal(g.questions[1].pending, true)
  })
})

describe('tentatives', () => {
  const t = (hoursAgo: number, passed = false) => ({
    createdAt: new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
    passed,
  })
  it('sans limite : toujours permis tant que non réussi', () => {
    assert.equal(attemptGate([t(1), t(2), t(3)], null).allowed, true)
    assert.equal(attemptGate([t(1, true)], null).reason, 'already_passed')
  })
  it('limite de 3 sur 24 h, puis réessai possible après la fenêtre', () => {
    assert.deepEqual(attemptGate([t(1), t(2)], 3).attemptsLeft, 1)
    const blocked = attemptGate([t(1), t(2), t(3)], 3)
    assert.equal(blocked.allowed, false)
    assert.equal(blocked.reason, 'limit_reached')
    assert.ok(blocked.retryAt)
    assert.equal(attemptGate([t(30), t(31), t(32)], 3).allowed, true)
  })
})

describe('ordre stable', () => {
  it('même graine, même ordre ; graine différente, ordre différent en général', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    assert.deepEqual(stableShuffle(items, 'u1:q1'), stableShuffle(items, 'u1:q1'))
    assert.deepEqual([...stableShuffle(items, 'u1:q1')].sort(), items)
    assert.notDeepEqual(stableShuffle(items, 'u1:q1'), stableShuffle(items, 'u2:q1'))
  })
})
