/**
 * Vue apprenant d'AgriAcademy (J3) : ce que l'accueil et le lecteur affichent, calculé à partir
 * du module et du résumé de progression. Fonctions pures, sans accès à la base, testées dans
 * tests/academy-learner-view.test.ts. La règle de validation reste celle de
 * completion-policy.ts : ici on ne fait que la présenter.
 */
import type { ProfileProgressSummary } from './operator-training'

export type LearnerLessonState = 'completed' | 'quiz_passed' | 'in_progress' | 'not_started'

export interface LearnerLessonInput {
  id: string
  title: string
  order_index: number | null
  duration_min: number | null
  hasQuiz: boolean
  hasAssignment: boolean
}

export interface LearnerLesson extends LearnerLessonInput {
  state: LearnerLessonState
  /** Dernière tentative de quiz (score en %), null sans tentative. */
  quizScore: number | null
  quizPassed: boolean
  assignmentSubmitted: boolean
  /** Dernier dépôt corrigé, à lire. */
  review: { score: number | null; feedback: string | null; revision: boolean } | null
  lastViewedAt: string | null
}

/** Titre sans son numéro d'ordre (« 4. Gestion… » → « Gestion… ») : le numéro est affiché à part. */
export function displayTitle(title: string): string {
  return title.replace(/^\s*\d+\s*[.)]\s*/, '')
}

export const STATE_LABEL: Record<LearnerLessonState, string> = {
  completed: 'Validée',
  quiz_passed: 'Quiz réussi, cas pratique à déposer',
  in_progress: 'En cours, quiz non réussi',
  not_started: 'Non commencée',
}

export function learnerLessons(
  lessons: LearnerLessonInput[],
  summary: ProfileProgressSummary,
): LearnerLesson[] {
  const progress = new Map(summary.lessons.map((l) => [l.lesson_id, l]))
  const quiz = new Map(
    summary.latest_quiz_attempts.filter((a) => a.lesson_id).map((a) => [a.lesson_id as string, a]),
  )
  const submission = new Map(summary.submissions.map((s) => [s.lesson_id, s]))

  return lessons.map((lesson) => {
    const row = progress.get(lesson.id)
    const attempt = quiz.get(lesson.id)
    const sub = submission.get(lesson.id)
    const quizPassed = !lesson.hasQuiz || attempt?.any_passed === true
    const assignmentSubmitted =
      !lesson.hasAssignment ||
      (sub != null && ['submitted', 'reviewed', 'revision_required'].includes(sub.status))

    let state: LearnerLessonState
    if (row?.status === 'completed') state = 'completed'
    else if (lesson.hasQuiz && attempt?.any_passed && !assignmentSubmitted) state = 'quiz_passed'
    else if (row?.status === 'in_progress' || attempt || sub) state = 'in_progress'
    else state = 'not_started'

    const reviewed = sub && (sub.status === 'reviewed' || sub.status === 'revision_required')
    return {
      ...lesson,
      state,
      quizScore: attempt?.score ?? null,
      quizPassed,
      assignmentSubmitted,
      review: reviewed
        ? { score: sub.score, feedback: sub.feedback, revision: sub.status === 'revision_required' }
        : null,
      lastViewedAt: row?.last_viewed_at ?? null,
    }
  })
}

/**
 * Leçon à reprendre : la dernière consultée qui n'est pas validée, sinon la première non
 * validée dans l'ordre du module, sinon null (tout est validé).
 */
export function resumeLesson<T extends { state: LearnerLessonState; lastViewedAt: string | null }>(
  lessons: T[],
): T | null {
  const open = lessons.filter((l) => l.state !== 'completed')
  if (open.length === 0) return null
  const viewed = open
    .filter((l) => l.lastViewedAt)
    .sort((a, b) => (b.lastViewedAt as string).localeCompare(a.lastViewedAt as string))
  return viewed[0] ?? open[0]
}

export interface RemainingCounts {
  lessons: number
  quizzes: number
  assignments: number
  reviewed: number
  submitted: number
}

/** « Ce qui reste avant l'évaluation ». */
export function remainingCounts(lessons: LearnerLesson[]): RemainingCounts {
  return {
    lessons: lessons.filter((l) => l.state !== 'completed').length,
    quizzes: lessons.filter((l) => l.hasQuiz && !l.quizPassed).length,
    assignments: lessons.filter((l) => l.hasAssignment && !l.assignmentSubmitted).length,
    reviewed: lessons.filter((l) => l.review != null).length,
    submitted: lessons.filter((l) => l.hasAssignment && l.assignmentSubmitted).length,
  }
}

/**
 * Objectifs d'une leçon, tirés des diapositives de type « objective » : une ligne par
 * objectif (puces « - », « • » ou numéros retirés), sans ligne vide.
 */
export function objectivesFromSlides(
  slides: { slide_type: string; body: string }[],
  max = 6,
): string[] {
  const out: string[] = []
  for (const slide of slides) {
    if (slide.slide_type !== 'objective') continue
    for (const raw of slide.body.split('\n')) {
      const line = raw.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()
      if (line) out.push(line)
    }
  }
  return out.slice(0, max)
}
