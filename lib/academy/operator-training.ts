/**
 * Parcours de formation « Opérateur certifié FaîtiereHub » — domaine, pas
 * poignées de clic React (même principe que lib/partners/certification.ts
 * et lib/cards/print-orders.ts). Chaque fonction prend un client déjà
 * privilégié (service_role) : ce module ne fait aucune autorisation
 * lui-même, l'authentification vit dans la route appelante.
 *
 * cf. supabase/migrations/20260919140639_academy_operator_training_v2.sql —
 * aucune policy INSERT/UPDATE côté client sur les tables d'écriture
 * (tentatives, soumissions, progression), d'où ce module.
 */
import 'server-only'
import type {
  AcademyAssignment,
  AcademyLessonSlide,
  AcademyMediaAsset,
  AcademyModuleWithLessons,
  AcademyProgressStatus,
  AcademyQuestionType,
} from '@/types/domain'
import type { Database } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

type AdminClient = SupabaseClient<Database>

/** Module pilote « Opérateur certifié FaîtiereHub — Pilote V1 », déjà seedé en base. */
export const OPERATOR_MODULE_ID = '2482e523-500e-4178-8102-1018af290c82'

export interface ProgressResult {
  ok: boolean
  error?: string
}

export interface QuizAttemptResult {
  ok: boolean
  error?: string
  score?: number
  passed?: boolean
  attemptId?: string
}

export interface AssignmentSubmissionResult {
  ok: boolean
  error?: string
  submissionId?: string
}

export interface ProfileProgressSummary {
  module_id: string
  lessons: {
    lesson_id: string
    status: AcademyProgressStatus
    progress_percent: number
    score: number | null
  }[]
  latest_quiz_attempts: {
    quiz_id: string
    lesson_id: string | null
    score: number | null
    passed: boolean | null
    submitted_at: string | null
  }[]
  submissions: {
    assignment_id: string
    lesson_id: string
    status: string
    score: number | null
  }[]
}

/**
 * Module complet (leçons, slides, quiz sans clé de correction, devoir),
 * ordonné par order_index. `is_correct` des options n'est jamais renvoyé —
 * seule la route de soumission de tentative y a accès (elle recharge les
 * questions côté serveur, cf. submitQuizAttempt).
 */
export async function getModuleWithLessons(
  admin: AdminClient,
  moduleId: string,
): Promise<AcademyModuleWithLessons | null> {
  const { data: module_ } = await admin
    .from('academy_modules')
    .select('id, title, description, category, level, duration_min, is_published')
    .eq('id', moduleId)
    .maybeSingle()
  if (!module_) return null

  const { data: lessons } = await admin
    .from('academy_lessons')
    .select('id, module_id, title, content_type, content_body, duration_min, order_index')
    .eq('module_id', moduleId)
    .order('order_index', { ascending: true })
  const lessonRows = lessons ?? []
  const lessonIds = lessonRows.map((l) => l.id)
  if (lessonIds.length === 0) {
    return { ...module_, lessons: [] }
  }

  const [{ data: slides }, { data: assets }, { data: quizzes }, { data: assignments }] =
    await Promise.all([
      admin
        .from('academy_lesson_slides')
        .select('*')
        .in('lesson_id', lessonIds)
        .order('order_index', { ascending: true }),
      admin.from('academy_media_assets').select('*').in('lesson_id', lessonIds),
      admin.from('academy_quizzes').select('*').in('lesson_id', lessonIds),
      admin.from('academy_assignments').select('*').in('lesson_id', lessonIds),
    ])

  const quizIds = (quizzes ?? []).map((q) => q.id)
  const [{ data: questions }, { data: options }] =
    quizIds.length > 0
      ? await Promise.all([
          admin
            .from('academy_quiz_questions')
            .select('*')
            .in('quiz_id', quizIds)
            .order('order_index', { ascending: true }),
          admin.from('academy_quiz_options').select('*').order('order_index', { ascending: true }),
        ])
      : [{ data: [] }, { data: [] }]

  const questionRows = (questions ?? []).filter((q) => quizIds.includes(q.quiz_id))
  const questionIds = questionRows.map((q) => q.id)
  const optionRows = (options ?? []).filter((o) => questionIds.includes(o.question_id))

  const assetById = new Map<string, AcademyMediaAsset>((assets ?? []).map((a) => [a.id, a]))
  const slidesByLesson = new Map<
    string,
    (AcademyLessonSlide & { media_asset: AcademyMediaAsset | null })[]
  >()
  for (const slide of slides ?? []) {
    const list = slidesByLesson.get(slide.lesson_id) ?? []
    list.push({
      ...slide,
      media_asset: slide.media_asset_id ? (assetById.get(slide.media_asset_id) ?? null) : null,
    })
    slidesByLesson.set(slide.lesson_id, list)
  }

  const quizByLesson = new Map((quizzes ?? []).map((q) => [q.lesson_id as string, q]))
  const assignmentByLesson = new Map<string, AcademyAssignment>(
    (assignments ?? []).map((a) => [a.lesson_id, a]),
  )
  const questionsByQuiz = new Map<string, typeof questionRows>()
  for (const question of questionRows) {
    const list = questionsByQuiz.get(question.quiz_id) ?? []
    list.push(question)
    questionsByQuiz.set(question.quiz_id, list)
  }
  const optionsByQuestion = new Map<string, typeof optionRows>()
  for (const option of optionRows) {
    const list = optionsByQuestion.get(option.question_id) ?? []
    list.push(option)
    optionsByQuestion.set(option.question_id, list)
  }

  const lessonsOut = lessonRows.map((lesson) => {
    const quiz = quizByLesson.get(lesson.id)
    return {
      ...lesson,
      slides: slidesByLesson.get(lesson.id) ?? [],
      assignment: assignmentByLesson.get(lesson.id) ?? null,
      quiz: quiz
        ? {
            id: quiz.id,
            module_id: quiz.module_id,
            lesson_id: quiz.lesson_id,
            title: quiz.title,
            description: quiz.description,
            passing_score: quiz.passing_score,
            max_attempts: quiz.max_attempts,
            is_required: quiz.is_required,
            questions: (questionsByQuiz.get(quiz.id) ?? []).map((question) => ({
              id: question.id,
              question_type: question.question_type as AcademyQuestionType,
              prompt: question.prompt,
              points: question.points,
              order_index: question.order_index,
              options: (optionsByQuestion.get(question.id) ?? []).map((option) => ({
                id: option.id,
                label: option.label,
                order_index: option.order_index,
              })),
            })),
          }
        : null,
    }
  })

  return { ...module_, lessons: lessonsOut }
}

/** Upsert de progression sur la clé unique (profile_id, module_id, lesson_id). */
export async function upsertProgress(
  admin: AdminClient,
  params: {
    profileId: string
    moduleId: string
    lessonId: string | null
    status: AcademyProgressStatus
    progressPercent: number
  },
): Promise<ProgressResult> {
  const now = new Date().toISOString()
  const { error } = await admin.from('academy_profile_progress').upsert(
    {
      profile_id: params.profileId,
      module_id: params.moduleId,
      lesson_id: params.lessonId,
      status: params.status,
      progress_percent: params.progressPercent,
      last_viewed_at: now,
      started_at: params.status !== 'not_started' ? now : null,
      completed_at: params.status === 'completed' ? now : null,
      updated_at: now,
    },
    { onConflict: 'profile_id,module_id,lesson_id' },
  )
  if (error) return { ok: false, error: 'Écriture de la progression impossible' }
  return { ok: true }
}

/**
 * Corrige une tentative de quiz. single_choice/true_false : l'unique option
 * cochée doit être la bonne. multiple_choice : l'ensemble des options
 * cochées doit correspondre exactement à l'ensemble des bonnes réponses
 * (pas de crédit partiel — plus simple et sans ambiguïté pédagogique pour
 * un examen pilote). case : jamais noté automatiquement (0 point, à revoir
 * manuellement plus tard — aucune UI de correction manuelle n'existe encore).
 * Chaque appel insère une nouvelle ligne (append-only, aucune contrainte
 * unique sur cette table) — jamais de mise à jour d'une tentative existante.
 */
export async function submitQuizAttempt(
  admin: AdminClient,
  params: { quizId: string; profileId: string; answers: Record<string, string[]> },
): Promise<QuizAttemptResult> {
  const { data: quiz } = await admin
    .from('academy_quizzes')
    .select('id, passing_score')
    .eq('id', params.quizId)
    .maybeSingle()
  if (!quiz) return { ok: false, error: 'Quiz introuvable' }

  const { data: questions } = await admin
    .from('academy_quiz_questions')
    .select('id, question_type, points')
    .eq('quiz_id', params.quizId)
  const questionRows = questions ?? []
  if (questionRows.length === 0) return { ok: false, error: 'Quiz sans questions' }

  const { data: options } = await admin
    .from('academy_quiz_options')
    .select('id, question_id, is_correct')
    .in(
      'question_id',
      questionRows.map((q) => q.id),
    )
  const optionsByQuestion = new Map<string, { id: string; is_correct: boolean }[]>()
  for (const option of options ?? []) {
    const list = optionsByQuestion.get(option.question_id) ?? []
    list.push({ id: option.id, is_correct: option.is_correct })
    optionsByQuestion.set(option.question_id, list)
  }

  let earned = 0
  let total = 0
  for (const question of questionRows) {
    total += question.points
    if (question.question_type === 'case') continue // non noté automatiquement

    const questionOptions = optionsByQuestion.get(question.id) ?? []
    const correctIds = new Set(questionOptions.filter((o) => o.is_correct).map((o) => o.id))
    const selectedIds = new Set(params.answers[question.id] ?? [])

    const isCorrect =
      correctIds.size === selectedIds.size && [...correctIds].every((id) => selectedIds.has(id))
    if (isCorrect) earned += question.points
  }

  const score = total > 0 ? Math.round((earned / total) * 100) : 0
  const passed = score >= quiz.passing_score
  const now = new Date().toISOString()

  const { data: attempt, error } = await admin
    .from('academy_quiz_attempts')
    .insert({
      quiz_id: params.quizId,
      profile_id: params.profileId,
      answers: params.answers,
      score,
      passed,
      submitted_at: now,
    })
    .select('id')
    .single()
  if (error || !attempt) return { ok: false, error: 'Écriture de la tentative impossible' }

  return { ok: true, score, passed, attemptId: attempt.id }
}

/** Dépôt d'un devoir — statut initial 'submitted', jamais 'draft' (pas d'édition en place côté V1). */
export async function submitAssignment(
  admin: AdminClient,
  params: {
    assignmentId: string
    profileId: string
    contentText: string | null
    attachmentUrl: string | null
  },
): Promise<AssignmentSubmissionResult> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('academy_assignment_submissions')
    .insert({
      assignment_id: params.assignmentId,
      profile_id: params.profileId,
      content_text: params.contentText,
      attachment_url: params.attachmentUrl,
      status: 'submitted',
      submitted_at: now,
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: 'Dépôt du devoir impossible' }
  return { ok: true, submissionId: data.id }
}

/** Vue d'ensemble « ma formation » : progression par leçon + dernière tentative par quiz + statut de devoirs. */
export async function getProfileProgressSummary(
  admin: AdminClient,
  profileId: string,
  moduleId: string,
): Promise<ProfileProgressSummary> {
  const { data: lessons } = await admin
    .from('academy_lessons')
    .select('id')
    .eq('module_id', moduleId)
  const lessonIds = (lessons ?? []).map((l) => l.id)

  const { data: progress } = await admin
    .from('academy_profile_progress')
    .select('lesson_id, status, progress_percent, score')
    .eq('profile_id', profileId)
    .eq('module_id', moduleId)

  const { data: quizzes } = await admin
    .from('academy_quizzes')
    .select('id, lesson_id')
    .eq('module_id', moduleId)
  const quizIds = (quizzes ?? []).map((q) => q.id)

  const { data: attempts } =
    quizIds.length > 0
      ? await admin
          .from('academy_quiz_attempts')
          .select('quiz_id, score, passed, submitted_at, created_at')
          .eq('profile_id', profileId)
          .in('quiz_id', quizIds)
          .order('created_at', { ascending: false })
      : { data: [] }

  // dernière tentative par quiz (déjà triée created_at DESC)
  interface AttemptRow {
    quiz_id: string
    score: number | null
    passed: boolean | null
    submitted_at: string | null
    created_at: string
  }
  const latestByQuiz = new Map<string, AttemptRow>()
  for (const attempt of (attempts ?? []) as AttemptRow[]) {
    if (!latestByQuiz.has(attempt.quiz_id)) latestByQuiz.set(attempt.quiz_id, attempt)
  }

  const { data: assignments } = await admin
    .from('academy_assignments')
    .select('id, lesson_id')
    .in('lesson_id', lessonIds.length > 0 ? lessonIds : ['00000000-0000-0000-0000-000000000000'])
  const assignmentIds = (assignments ?? []).map((a) => a.id)

  const { data: submissions } =
    assignmentIds.length > 0
      ? await admin
          .from('academy_assignment_submissions')
          .select('assignment_id, status, score, created_at')
          .eq('profile_id', profileId)
          .in('assignment_id', assignmentIds)
          .order('created_at', { ascending: false })
      : { data: [] }

  interface SubmissionRow {
    assignment_id: string
    status: string
    score: number | null
    created_at: string
  }
  const latestByAssignment = new Map<string, SubmissionRow>()
  for (const submission of (submissions ?? []) as SubmissionRow[]) {
    if (!latestByAssignment.has(submission.assignment_id)) {
      latestByAssignment.set(submission.assignment_id, submission)
    }
  }
  const assignmentLessonById = new Map((assignments ?? []).map((a) => [a.id, a.lesson_id]))
  const quizLessonById = new Map((quizzes ?? []).map((q) => [q.id, q.lesson_id]))

  return {
    module_id: moduleId,
    lessons: (progress ?? []).map((p) => ({
      lesson_id: p.lesson_id ?? '',
      status: p.status as AcademyProgressStatus,
      progress_percent: p.progress_percent,
      score: p.score,
    })),
    latest_quiz_attempts: [...latestByQuiz.entries()].map(([quizId, attempt]) => ({
      quiz_id: quizId,
      lesson_id: quizLessonById.get(quizId) ?? null,
      score: attempt.score,
      passed: attempt.passed,
      submitted_at: attempt.submitted_at,
    })),
    submissions: [...latestByAssignment.entries()].map(([assignmentId, submission]) => ({
      assignment_id: assignmentId,
      lesson_id: assignmentLessonById.get(assignmentId) ?? '',
      status: submission.status,
      score: submission.score,
    })),
  }
}
