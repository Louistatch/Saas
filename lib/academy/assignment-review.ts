import 'server-only'
/**
 * Correction des cas pratiques par l'administration (jalon J2, constat E1). La grille
 * (`academy_assignments.rubric.criteria`, critères pondérés) donne un score sur 100 ; la
 * décision est « approuvé » (`reviewed`) ou « à reprendre » (`revision_required`). Chaque dépôt
 * est corrigé une seule fois ; une reprise est un nouveau dépôt. La correction ne bloque pas la
 * validation de la leçon (politique J1 : « déposé ») : elle nourrit l'évaluation pratique.
 */
import { emailUser } from '@/lib/email/resend'
import type { Database } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

type AdminClient = SupabaseClient<Database>

export interface RubricCriterion {
  name: string
  weight: number
}

export function rubricCriteria(rubric: unknown): RubricCriterion[] {
  const list = (rubric as { criteria?: unknown } | null)?.criteria
  if (!Array.isArray(list)) return []
  return list
    .filter(
      (c): c is RubricCriterion =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as RubricCriterion).name === 'string' &&
        typeof (c as RubricCriterion).weight === 'number',
    )
    .map((c) => ({ name: c.name, weight: c.weight }))
}

/** Score sur 100 : chaque critère noté de 0 à 100, pondéré par son poids. */
export function rubricScore(criteria: RubricCriterion[], marks: Record<string, number>): number {
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0)
  if (totalWeight <= 0) return 0
  const weighted = criteria.reduce((sum, c) => {
    const mark = Math.min(100, Math.max(0, marks[c.name] ?? 0))
    return sum + mark * c.weight
  }, 0)
  return Math.round(weighted / totalWeight)
}

export interface ReviewInput {
  submissionId: string
  reviewerId: string
  marks: Record<string, number>
  feedback: string
  decision: 'approved' | 'revision_required'
}

export interface ReviewResult {
  ok: boolean
  error?: string
  score?: number
  status?: 'reviewed' | 'revision_required'
}

export async function reviewAssignmentSubmission(
  admin: AdminClient,
  input: ReviewInput,
): Promise<ReviewResult> {
  const { data: submission } = await admin
    .from('academy_assignment_submissions')
    .select('id, profile_id, status, assignment_id, academy_assignments(title, rubric)')
    .eq('id', input.submissionId)
    .maybeSingle<{
      id: string
      profile_id: string
      status: string
      assignment_id: string
      academy_assignments: { title: string; rubric: unknown } | null
    }>()
  if (!submission) return { ok: false, error: 'Dépôt introuvable' }
  if (submission.status !== 'submitted') {
    return { ok: false, error: 'Ce dépôt a déjà été corrigé' }
  }
  const criteria = rubricCriteria(submission.academy_assignments?.rubric)
  const score = rubricScore(criteria, input.marks)
  const status = input.decision === 'approved' ? 'reviewed' : 'revision_required'
  const now = new Date().toISOString()
  const { error } = await admin
    .from('academy_assignment_submissions')
    .update({
      status,
      score,
      feedback: input.feedback,
      reviewed_by: input.reviewerId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', input.submissionId)
    .eq('status', 'submitted')
  if (error) return { ok: false, error: 'Écriture impossible' }

  await admin.from('audit_logs').insert({
    user_id: input.reviewerId,
    action: status === 'reviewed' ? 'academy_assignment_approved' : 'academy_assignment_revision',
    resource: 'academy_assignment_submissions',
    resource_id: input.submissionId,
    details: { score, marks: input.marks } as never,
  })

  const title = submission.academy_assignments?.title ?? 'Cas pratique'
  await emailUser(
    submission.profile_id,
    status === 'reviewed' ? 'Cas pratique corrigé' : 'Cas pratique à reprendre',
    {
      title:
        status === 'reviewed'
          ? `Cas pratique approuvé : ${score} / 100`
          : 'Une reprise est demandée',
      lines: [
        'Bonjour,',
        `« ${title} » a été corrigé par l’équipe FaîtiereHub. Note : ${score} / 100.`,
        input.feedback ? `Commentaire : ${input.feedback}` : '',
        status === 'revision_required'
          ? 'Relisez le commentaire puis déposez une nouvelle version depuis la leçon.'
          : 'Merci : ce travail compte pour votre évaluation pratique.',
      ].filter(Boolean),
      cta: { label: 'Ouvrir la formation', path: '/operator/training' },
    },
  )
  return { ok: true, score, status }
}
