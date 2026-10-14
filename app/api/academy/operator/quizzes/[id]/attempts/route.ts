import { settleOperatorTraining } from '@/lib/academy/operator-completion'
import { notifyTrainingCompleted } from '@/lib/academy/operator-notify'
import { evaluateLessonCompletion, submitQuizAttempt } from '@/lib/academy/operator-training'
import { assertOperatorCandidate } from '@/lib/security/assert-partner-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, isUuid, rateLimit } from '@/lib/utils/rate-limit'
// Tentative de quiz — corrigée côté serveur (lib/academy/operator-training.ts),
// jamais côté client : la clé de correction n'est jamais exposée.
import { type NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  answers: z.record(z.string().uuid(), z.array(z.string().uuid())),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`academy-quiz-attempt:${ip}`, 20, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const guard = await assertOperatorCandidate()
  if (!guard.ok) return guard.response
  // Supervision (super_admin sans dossier) : lecture seule, aucune tentative en son nom.
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

  const admin = createAdminClient()
  const result = await submitQuizAttempt(admin, {
    quizId: id,
    profileId: guard.ctx.userId,
    answers: parsed.data.answers,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Soumission impossible' }, { status: 422 })
  }
  // C1/C2 : la leçon est validée d'après les preuves en base, jamais d'après le client ; si
  // c'était la dernière, la fin de formation est enregistrée sur le dossier et signalée.
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
