import { OPERATOR_MODULE_ID } from '@/lib/academy/operator-training'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * File de correction des cas pratiques (super_admin). `?status=submitted` (défaut) liste ce qui
 * attend une correction ; `all` tout l'historique, 200 derniers.
 */
export async function GET(request: NextRequest) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const status = new URL(request.url).searchParams.get('status') ?? 'submitted'

  const admin = createAdminClient()
  const { data: lessons } = await admin
    .from('academy_lessons')
    .select('id, order_index, title')
    .eq('module_id', OPERATOR_MODULE_ID)
  const lessonById = new Map((lessons ?? []).map((l) => [l.id, l]))
  const { data: assignments } = await admin
    .from('academy_assignments')
    .select('id, lesson_id, title, rubric')
    .in('lesson_id', [...lessonById.keys()])
  const assignmentById = new Map((assignments ?? []).map((a) => [a.id, a]))
  if (assignmentById.size === 0) return NextResponse.json({ submissions: [] })

  let query = admin
    .from('academy_assignment_submissions')
    .select(
      'id, assignment_id, profile_id, content_text, attachment_url, status, score, feedback, submitted_at, reviewed_at, created_at',
    )
    .in('assignment_id', [...assignmentById.keys()])
    .order('created_at', { ascending: status === 'submitted' })
    .limit(200)
  if (status !== 'all') query = query.eq('status', status)
  const { data: rows } = await query

  const profileIds = [...new Set((rows ?? []).map((r) => r.profile_id))]
  const { data: profiles } =
    profileIds.length > 0
      ? await admin.from('profiles').select('id, first_name, last_name, email').in('id', profileIds)
      : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return NextResponse.json({
    submissions: (rows ?? []).map((r) => {
      const assignment = assignmentById.get(r.assignment_id)
      const lesson = assignment ? lessonById.get(assignment.lesson_id) : undefined
      const profile = profileById.get(r.profile_id)
      return {
        ...r,
        assignment_title: assignment?.title ?? null,
        rubric: assignment?.rubric ?? null,
        lesson_order: lesson?.order_index ?? null,
        lesson_title: lesson?.title ?? null,
        candidate_name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : null,
        candidate_email: profile?.email ?? null,
      }
    }),
  })
}
