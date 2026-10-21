// Producteurs d'une coopérative confiée, avec leur carte. Lecture par le client de
// l'utilisateur : la RLS (has_partner_org_access) applique mandat, certification et, pour un
// agent, ses coopératives. Chaque consultation est tracée (historique des accès).

import { cooperativesFor, deny, logActivity, requirePaygMember } from '@/lib/payg/server'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const PAGE = 50

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ coopId: string }> },
) {
  const { coopId } = await params
  if (!z.string().uuid().safeParse(coopId).success) return deny(400, 'Coopérative invalide')
  const url = new URL(request.url)
  const guard = await requirePaygMember(url.searchParams.get('partner_id'))
  if (!guard.ok) return guard.response
  const { ctx, membership } = guard

  const coops = await cooperativesFor(ctx.admin, ctx.userId, membership)
  const coop = coops.find((c) => c.id === coopId)
  if (!coop) return deny(403, 'Cette coopérative ne vous est pas confiée')

  const filter = url.searchParams.get('filter') ?? 'all'
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60)
  const page = Math.max(0, Number(url.searchParams.get('page') ?? 0) || 0)

  let query = ctx.supabase
    .from('members')
    .select('id, first_name, last_name, village, photo_url, status', { count: 'exact' })
    .eq('cooperative_id', coopId)
    .is('deleted_at', null)
    .order('last_name')
    .range(page * PAGE, page * PAGE + PAGE - 1)
  if (q) {
    const safe = q.replace(/[%_,()]/g, ' ')
    query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`)
  }
  const { data: members, count, error } = await query
  if (error) return deny(502, 'Lecture des producteurs impossible')

  const ids = (members ?? []).map((m) => m.id)
  const { data: cards } = ids.length
    ? await ctx.supabase
        .from('member_cards')
        .select('id, member_id, card_number, expiry_date')
        .in('member_id', ids)
        .eq('status', 'active')
        .is('deleted_at', null)
    : { data: [] }
  const cardIds = (cards ?? []).map((c) => c.id)
  const { data: commissions } = cardIds.length
    ? await ctx.admin
        .from('card_commissions')
        .select('member_card_id, source, card_format, status')
        .in('member_card_id', cardIds)
    : { data: [] }
  const commissionOf = new Map((commissions ?? []).map((c) => [c.member_card_id, c]))
  const cardOf = new Map((cards ?? []).map((c) => [c.member_id, c]))

  const rows = (members ?? [])
    .map((m) => {
      const card = cardOf.get(m.id)
      const commission = card ? commissionOf.get(card.id) : undefined
      return {
        id: m.id,
        first_name: m.first_name,
        last_name: m.last_name,
        village: m.village,
        has_photo: Boolean(m.photo_url),
        status: m.status,
        card: card
          ? {
              id: card.id,
              card_number: card.card_number,
              expiry_date: card.expiry_date,
              commercial: commission?.status === 'consumed',
              card_format: commission?.card_format ?? 'digital',
            }
          : null,
      }
    })
    .filter((r) => (filter === 'without_card' ? !r.card : filter === 'with_card' ? !!r.card : true))

  await logActivity(ctx.admin, {
    partnerId: membership.partnerId,
    actorId: ctx.userId,
    action: 'members.viewed',
    cooperativeId: coopId,
    details: { count: rows.length, filter, page, search: q ? 'oui' : 'non' },
  })

  return NextResponse.json({
    cooperative: coop,
    members: rows,
    total: count ?? rows.length,
    page,
    page_size: PAGE,
  })
}
