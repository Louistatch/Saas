// Création d'un mandat Partenaire ↔ Organisation — super_admin uniquement,
// mécanisme pilote en attendant un parcours en libre-service pour les
// organisations (§13, §19 du plan). Voir lib/partners/assignments.ts.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { assignPartnerToOrganization } from '@/lib/partners/assignments'
import { PARTNER_ACCESS_SCOPES } from '@/types/domain'

const bodySchema = z.object({
  partner_id: z.string().uuid(),
  cooperative_id: z.string().uuid(),
  scopes: z.array(z.enum(PARTNER_ACCESS_SCOPES)).min(1),
  is_primary_operator: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  const result = await assignPartnerToOrganization(admin, {
    partnerId: parsed.data.partner_id,
    cooperativeId: parsed.data.cooperative_id,
    scopes: parsed.data.scopes,
    approvedBy: guard.ctx.userId,
    isPrimaryOperator: parsed.data.is_primary_operator,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Action impossible' }, { status: 422 })
  }
  return NextResponse.json(result)
}
