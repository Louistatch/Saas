import { reviewAssignmentSubmission } from '@/lib/academy/assignment-review'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  marks: z.record(z.string().min(1).max(80), z.number().int().min(0).max(100)),
  feedback: z.string().trim().max(4000),
  decision: z.enum(['approved', 'revision_required']),
})

/** Correction d'un dépôt (super_admin) : grille, commentaire, décision. Une fois par dépôt. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  if (parsed.data.decision === 'revision_required' && parsed.data.feedback.length < 10) {
    return NextResponse.json(
      { error: 'Une reprise demandée doit être expliquée (10 caractères au moins).' },
      { status: 400 },
    )
  }
  const result = await reviewAssignmentSubmission(createAdminClient(), {
    submissionId: id,
    reviewerId: guard.ctx.userId,
    marks: parsed.data.marks,
    feedback: parsed.data.feedback,
    decision: parsed.data.decision,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
  return NextResponse.json(result)
}
