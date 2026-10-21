// Confier une coopérative à un agent (dans le mandat de l'institution, avec ses périmètres)
// ou la lui retirer. La base refuse d'elle-même une coopérative hors mandat ou un agent qui
// n'est plus membre (trigger trg_check_agent_cooperative).

import { readJson } from '@/lib/payg/http'
import { deny, logActivity, requirePaygMember } from '@/lib/payg/server'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const SCOPES = [
  'members.read',
  'members.manage',
  'cards.read',
  'cards.manage',
  'cards.print',
] as const

const bodySchema = z.object({
  partner_id: z.string().uuid(),
  cooperative_id: z.string().uuid(),
  scopes: z.array(z.enum(SCOPES)).min(1).optional(),
})

async function guarded(request: NextRequest, userId: string) {
  if (!z.string().uuid().safeParse(userId).success) return { error: deny(400, 'Agent invalide') }
  const parsed = bodySchema.safeParse(await readJson(request))
  if (!parsed.success) return { error: deny(400, 'Requête invalide') }
  const guard = await requirePaygMember(parsed.data.partner_id, 'manager')
  if (!guard.ok) return { error: guard.response }
  if (guard.membership.kind !== 'institutional') {
    return { error: deny(403, 'Réservé aux opérateurs institutionnels') }
  }
  return { body: parsed.data, ctx: guard.ctx, membership: guard.membership }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params
  const g = await guarded(request, userId)
  if ('error' in g) return g.error
  const { body, ctx, membership } = g
  const { error } = await ctx.admin.from('partner_agent_cooperatives').insert({
    partner_id: membership.partnerId,
    user_id: userId,
    cooperative_id: body.cooperative_id,
    scopes: body.scopes ?? [...SCOPES],
    assigned_by: ctx.userId,
  })
  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: true, already: true })
    if (error.code === 'P0021')
      return deny(422, 'L’institution n’a pas de mandat sur cette coopérative')
    if (error.code === 'P0020') return deny(422, 'Ce compte n’est pas agent actif de l’institution')
    return deny(502, 'Affectation impossible')
  }
  await logActivity(ctx.admin, {
    partnerId: membership.partnerId,
    actorId: ctx.userId,
    action: 'agent.cooperative_assigned',
    cooperativeId: body.cooperative_id,
    details: { agent: userId, scopes: body.scopes ?? SCOPES },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params
  const g = await guarded(request, userId)
  if ('error' in g) return g.error
  const { body, ctx, membership } = g
  await ctx.admin
    .from('partner_agent_cooperatives')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: ctx.userId })
    .eq('partner_id', membership.partnerId)
    .eq('user_id', userId)
    .eq('cooperative_id', body.cooperative_id)
    .eq('status', 'active')
  await logActivity(ctx.admin, {
    partnerId: membership.partnerId,
    actorId: ctx.userId,
    action: 'agent.cooperative_revoked',
    cooperativeId: body.cooperative_id,
    details: { agent: userId },
  })
  return NextResponse.json({ ok: true })
}
