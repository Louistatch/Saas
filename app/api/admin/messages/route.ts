// Boîte de réception super_admin : messages de contact et demandes d'accès (contact_messages).
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const status = request.nextUrl.searchParams.get('status') === 'traite' ? 'traite' : 'nouveau'
  const { data, error } = await createAdminClient()
    .from('contact_messages')
    .select('id, name, email, category, subject, message, status, created_at')
    .eq('status', status)
    .order('created_at', { ascending: status === 'nouveau' })
    .limit(100)
  if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  return NextResponse.json(
    { messages: data ?? [] },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

const patchSchema = z.object({ id: z.string().uuid(), status: z.enum(['nouveau', 'traite']) })

export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  const { error } = await createAdminClient()
    .from('contact_messages')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id)
  if (error) return NextResponse.json({ error: 'Mise à jour impossible' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
