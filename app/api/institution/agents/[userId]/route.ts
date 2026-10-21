// Un agent d'une institution : le retirer (ses coopératives tombent avec lui, cf. trigger
// trg_revoke_agent_cooperatives) ou choisir qui finance sa formation.

import { readJson } from '@/lib/payg/http'
import { deny, ensureTrainingAccount, logActivity, requirePaygMember } from '@/lib/payg/server'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('revoke'), partner_id: z.string().uuid() }),
  z.object({
    action: z.literal('set_payer'),
    partner_id: z.string().uuid(),
    payer: z.enum(['self', 'institution']),
  }),
])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params
  if (!z.string().uuid().safeParse(userId).success) return deny(400, 'Agent invalide')
  const parsed = bodySchema.safeParse(await readJson(request))
  if (!parsed.success) return deny(400, 'Requête invalide')
  const guard = await requirePaygMember(parsed.data.partner_id, 'manager')
  if (!guard.ok) return guard.response
  const { ctx, membership } = guard
  if (membership.kind !== 'institutional')
    return deny(403, 'Réservé aux opérateurs institutionnels')

  const { data: target } = await ctx.admin
    .from('partner_memberships')
    .select('membership_role, status')
    .eq('partner_id', membership.partnerId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!target) return deny(404, 'Agent introuvable dans cette institution')

  if (parsed.data.action === 'revoke') {
    if (userId === ctx.userId) return deny(422, 'Vous ne pouvez pas vous retirer vous-même')
    if (target.membership_role === 'owner')
      return deny(403, 'Le responsable ne peut pas être retiré')
    if (target.membership_role === 'manager' && membership.role !== 'owner') {
      return deny(403, 'Seul le responsable retire un gérant')
    }
    if (target.status === 'revoked') return NextResponse.json({ ok: true, status: 'revoked' })
    const { error } = await ctx.admin
      .from('partner_memberships')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('partner_id', membership.partnerId)
      .eq('user_id', userId)
    if (error) return deny(502, 'Retrait impossible')
    await logActivity(ctx.admin, {
      partnerId: membership.partnerId,
      actorId: ctx.userId,
      action: 'agent.revoked',
      details: { agent: userId },
    })
    return NextResponse.json({ ok: true, status: 'revoked' })
  }

  const account = await ensureTrainingAccount(ctx.admin, userId, membership.partnerId)
  if (!account || account.partner_id !== membership.partnerId) {
    return deny(422, 'Cette formation dépend d’un autre opérateur')
  }
  await ctx.admin
    .from('training_fee_accounts')
    .update({ payer: parsed.data.payer, updated_at: new Date().toISOString() })
    .eq('id', account.id)
  return NextResponse.json({ ok: true, payer: parsed.data.payer })
}
