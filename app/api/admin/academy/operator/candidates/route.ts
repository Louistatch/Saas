import { OPERATOR_MODULE_ID } from '@/lib/academy/operator-training'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * Vue admin de la formation « Opérateur certifié FaîtiereHub » (§ demande :
 * l'admin local doit pouvoir suivre l'avancement des candidats). Lecture
 * seule — aucune écriture ici. Agrège academy_profile_progress /
 * academy_quiz_attempts / academy_assignment_submissions par profil, tous
 * profils confondus (le parcours n'est pas scopé coopérative).
 */
export async function GET() {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const admin = createAdminClient()

  const { data: lessons } = await admin
    .from('academy_lessons')
    .select('id, order_index')
    .eq('module_id', OPERATOR_MODULE_ID)
  const lessonCount = lessons?.length ?? 0
  const lessonIds = (lessons ?? []).map((l) => l.id)

  const { data: progress } = await admin
    .from('academy_profile_progress')
    .select('profile_id, lesson_id, status, updated_at')
    .eq('module_id', OPERATOR_MODULE_ID)

  const { data: quizzes } = await admin
    .from('academy_quizzes')
    .select('id')
    .eq('module_id', OPERATOR_MODULE_ID)
  const quizIds = (quizzes ?? []).map((q) => q.id)

  const { data: attempts } =
    quizIds.length > 0
      ? await admin
          .from('academy_quiz_attempts')
          .select('profile_id, quiz_id, score, passed, created_at')
          .in('quiz_id', quizIds)
          .order('created_at', { ascending: false })
      : { data: [] }

  const { data: assignments } =
    lessonIds.length > 0
      ? await admin.from('academy_assignments').select('id').in('lesson_id', lessonIds)
      : { data: [] }
  const assignmentIds = (assignments ?? []).map((a) => a.id)

  const { data: submissions } =
    assignmentIds.length > 0
      ? await admin
          .from('academy_assignment_submissions')
          .select('profile_id, assignment_id, status, score, created_at')
          .in('assignment_id', assignmentIds)
          .order('created_at', { ascending: false })
      : { data: [] }

  const profileIds = new Set<string>()
  for (const p of progress ?? []) profileIds.add(p.profile_id)
  for (const a of attempts ?? []) profileIds.add(a.profile_id)
  for (const s of submissions ?? []) profileIds.add(s.profile_id)

  const { data: profiles } =
    profileIds.size > 0
      ? await admin
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', [...profileIds])
      : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const candidates = [...profileIds].map((profileId) => {
    const profileProgress = (progress ?? []).filter((p) => p.profile_id === profileId)
    const completedLessons = profileProgress.filter((p) => p.status === 'completed').length
    const lastActivity = profileProgress.reduce<string | null>(
      (max, p) => (!max || p.updated_at > max ? p.updated_at : max),
      null,
    )

    const latestAttemptByQuiz = new Map<string, { score: number | null; passed: boolean | null }>()
    for (const attempt of attempts ?? []) {
      if (attempt.profile_id !== profileId) continue
      if (!latestAttemptByQuiz.has(attempt.quiz_id)) {
        latestAttemptByQuiz.set(attempt.quiz_id, { score: attempt.score, passed: attempt.passed })
      }
    }
    const quizAttempts = [...latestAttemptByQuiz.values()]
    const quizzesPassed = quizAttempts.filter((a) => a.passed).length

    const submissionsForProfile = (submissions ?? []).filter((s) => s.profile_id === profileId)

    const profile = profileById.get(profileId)
    const fullName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : null
    return {
      profile_id: profileId,
      full_name: fullName,
      email: profile?.email ?? null,
      lessons_completed: completedLessons,
      lessons_total: lessonCount,
      quizzes_passed: quizzesPassed,
      quizzes_total: quizIds.length,
      submissions_count: submissionsForProfile.length,
      last_activity: lastActivity,
    }
  })

  candidates.sort((a, b) => (b.last_activity ?? '').localeCompare(a.last_activity ?? ''))

  return NextResponse.json({ candidates })
}
