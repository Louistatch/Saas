// Doublons : détection (GET) et fusion décidée par le super_admin (POST). Rien n'est supprimé :
// le doublon est archivé et tout ce qui lui était rattaché passe sur la fiche gardée.
import { findDuplicates } from '@/lib/dedup/detect'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const result = await findDuplicates(createAdminClient())
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
}

const schema = z.object({
  type: z.enum(['organization', 'member']),
  keep: z.string().uuid(),
  archive: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || parsed.data.keep === parsed.data.archive) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
  const { type, keep, archive } = parsed.data
  const { data, error } = await createAdminClient().rpc(
    type === 'organization' ? 'merge_cooperatives' : 'merge_members',
    { p_keep: keep, p_dup: archive, p_actor: guard.ctx.userId },
  )
  if (error) {
    return NextResponse.json({ error: `Fusion impossible : ${error.message}` }, { status: 422 })
  }
  return NextResponse.json({ ok: true, result: data })
}
