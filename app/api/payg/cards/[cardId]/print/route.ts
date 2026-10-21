// Self-print : l'opérateur télécharge la carte (même moteur que l'organisation) et l'imprime.
// Chaque impression est tracée ; aucune n'est facturée : la commission a été prise une fois,
// à l'émission, et ne l'est jamais à nouveau.

import { renderMemberCardPng } from '@/lib/cards/render-member-card'
import { deny, logActivity, requirePaygMember } from '@/lib/payg/server'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const limit = rateLimit(`payg-print:${clientKeyFromHeaders(request.headers)}`, 60, 60_000)
  if (!limit.ok) return deny(429, 'Trop de requêtes')
  const { cardId } = await params
  if (!z.string().uuid().safeParse(cardId).success) return deny(400, 'Carte invalide')
  const guard = await requirePaygMember(new URL(request.url).searchParams.get('partner_id'))
  if (!guard.ok) return guard.response
  const { ctx, membership } = guard

  const { data: card } = await ctx.admin
    .from('member_cards')
    .select('id, card_number, expiry_date, created_at, cooperative_id, member_id, status')
    .eq('id', cardId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!card || card.status !== 'active' || !card.cooperative_id)
    return deny(404, 'Carte introuvable')

  // Même règle que la RLS : mandat, certification et, pour un agent, sa coopérative.
  const { data: allowed } = await ctx.supabase.rpc('has_partner_org_access', {
    target_coop: card.cooperative_id,
    required_scope: 'cards.print',
  })
  if (!allowed) return deny(403, 'Impression non autorisée pour cette carte')

  const png = await renderMemberCardPng(ctx.admin, card)
  if (!png) return deny(404, 'Producteur introuvable')

  await ctx.admin.from('card_print_events').insert({
    member_card_id: card.id,
    partner_id: membership.partnerId,
    actor_id: ctx.userId,
    mode: 'self',
  })
  await logActivity(ctx.admin, {
    partnerId: membership.partnerId,
    actorId: ctx.userId,
    action: 'card.printed',
    cooperativeId: card.cooperative_id,
    memberId: card.member_id,
    memberCardId: card.id,
    details: { mode: 'self', card_number: card.card_number },
  })

  return new NextResponse(png, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="carte-${card.card_number}.png"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
