// Formation : le compte de la personne connectée et, pour le gérant d'une institution, ceux de
// tous ses agents (payeur, reste dû, étape de certification).

import { roleAtLeast } from '@/lib/payg/model'
import { getPaygContext, profileNames } from '@/lib/payg/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const ctx = await getPaygContext()
  if (!ctx) return NextResponse.json({ error: 'Connexion requise' }, { status: 401 })
  const partnerId = new URL(request.url).searchParams.get('partner_id')
  const membership = ctx.memberships.find((m) => m.partnerId === partnerId)

  const { data: own } = await ctx.admin
    .from('training_fee_accounts')
    .select('id, user_id, partner_id, total_fcfa, installment_fcfa, paid_fcfa, payer, status')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  if (!membership || !roleAtLeast(membership.role, 'manager')) {
    return NextResponse.json({ own, accounts: [] })
  }

  const { data: accounts } = await ctx.admin
    .from('training_fee_accounts')
    .select(
      'id, user_id, partner_id, total_fcfa, installment_fcfa, paid_fcfa, payer, status, paid_at',
    )
    .eq('partner_id', membership.partnerId)
    .order('created_at')
  const userIds = (accounts ?? []).map((a) => a.user_id)
  const [names, certs] = await Promise.all([
    profileNames(ctx.admin, userIds),
    userIds.length
      ? ctx.admin
          .from('partner_certifications')
          .select('user_id, training_completed_at, exam_passed_at, certified_at')
          .in('user_id', userIds)
      : Promise.resolve({
          data: [] as {
            user_id: string
            training_completed_at: string | null
            exam_passed_at: string | null
            certified_at: string | null
          }[],
        }),
  ])
  const certOf = new Map((certs.data ?? []).map((c) => [c.user_id, c]))
  return NextResponse.json({
    own,
    accounts: (accounts ?? []).map((a) => ({
      ...a,
      name: names.get(a.user_id)?.name ?? '',
      training_completed_at: certOf.get(a.user_id)?.training_completed_at ?? null,
      exam_passed_at: certOf.get(a.user_id)?.exam_passed_at ?? null,
      certified_at: certOf.get(a.user_id)?.certified_at ?? null,
    })),
  })
}
