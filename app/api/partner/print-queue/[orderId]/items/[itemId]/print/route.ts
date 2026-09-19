// Marque une carte comme imprimée. Réservé aux membres du Partenaire
// mandaté sur cette commande — vérifié par appartenance, pas par un simple
// identifiant de commande transmis par le client.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getPartnerContext } from '@/lib/security/assert-partner-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { markCardPrinted } from '@/lib/cards/print-orders'

const paramsSchema = z.object({ orderId: z.string().uuid(), itemId: z.string().uuid() })

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string; itemId: string }> },
) {
  const ctx = await getPartnerContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Aucune adhésion Partenaire active' }, { status: 403 })
  }

  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Identifiants invalides' }, { status: 400 })
  }

  const { data: order } = await ctx.supabase
    .from('card_print_orders')
    .select('id, partner_id')
    .eq('id', parsed.data.orderId)
    .maybeSingle<{ id: string; partner_id: string }>()
  if (!order || !ctx.partnerIds.includes(order.partner_id)) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  }

  const admin = createAdminClient()
  const result = await markCardPrinted(admin, {
    orderId: parsed.data.orderId,
    itemId: parsed.data.itemId,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Action impossible' }, { status: 422 })
  }
  return NextResponse.json(result)
}
