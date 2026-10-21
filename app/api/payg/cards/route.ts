// Cartes émises au titre d'un opérateur : toutes pour le gérant, les siennes pour un agent.

import { roleAtLeast } from '@/lib/payg/model'
import { profileNames, requirePaygMember } from '@/lib/payg/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const guard = await requirePaygMember(url.searchParams.get('partner_id'))
  if (!guard.ok) return guard.response
  const { ctx, membership } = guard
  const manager = roleAtLeast(membership.role, 'manager')
  const agentFilter = url.searchParams.get('agent_id')
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100))

  let query = ctx.admin
    .from('card_issuance_requests')
    .select(
      'member_card_id, mode, actor_id, created_at, member_cards(card_number, status, cooperative_id, cooperatives(name)), members(first_name, last_name)',
    )
    .eq('partner_id', membership.partnerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (!manager) query = query.eq('actor_id', ctx.userId)
  else if (agentFilter) query = query.eq('actor_id', agentFilter)
  const { data, error } =
    await query.returns<
      {
        member_card_id: string
        mode: string
        actor_id: string | null
        created_at: string
        member_cards: {
          card_number: string
          status: string
          cooperative_id: string | null
          cooperatives: { name: string } | null
        } | null
        members: { first_name: string; last_name: string } | null
      }[]
    >()
  if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 502 })

  const ids = (data ?? []).map((r) => r.member_card_id)
  const { data: commissions } = ids.length
    ? await ctx.admin
        .from('card_commissions')
        .select('member_card_id, source, card_format, status, producer_price_fcfa')
        .in('member_card_id', ids)
    : { data: [] }
  const commissionOf = new Map((commissions ?? []).map((c) => [c.member_card_id, c]))
  const names = await profileNames(
    ctx.admin,
    (data ?? []).map((r) => r.actor_id).filter((x): x is string => !!x),
  )

  return NextResponse.json({
    cards: (data ?? []).map((r) => {
      const c = commissionOf.get(r.member_card_id)
      return {
        member_card_id: r.member_card_id,
        card_number: r.member_cards?.card_number ?? '',
        card_status: r.member_cards?.status ?? 'unknown',
        cooperative: r.member_cards?.cooperatives?.name ?? '',
        producer: [r.members?.first_name, r.members?.last_name].filter(Boolean).join(' '),
        mode: r.mode,
        source: c?.source ?? null,
        commission_status: c?.status ?? null,
        card_format: c?.card_format ?? 'digital',
        producer_price_fcfa: c?.producer_price_fcfa ?? null,
        issued_by: r.actor_id ? (names.get(r.actor_id)?.name ?? '') : '',
        issued_at: r.created_at,
      }
    }),
  })
}
