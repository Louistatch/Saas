import { noteOperatorLearningStarted } from '@/lib/academy/operator-completion'
import { getProfileProgressSummary, recordLessonOpened } from '@/lib/academy/operator-training'
import { assertOperatorCandidate } from '@/lib/security/assert-partner-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
// Progression du candidat Opérateur. Le client ne peut signaler qu'une chose : « j'ai ouvert
// cette leçon ». L'état `completed` n'est jamais accepté d'ici : il est dérivé côté serveur
// des tentatives de quiz et des dépôts (lib/academy/completion-policy.ts).
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  moduleId: z.string().uuid(),
  lessonId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`academy-operator-progress:${ip}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const guard = await assertOperatorCandidate()
  if (!guard.ok) return guard.response
  // Un super_admin consulte la formation sans dossier : rien n'est écrit en son nom.
  if (guard.ctx.partnerIds.length === 0) return NextResponse.json({ ok: true, recorded: false })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  const result = await recordLessonOpened(admin, {
    profileId: guard.ctx.userId,
    moduleId: parsed.data.moduleId,
    lessonId: parsed.data.lessonId,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Écriture impossible' }, { status: 422 })
  }
  await noteOperatorLearningStarted(admin, guard.ctx.userId)
  return NextResponse.json({ ok: true, recorded: true })
}

export async function GET(request: NextRequest) {
  const guard = await assertOperatorCandidate()
  if (!guard.ok) return guard.response

  const moduleId = new URL(request.url).searchParams.get('moduleId')
  if (!moduleId) {
    return NextResponse.json({ error: 'moduleId requis' }, { status: 400 })
  }

  const admin = createAdminClient()
  const summary = await getProfileProgressSummary(admin, guard.ctx.userId, moduleId)
  return NextResponse.json(summary)
}
