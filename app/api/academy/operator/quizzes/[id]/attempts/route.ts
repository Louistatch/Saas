import { submitQuizAttempt } from '@/lib/academy/operator-training'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, isUuid, rateLimit } from '@/lib/utils/rate-limit'
// Tentative de quiz — corrigée côté serveur (lib/academy/operator-training.ts),
// jamais côté client : la clé de correction n'est jamais exposée.
import { type NextRequest, NextResponse } from 'next/server'
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

  const guard = await assertAuthenticated()
  if (!guard.ok) return guard.response

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
  return NextResponse.json(result)
}
