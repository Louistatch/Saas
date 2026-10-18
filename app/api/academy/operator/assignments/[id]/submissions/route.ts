import { settleOperatorTraining } from '@/lib/academy/operator-completion'
import { notifyTrainingCompleted } from '@/lib/academy/operator-notify'
import { evaluateLessonCompletion, submitAssignment } from '@/lib/academy/operator-training'
import { assertOperatorCandidate } from '@/lib/security/assert-partner-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, isUuid, rateLimit } from '@/lib/utils/rate-limit'
// Dépôt d'un devoir Opérateur — écrit via submitAssignment avec l'identifiant authentifié.
import { type NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  // Même seuil que le formulaire : un cas pratique se rédige (20 caractères au moins).
  contentText: z.string().trim().min(20).max(10_000).optional(),
  attachmentUrl: z.string().url().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`academy-assignment-submit:${ip}`, 20, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const guard = await assertOperatorCandidate()
  if (!guard.ok) return guard.response
  if (guard.ctx.partnerIds.length === 0) {
    return NextResponse.json(
      { error: 'Consultation seulement : aucun dossier Opérateur' },
      { status: 403 },
    )
  }

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
  if (!parsed.data.contentText && !parsed.data.attachmentUrl) {
    return NextResponse.json({ error: 'Contenu ou pièce jointe requis' }, { status: 400 })
  }

  const admin = createAdminClient()
  const result = await submitAssignment(admin, {
    assignmentId: id,
    profileId: guard.ctx.userId,
    contentText: parsed.data.contentText ?? null,
    attachmentUrl: parsed.data.attachmentUrl ?? null,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Dépôt impossible' }, { status: 422 })
  }
  let lessonCompleted = false
  let training: {
    lessonsCompleted: number
    lessonsTotal: number
    trainingCompleted: boolean
  } | null = null
  if (result.lessonId && result.moduleId) {
    const lesson = await evaluateLessonCompletion(admin, {
      profileId: guard.ctx.userId,
      moduleId: result.moduleId,
      lessonId: result.lessonId,
    })
    lessonCompleted = lesson.completed
    const settlement = await settleOperatorTraining(admin, guard.ctx.userId, result.moduleId)
    training = {
      lessonsCompleted: settlement.lessonsCompleted,
      lessonsTotal: settlement.lessonsTotal,
      trainingCompleted: settlement.trainingCompleted,
    }
    const userId = guard.ctx.userId
    after(() => notifyTrainingCompleted(userId, settlement))
  }
  return NextResponse.json({ ...result, lessonCompleted, training })
}
