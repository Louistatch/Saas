// Modification, archivage et restauration d'une organisation. Jamais de suppression :
// archiver pose deleted_at et conserve membres, exploitations, cartes et historique.
import { audit, checkParent, organisationSchema } from '@/lib/admin/cooperatives'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.union([
  z.object({ action: z.literal('update'), data: organisationSchema }),
  z.object({ action: z.enum(['archive', 'restore']) }),
])

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })

  const admin = createAdminClient()
  const { data: before } = await admin
    .from('cooperatives')
    .select('id, name, description, primary_color, level, parent_id, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (!before) return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 })

  const body = parsed.data
  if (body.action === 'update') {
    const parentError = await checkParent(admin, body.data, id)
    if (parentError) return NextResponse.json({ error: parentError }, { status: 422 })
    const input = body.data
    const { error } = await admin
      .from('cooperatives')
      .update({
        name: input.name,
        description: input.description || null,
        primary_color: input.primary_color,
        level: input.level,
        parent_id: input.level === 'faitiere' ? null : (input.parent_id ?? null),
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: 'Mise à jour impossible' }, { status: 502 })
    await audit(admin, guard.ctx.userId, 'cooperative_updated', id, { before, after: input })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'archive') {
    const { count } = await admin
      .from('cooperatives')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', id)
      .is('deleted_at', null)
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `Cette organisation a encore ${count} organisation(s) rattachée(s) active(s) : archivez-les ou rattachez-les ailleurs d’abord.`,
        },
        { status: 409 },
      )
    }
  }
  const { error } = await admin
    .from('cooperatives')
    .update({ deleted_at: body.action === 'archive' ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: 'Action impossible' }, { status: 502 })
  await audit(admin, guard.ctx.userId, `cooperative_${body.action}d`, id, { name: before.name })
  return NextResponse.json({ ok: true })
}
