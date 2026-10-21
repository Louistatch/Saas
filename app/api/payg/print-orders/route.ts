// FaîtièreHub Print : l'opérateur commande la fabrication et la livraison de cartes déjà
// émises comme cartes commerciales (commission prise une fois, jamais reprise). FaîtièreHub
// établit un devis (fabrication + livraison, distincts de la commission), l'opérateur paie,
// puis production, expédition, livraison. Aucune livraison n'est promise gratuite.

import { readJson } from '@/lib/payg/http'
import { deny, logActivity, requirePaygMember } from '@/lib/payg/server'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  const guard = await requirePaygMember(
    new URL(request.url).searchParams.get('partner_id'),
    'manager',
  )
  if (!guard.ok) return guard.response
  const { data } = await guard.ctx.admin
    .from('faitierehub_print_orders')
    .select(
      'id, status, card_format, delivery_address, delivery_contact, note, fabrication_fcfa, delivery_fcfa, quote_note, quoted_at, paid_at, shipped_at, delivered_at, cancelled_at, created_at, faitierehub_print_order_items(member_card_id)',
    )
    .eq('partner_id', guard.membership.partnerId)
    .order('created_at', { ascending: false })
    .limit(100)
  return NextResponse.json({
    orders: (data ?? []).map(({ faitierehub_print_order_items, ...o }) => ({
      ...o,
      cards: faitierehub_print_order_items.length,
      total_fcfa:
        o.fabrication_fcfa == null || o.delivery_fcfa == null
          ? null
          : o.fabrication_fcfa + o.delivery_fcfa,
    })),
  })
}

const bodySchema = z.object({
  partner_id: z.string().uuid(),
  card_ids: z.array(z.string().uuid()).min(1).max(500),
  card_format: z.enum(['plastified', 'pvc']),
  delivery_address: z.string().trim().min(5).max(300),
  delivery_contact: z.string().trim().min(5).max(120),
  note: z.string().trim().max(500).optional(),
})

export async function POST(request: NextRequest) {
  const limit = rateLimit(`payg-print-order:${clientKeyFromHeaders(request.headers)}`, 10, 60_000)
  if (!limit.ok) return deny(429, 'Trop de requêtes')
  const parsed = bodySchema.safeParse(await readJson(request))
  if (!parsed.success) return deny(400, 'Commande invalide (cartes, format, adresse et contact)')
  const guard = await requirePaygMember(parsed.data.partner_id, 'manager')
  if (!guard.ok) return guard.response
  const { ctx, membership } = guard
  const ids = [...new Set(parsed.data.card_ids)]

  // Seules les cartes commerciales de CET opérateur (commission consommée) s'impriment ici.
  const { data: commissions } = await ctx.admin
    .from('card_commissions')
    .select('member_card_id')
    .eq('partner_id', membership.partnerId)
    .eq('status', 'consumed')
    .in('member_card_id', ids)
  const eligible = new Set((commissions ?? []).map((c) => c.member_card_id))
  const refused = ids.filter((id) => !eligible.has(id))
  if (refused.length) {
    return deny(
      422,
      `${refused.length} carte(s) ne sont pas des cartes commerciales de votre compte : émettez-les d’abord.`,
    )
  }

  const { data: order, error } = await ctx.admin
    .from('faitierehub_print_orders')
    .insert({
      partner_id: membership.partnerId,
      requested_by: ctx.userId,
      card_format: parsed.data.card_format,
      delivery_address: parsed.data.delivery_address,
      delivery_contact: parsed.data.delivery_contact,
      note: parsed.data.note ?? null,
    })
    .select('id')
    .single()
  if (error || !order) return deny(502, 'Commande impossible')
  const { error: itemsError } = await ctx.admin
    .from('faitierehub_print_order_items')
    .insert(ids.map((id) => ({ order_id: order.id, member_card_id: id })))
  if (itemsError) {
    await ctx.admin
      .from('faitierehub_print_orders')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', order.id)
    return deny(502, 'Commande impossible')
  }
  await logActivity(ctx.admin, {
    partnerId: membership.partnerId,
    actorId: ctx.userId,
    action: 'print_order.created',
    details: { order_id: order.id, cards: ids.length, card_format: parsed.data.card_format },
  })
  return NextResponse.json({ order_id: order.id, status: 'quote_requested' })
}
