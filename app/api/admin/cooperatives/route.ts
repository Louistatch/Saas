// Création d'une organisation (faîtière, union, coopérative), côté serveur et journalisée.
import { audit, checkParent, organisationSchema } from '@/lib/admin/cooperatives'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const parsed = organisationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides' },
      { status: 400 },
    )
  }
  const admin = createAdminClient()
  const parentError = await checkParent(admin, parsed.data)
  if (parentError) return NextResponse.json({ error: parentError }, { status: 422 })
  const input = parsed.data
  const { data, error } = await admin
    .from('cooperatives')
    .insert({
      name: input.name,
      description: input.description || null,
      primary_color: input.primary_color,
      level: input.level,
      parent_id: input.level === 'faitiere' ? null : (input.parent_id ?? null),
    })
    .select('id')
    .single()
  if (error || !data) return NextResponse.json({ error: 'Création impossible' }, { status: 502 })
  await audit(admin, guard.ctx.userId, 'cooperative_created', data.id, { after: input })
  return NextResponse.json({ ok: true, id: data.id })
}
