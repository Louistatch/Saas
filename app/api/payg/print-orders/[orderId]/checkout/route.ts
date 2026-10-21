// Paiement du devis FaîtièreHub Print (fabrication + livraison), par FedaPay.

import { appUrlOf, customerOf, readJson } from '@/lib/payg/http'
import { startPaygCheckout } from '@/lib/payg/payments'
import { deny, requirePaygMember } from '@/lib/payg/server'
import { isFedaPayConfigured } from '@/lib/payments/fedapay'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params
  if (!z.string().uuid().safeParse(orderId).success) return deny(400, 'Commande invalide')
  const body = z.object({ partner_id: z.string().uuid() }).safeParse(await readJson(request))
  if (!body.success) return deny(400, 'Requête invalide')
  const guard = await requirePaygMember(body.data.partner_id, 'manager')
  if (!guard.ok) return guard.response
  const { ctx, membership } = guard
  const { data: order } = await ctx.admin
    .from('faitierehub_print_orders')
    .select('id, status, fabrication_fcfa, delivery_fcfa')
    .eq('id', orderId)
    .eq('partner_id', membership.partnerId)
    .maybeSingle()
  if (!order) return deny(404, 'Commande introuvable')
  if (order.status !== 'quoted' || order.fabrication_fcfa == null || order.delivery_fcfa == null) {
    return deny(409, 'Le devis n’est pas encore prêt')
  }
  const total = order.fabrication_fcfa + order.delivery_fcfa
  if (total <= 0) return deny(409, 'Devis à zéro : rien à payer')
  if (!isFedaPayConfigured()) return deny(503, 'Le paiement en ligne n’est pas encore ouvert.')
  const customer = await customerOf(ctx.admin, ctx.userId)
  const result = await startPaygCheckout(ctx.admin, {
    purpose: 'print_order',
    partnerId: membership.partnerId,
    userId: ctx.userId,
    amountFcfa: total,
    description: `FaîtièreHub Print — fabrication et livraison (${membership.displayName})`,
    metadata: { order_id: order.id },
    customer,
    appUrl: appUrlOf(request),
  })
  if (!result.ok) return deny(502, result.error)
  return NextResponse.json({ payment_url: result.url, reference: result.intentId })
}
