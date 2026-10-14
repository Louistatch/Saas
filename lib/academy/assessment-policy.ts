/**
 * Règles d'évaluation des quiz — pures, testées, sans accès à la base (jalon J2).
 *
 * Décisions (docs/agriacademy-next-gen-status.md, 14 octobre 2026) :
 *   - Crédit partiel sur les choix multiples, règle documentée :
 *       points × max(0, (bonnes cochées − mauvaises cochées) / nombre de bonnes)
 *     Tout cocher ne rapporte rien quand il y a au moins un distracteur ; une seule bonne
 *     réponse sans erreur rapporte sa part. Choix unique et vrai/faux : tout ou rien.
 *   - Questions ouvertes (`case`) : hors du total automatique, en attente de correction ; elles
 *     ne font ni réussir ni échouer la tentative.
 *   - Tentatives : au plus `maxAttempts` par fenêtre de 24 h quand la limite est définie ;
 *     une tentative réussie ferme le quiz (on ne rejoue pas un quiz réussi).
 */

export type QuestionKind = 'single_choice' | 'multiple_choice' | 'true_false' | 'case'

export interface GradableQuestion {
  id: string
  type: QuestionKind
  points: number
  correctOptionIds: string[]
}

export interface QuestionGrade {
  questionId: string
  earned: number
  points: number
  /** Vrai quand la question a rapporté tous ses points. */
  correct: boolean
  /** Hors notation automatique (question ouverte). */
  pending: boolean
}

export function gradeQuestion(question: GradableQuestion, selected: string[]): QuestionGrade {
  if (question.type === 'case') {
    return { questionId: question.id, earned: 0, points: 0, correct: false, pending: true }
  }
  const correct = new Set(question.correctOptionIds)
  const chosen = new Set(selected)
  if (question.type !== 'multiple_choice') {
    const ok =
      chosen.size === correct.size && [...correct].every((id) => chosen.has(id)) && chosen.size > 0
    return {
      questionId: question.id,
      earned: ok ? question.points : 0,
      points: question.points,
      correct: ok,
      pending: false,
    }
  }
  let good = 0
  let bad = 0
  for (const id of chosen) {
    if (correct.has(id)) good++
    else bad++
  }
  const ratio = correct.size > 0 ? Math.max(0, (good - bad) / correct.size) : 0
  const earned = Math.round(question.points * ratio * 100) / 100
  return {
    questionId: question.id,
    earned,
    points: question.points,
    correct: earned === question.points,
    pending: false,
  }
}

export interface QuizGrade {
  score: number
  passed: boolean
  earned: number
  total: number
  questions: QuestionGrade[]
}

export function gradeQuiz(
  questions: GradableQuestion[],
  answers: Record<string, string[]>,
  passingScore: number,
): QuizGrade {
  const grades = questions.map((q) => gradeQuestion(q, answers[q.id] ?? []))
  const total = grades.reduce((sum, g) => sum + g.points, 0)
  const earned = grades.reduce((sum, g) => sum + g.earned, 0)
  const score = total > 0 ? Math.round((earned / total) * 100) : 0
  return { score, passed: score >= passingScore, earned, total, questions: grades }
}

export const ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000

export interface AttemptGate {
  allowed: boolean
  reason?: 'already_passed' | 'limit_reached'
  attemptsUsed: number
  attemptsLeft: number | null
  /** Quand la limite est atteinte : date à partir de laquelle on peut réessayer. */
  retryAt?: string
}

/**
 * Une tentative est-elle permise ? `attempts` = tentatives passées de la personne sur ce quiz
 * (toutes dates). La limite s'applique aux tentatives de la fenêtre glissante de 24 h.
 */
export function attemptGate(
  attempts: { createdAt: string; passed: boolean | null }[],
  maxAttempts: number | null,
  now: Date = new Date(),
): AttemptGate {
  if (attempts.some((a) => a.passed)) {
    return {
      allowed: false,
      reason: 'already_passed',
      attemptsUsed: attempts.length,
      attemptsLeft: 0,
    }
  }
  if (maxAttempts == null || maxAttempts <= 0) {
    return { allowed: true, attemptsUsed: attempts.length, attemptsLeft: null }
  }
  const windowStart = now.getTime() - ATTEMPT_WINDOW_MS
  const recent = attempts
    .map((a) => new Date(a.createdAt).getTime())
    .filter((t) => t >= windowStart)
    .sort((a, b) => a - b)
  const left = Math.max(0, maxAttempts - recent.length)
  if (left === 0) {
    return {
      allowed: false,
      reason: 'limit_reached',
      attemptsUsed: attempts.length,
      attemptsLeft: 0,
      retryAt: new Date(recent[0] + ATTEMPT_WINDOW_MS).toISOString(),
    }
  }
  return { allowed: true, attemptsUsed: attempts.length, attemptsLeft: left }
}

/** Mélange déterministe (même ordre pour une même personne et un même quiz) : pas de JS aléatoire. */
export function stableShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  const keyed = items.map((item, i) => {
    h = Math.imul(h ^ (i + 1), 16777619) >>> 0
    return { item, key: h }
  })
  return keyed.sort((a, b) => a.key - b.key).map((k) => k.item)
}
