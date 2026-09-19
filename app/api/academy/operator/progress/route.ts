import { getProfileProgressSummary, upsertProgress } from '@/lib/academy/operator-training'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
// Progression du candidat Opérateur — écriture via upsertProgress avec
// l'identifiant authentifié, jamais depuis le corps de la requête.
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  moduleId: z.string().uuid(),
  lessonId: z.string().uuid().nullable().optional(),
  status: z.enum(['not_started', 'in_progress', 'completed']),
  progressPercent: z.number().int().min(0).max(100),
})

export async function POST(request: NextRequest) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`academy-operator-progress:${ip}`, 30, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const guard = await assertAuthenticated()
  if (!guard.ok) return guard.response

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  const result = await upsertProgress(admin, {
    profileId: guard.ctx.userId,
    moduleId: parsed.data.moduleId,
    lessonId: parsed.data.lessonId ?? null,
    status: parsed.data.status,
    progressPercent: parsed.data.progressPercent,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Écriture impossible' }, { status: 422 })
  }
  return NextResponse.json(result)
}

export async function GET(request: NextRequest) {
  const guard = await assertAuthenticated()
  if (!guard.ok) return guard.response

  const moduleId = new URL(request.url).searchParams.get('moduleId')
  if (!moduleId) {
    return NextResponse.json({ error: 'moduleId requis' }, { status: 400 })
  }

  const admin = createAdminClient()
  const summary = await getProfileProgressSummary(admin, guard.ctx.userId, moduleId)
  return NextResponse.json(summary)
}
