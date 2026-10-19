// Commande de cartes membres physiques — un admin de coopérative choisit des
// membres déjà titulaires d'une carte numérique active ; le Partenaire est
// résolu depuis son mandat (§48 du plan), jamais choisi à la main.

import { createPrintOrder } from '@/lib/cards/print-orders'
import { assertTenantAccess } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  cooperative_id: z.string().uuid(),
  member_ids: z.array(z.string().uuid()).min(1).max(200),
})

export async function POST(request: NextRequest) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`print-order-create:${ip}`, 10, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const guard = await assertTenantAccess(parsed.data.cooperative_id)
  if (!guard.ok) return guard.response
  if (guard.ctx.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'Les cartes sont émises par l’opérateur de votre zone.' },
      { status: 403 },
    )
  }

  const admin = createAdminClient()
  const result = await createPrintOrder(admin, {
    cooperativeId: parsed.data.cooperative_id,
    memberIds: parsed.data.member_ids,
    requestedBy: guard.ctx.userId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Commande impossible' }, { status: 422 })
  }
  return NextResponse.json(result)
}
