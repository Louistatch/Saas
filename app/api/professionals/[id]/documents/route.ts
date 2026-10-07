// Justificatifs d'un dossier professionnel, pour l'instruction.
//
// GET → liste + URL signées 10 min. Accès : titulaire, super_admin, ou
// Opérateur officier mandaté ('professionals.validate') sur la faîtière du
// dossier — même règle que la décision (decideDocumentAccess).

import { decideDocumentAccess } from '@/lib/professionals/core'
import { getMandatedFaitiereIds, listDocumentsWithSignedUrls } from '@/lib/professionals/server'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limit = rateLimit(`pro-docs-read:${clientKeyFromHeaders(request.headers)}`, 60, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })

  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('haroo_agronome_profiles')
    .select('user_id, faitiere_id')
    .eq('id', id)
    .maybeSingle<{ user_id: string | null; faitiere_id: string | null }>()
  if (!profile) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })

  const isOwner = profile.user_id === auth.ctx.userId
  const mandated =
    isOwner || auth.ctx.role === 'super_admin' || !profile.faitiere_id
      ? []
      : await getMandatedFaitiereIds()
  const allowed = decideDocumentAccess({
    callerId: auth.ctx.userId,
    ownerUserId: profile.user_id,
    role: auth.ctx.role,
    faitiereId: profile.faitiere_id,
    mandatedFaitiereIds: mandated,
  })
  if (!allowed || !profile.user_id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const documents = await listDocumentsWithSignedUrls(admin, profile.user_id)
  return NextResponse.json({ documents }, { headers: { 'Cache-Control': 'private, no-store' } })
}
