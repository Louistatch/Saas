// Erreurs regroupées pour le super_admin : liste et résolution.
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const status = request.nextUrl.searchParams.get('status') === 'resolue' ? 'resolue' : 'nouvelle'
  const { data, error } = await createAdminClient()
    .from('app_errors')
    .select(
      'fingerprint, source, route, message, digest, occurrences, first_seen, last_seen, status, resolved_at',
    )
    .eq('status', status)
    .order('last_seen', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  return NextResponse.json({ errors: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

const patchSchema = z.object({
  fingerprint: z.string().max(64),
  status: z.enum(['nouvelle', 'resolue']),
})

export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  const resolved = parsed.data.status === 'resolue'
  const { error } = await createAdminClient()
    .from('app_errors')
    .update({
      status: parsed.data.status,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? guard.ctx.userId : null,
    })
    .eq('fingerprint', parsed.data.fingerprint)
  if (error) return NextResponse.json({ error: 'Mise à jour impossible' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
