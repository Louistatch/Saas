// Marque une commande (entièrement imprimée) comme livrée à l'organisation.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getPartnerContext } from '@/lib/security/assert-partner-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { markOrderDelivered } from '@/lib/cards/print-orders'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const ctx = await getPartnerContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Aucune adhésion Partenaire active' }, { status: 403 })
  }

  const { orderId } = await params
  if (!z.string().uuid().safeParse(orderId).success) {
    return NextResponse.json({ error: 'Identifiant de commande invalide' }, { status: 400 })
  }

  const { data: order } = await ctx.supabase
    .from('card_print_orders')
    .select('id, partner_id')
    .eq('id', orderId)
    .maybeSingle<{ id: string; partner_id: string }>()
  if (!order || !ctx.partnerIds.includes(order.partner_id)) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  }

  const admin = createAdminClient()
  const result = await markOrderDelivered(admin, orderId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Action impossible' }, { status: 422 })
  }
  return NextResponse.json(result)
}
