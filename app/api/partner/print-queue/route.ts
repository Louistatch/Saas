// File d'impression du Partenaire — commandes payées, pas encore livrées
// (§48 du plan : print queue / paid orders / pending printing / printed /
// delivered, en un seul relevé plutôt que cinq routes).

import { NextResponse } from 'next/server'
import { getPartnerContext } from '@/lib/security/assert-partner-access'

export async function GET() {
  const ctx = await getPartnerContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Aucune adhésion Partenaire active' }, { status: 403 })
  }

  const { data: orders } = await ctx.supabase
    .from('card_print_orders')
    .select(
      'id, cooperative_id, status, amount_fcfa, paid_at, printed_at, delivered_at, cooperatives(name), card_print_order_items(id, member_id, printed_at, reprint_count, members(first_name, last_name))',
    )
    .in('partner_id', ctx.partnerIds)
    .in('status', ['paid', 'printed'])
    .order('paid_at', { ascending: true })

  return NextResponse.json({ orders: orders ?? [] })
}
