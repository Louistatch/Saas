import { submitAssignment } from '@/lib/academy/operator-training'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, isUuid, rateLimit } from '@/lib/utils/rate-limit'
// Dépôt d'un devoir Opérateur — écrit via submitAssignment avec l'identifiant authentifié.
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  contentText: z.string().trim().min(1).max(10_000).optional(),
  attachmentUrl: z.string().url().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`academy-assignment-submit:${ip}`, 20, 60_000)
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
  return NextResponse.json(result)
}
