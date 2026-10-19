// Réponse de l'équipe (super_admin) dans la conversation, visible dans le tableau de bord.
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { addReply } from '@/lib/support-threads'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .safeParse((await request.json().catch(() => null))?.body)
  if (!z.string().uuid().safeParse(id).success || !body.success) {
    return NextResponse.json({ error: 'Écrivez une réponse.' }, { status: 400 })
  }
  const result = await addReply(createAdminClient(), {
    messageId: id,
    authorId: guard.ctx.userId,
    role: 'equipe',
    body: body.data,
  })
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: result.error }, { status: 502 })
}
