// Paiement de formation : 15 000 FCFA d'un coup ou par tranches de 3 000. La personne paie sa
// propre formation, ou le gérant de son institution la finance. Jamais imputé aux crédits PAYG.

import { appUrlOf, customerOf, readJson } from '@/lib/payg/http'
import { roleAtLeast, trainingAmountError } from '@/lib/payg/model'
import { startPaygCheckout } from '@/lib/payg/payments'
import { deny, getPaygContext } from '@/lib/payg/server'
import { isFedaPayConfigured } from '@/lib/payments/fedapay'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  account_id: z.string().uuid(),
  amount_fcfa: z.number().int().positive().max(1_000_000),
  phone: z.string().trim().min(8).max(40).optional(),
})

export async function POST(request: NextRequest) {
  const limit = rateLimit(`payg-training:${clientKeyFromHeaders(request.headers)}`, 10, 60_000)
  if (!limit.ok) return deny(429, 'Trop de requêtes')
  const parsed = bodySchema.safeParse(await readJson(request))
  if (!parsed.success) return deny(400, 'Requête invalide')
  const ctx = await getPaygContext()
  if (!ctx) return deny(401, 'Connexion requise')

  const { data: account } = await ctx.admin
    .from('training_fee_accounts')
    .select('id, user_id, partner_id, total_fcfa, installment_fcfa, paid_fcfa, payer, status')
    .eq('id', parsed.data.account_id)
    .maybeSingle()
  if (!account) return deny(404, 'Compte de formation introuvable')

  const self = account.user_id === ctx.userId
  const manager = ctx.memberships.find(
    (m) => m.partnerId === account.partner_id && roleAtLeast(m.role, 'manager'),
  )
  if (!self && !manager) return deny(403, 'Vous ne pouvez pas régler cette formation')
  if (self && !manager && account.payer === 'institution') {
    return deny(403, 'Votre institution finance votre formation : elle la règle pour vous.')
  }
  const error = trainingAmountError(
    parsed.data.amount_fcfa,
    account.total_fcfa - account.paid_fcfa,
    account.installment_fcfa,
  )
  if (error) return deny(422, error)
  if (!account.partner_id) return deny(422, 'Formation sans opérateur : contactez FaîtièreHub.')
  if (!isFedaPayConfigured()) {
    return deny(
      503,
      'Le paiement en ligne n’est pas encore ouvert. Écrivez à l’équipe FaîtièreHub.',
    )
  }

  const customer = await customerOf(ctx.admin, ctx.userId)
  const result = await startPaygCheckout(ctx.admin, {
    purpose: 'training_fee',
    partnerId: account.partner_id,
    userId: ctx.userId,
    amountFcfa: parsed.data.amount_fcfa,
    description: `Formation Opérateur FaîtièreHub (${parsed.data.amount_fcfa} FCFA)`,
    metadata: { account_id: account.id, trainee: account.user_id },
    customer: { ...customer, phone: parsed.data.phone ?? null },
    appUrl: appUrlOf(request),
  })
  if (!result.ok) return deny(502, result.error)
  return NextResponse.json({ payment_url: result.url, reference: result.intentId })
}
