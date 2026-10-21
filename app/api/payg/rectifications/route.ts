// Demandes de rectification des données d'un producteur, déposées par l'opérateur qui les a
// reçues (le producteur, sa coopérative). Suivies jusqu'à leur résolution par FaîtièreHub.

import { readJson } from '@/lib/payg/http'
import { cooperativesFor, deny, logActivity, requirePaygMember } from '@/lib/payg/server'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  const guard = await requirePaygMember(new URL(request.url).searchParams.get('partner_id'))
  if (!guard.ok) return guard.response
  const { data } = await guard.ctx.admin
    .from('data_rectification_requests')
    .select(
      'id, cooperative_id, member_id, requested_via, description, status, resolution, created_at, resolved_at, cooperatives(name), members(first_name, last_name)',
    )
    .eq('partner_id', guard.membership.partnerId)
    .order('created_at', { ascending: false })
    .limit(100)
  return NextResponse.json({ requests: data ?? [] })
}

const bodySchema = z.object({
  partner_id: z.string().uuid(),
  cooperative_id: z.string().uuid(),
  member_id: z.string().uuid().optional(),
  requested_via: z.enum(['agent', 'cooperative', 'producer']),
  description: z.string().trim().min(5).max(2000),
})

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await readJson(request))
  if (!parsed.success) return deny(400, 'Décrivez la correction demandée (5 caractères minimum)')
  const guard = await requirePaygMember(parsed.data.partner_id)
  if (!guard.ok) return guard.response
  const { ctx, membership } = guard
  const coops = await cooperativesFor(ctx.admin, ctx.userId, membership)
  if (!coops.some((c) => c.id === parsed.data.cooperative_id)) {
    return deny(403, 'Cette coopérative ne vous est pas confiée')
  }
  if (parsed.data.member_id) {
    const { data: member } = await ctx.admin
      .from('members')
      .select('cooperative_id')
      .eq('id', parsed.data.member_id)
      .maybeSingle()
    if (member?.cooperative_id !== parsed.data.cooperative_id)
      return deny(422, 'Producteur hors de cette coopérative')
  }
  const { data, error } = await ctx.admin
    .from('data_rectification_requests')
    .insert({
      cooperative_id: parsed.data.cooperative_id,
      member_id: parsed.data.member_id ?? null,
      partner_id: membership.partnerId,
      requested_via: parsed.data.requested_via,
      description: parsed.data.description,
      created_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error || !data) return deny(502, 'Enregistrement impossible')
  await logActivity(ctx.admin, {
    partnerId: membership.partnerId,
    actorId: ctx.userId,
    action: 'rectification.created',
    cooperativeId: parsed.data.cooperative_id,
    memberId: parsed.data.member_id ?? null,
    details: { request_id: data.id },
  })
  return NextResponse.json({ id: data.id, status: 'open' })
}
