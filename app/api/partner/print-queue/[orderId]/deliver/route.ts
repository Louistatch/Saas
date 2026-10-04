// Marque une commande (entièrement imprimée) comme livrée à l'organisation.

import { markOrderDelivered } from '@/lib/cards/print-orders'
import { emailUser } from '@/lib/email/resend'
import { getPartnerContext } from '@/lib/security/assert-partner-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'

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
  // markOrderDelivered ne réussit que sur la transition printed → delivered.
  after(async () => {
    const { data: delivered } = await admin
      .from('card_print_orders')
      .select('requested_by')
      .eq('id', orderId)
      .maybeSingle()
    await emailUser(delivered?.requested_by, 'Vos cartes ont été livrées', {
      title: 'Commande de cartes livrée',
      lines: [
        'Bonjour,',
        'Votre commande d’impression de cartes membres a été marquée comme livrée par l’Opérateur.',
        'Merci de vérifier la réception et de nous signaler tout écart.',
      ],
      cta: { label: 'Voir mes cartes', path: '/dashboard/cards/print-orders' },
    })
  })

  return NextResponse.json(result)
}
