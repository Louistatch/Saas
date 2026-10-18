import assert from 'node:assert/strict'
import { test } from 'node:test'
import { revealCorrections } from '../lib/academy/assessment-policy'
import { OPERATOR_COURSE_ID, catalogueModules } from '../lib/academy/catalogue'
import { STAGE_COPY, STAGE_STEP, operatorStage } from '../lib/partners/stage'

test('catalogue : un module sans leçon est caché des membres, visible en brouillon pour les admins', () => {
  const modules = [
    { id: 'cacao', academy_lessons: [] },
    { id: OPERATOR_COURSE_ID, academy_lessons: [{ id: 'l1' }, { id: 'l2' }] },
    { id: 'ancien', academy_lessons: null },
  ]
  assert.deepEqual(
    catalogueModules(modules, false).map((m) => m.id),
    [OPERATOR_COURSE_ID],
  )
  assert.equal(catalogueModules(modules, true).length, 3)
})

test('quiz : la correction détaillée seulement après une réussite', () => {
  assert.equal(revealCorrections(false, true), false)
  assert.equal(revealCorrections(true, true), true)
  assert.equal(revealCorrections(true, false), false)
})

test('dossier Opérateur : évaluation réussie puis frais réglés, chacun avec sa phrase juste', () => {
  // Évaluation à venir.
  assert.equal(operatorStage({ status: 'exam_pending' }), 'exam_pending')
  // Évaluation réussie, frais à régler : l'étape 4 (frais) est en cours.
  const passed = operatorStage({ status: 'exam_pending', exam_passed_at: '2026-10-18T09:00:00Z' })
  assert.equal(passed, 'exam_passed')
  assert.equal(STAGE_STEP[passed], 4)
  assert.match(STAGE_COPY[passed].next, /Réglez les frais/)
  // Frais réglés : plus jamais « réglez les frais ».
  const paid = operatorStage({
    status: 'certified',
    exam_passed_at: '2026-10-18T09:00:00Z',
    certified_at: '2026-10-18T10:00:00Z',
  })
  assert.equal(paid, 'certified')
  assert.equal(STAGE_STEP[paid], 5)
  assert.doesNotMatch(STAGE_COPY[paid].next, /Réglez/)
  for (const copy of Object.values(STAGE_COPY))
    assert.doesNotMatch(`${copy.state} ${copy.next}`, /pilote|jalon/i)
})
