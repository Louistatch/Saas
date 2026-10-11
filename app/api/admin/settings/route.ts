// Paramètres de plateforme modifiables, liste blanche, côté serveur et journalisés.
// Seule `partner_exam_passing_score` est lue par le code (certification des opérateurs).
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/supabase'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const settingsSchema = z
  .object({
    partner_exam_passing_score: z.number().int().min(0).max(100),
    platform_name: z.string().trim().min(2).max(80),
    support_email: z.string().trim().email().max(120),
  })
  .partial()
  .strict()
const KEYS = Object.keys(settingsSchema.shape)

export async function GET() {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const { data } = await createAdminClient()
    .from('platform_settings')
    .select('key, value')
    .in('key', KEYS)
  return NextResponse.json(
    { settings: Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PUT(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Valeur invalide' },
      { status: 400 },
    )
  }
  const rows = Object.entries(parsed.data).map(([key, value]) => ({ key, value }))
  if (rows.length === 0) return NextResponse.json({ ok: true })
  const admin = createAdminClient()
  const { data: before } = await admin
    .from('platform_settings')
    .select('key, value')
    .in(
      'key',
      rows.map((r) => r.key),
    )
  const { error } = await admin
    .from('platform_settings')
    .upsert(rows as Database['public']['Tables']['platform_settings']['Insert'][], {
      onConflict: 'key',
    })
  if (error) return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 502 })
  await admin.from('audit_logs').insert({
    user_id: guard.ctx.userId,
    action: 'platform_settings_changed',
    resource: 'platform_settings',
    resource_id: rows.map((r) => r.key).join(','),
    details: {
      before,
      after: parsed.data,
    } as unknown as Database['public']['Tables']['audit_logs']['Insert']['details'],
  })
  return NextResponse.json({ ok: true })
}
