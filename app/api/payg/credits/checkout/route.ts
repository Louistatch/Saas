// Recharge du portefeuille PAYG : un pack de 20, 40 ou 100 crédits, au prix de la commission
// en vigueur (jamais de remise cachée), payé sur la page FedaPay. Le crédit n'arrive qu'une
// fois la transaction relue chez FedaPay (lib/payg/payments.ts). Gérant ou propriétaire.

import { appUrlOf, customerOf, readJson } from '@/lib/payg/http'
import { packIsCoherent } from '@/lib/payg/model'
import { startPaygCheckout } from '@/lib/payg/payments'
import { deny, requirePaygMember } from '@/lib/payg/server'
import { isFedaPayConfigured } from '@/lib/payments/fedapay'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  partner_id: z.string().uuid(),
  pack_code: z.enum(['credit_pack_20', 'credit_pack_40', 'credit_pack_100']),
  phone: z.string().trim().min(8).max(40).optional(),
})

export async function POST(request: NextRequest) {
  const limit = rateLimit(`payg-topup:${clientKeyFromHeaders(request.headers)}`, 10, 60_000)
  if (!limit.ok) return deny(429, 'Trop de requêtes')
  const parsed = bodySchema.safeParse(await readJson(request))
  if (!parsed.success) return deny(400, 'Requête invalide')
  const guard = await requirePaygMember(parsed.data.partner_id, 'manager')
  if (!guard.ok) return guard.response
  const { ctx, membership } = guard
  if (membership.status !== 'active' && membership.status !== 'certified') {
    return deny(403, 'La recharge s’ouvre quand votre compte opérateur est certifié.')
  }

  const { data: rules } = await ctx.admin
    .from('billing_rules')
    .select('code, price_xof, metadata')
    .in('code', [parsed.data.pack_code, 'card_commission'])
    .eq('active', true)
    .is('effective_to', null)
  const pack = rules?.find((r) => r.code === parsed.data.pack_code)
  const commission = rules?.find((r) => r.code === 'card_commission')
  const credits = Number((pack?.metadata as { credits?: number } | null)?.credits ?? 0)
  if (!pack || !commission || !packIsCoherent(credits, pack.price_xof, commission.price_xof)) {
    return deny(503, 'Tarif indisponible : contactez FaîtièreHub.')
  }
  if (!isFedaPayConfigured()) {
    return deny(
      503,
      'Le paiement en ligne n’est pas encore ouvert. Écrivez à l’équipe FaîtièreHub.',
    )
  }

  const customer = await customerOf(ctx.admin, ctx.userId)
  const result = await startPaygCheckout(ctx.admin, {
    purpose: 'credit_pack',
    partnerId: membership.partnerId,
    userId: ctx.userId,
    amountFcfa: pack.price_xof,
    description: `${credits} crédits FaîtièreHub — ${membership.displayName}`,
    metadata: { credits, pack_code: pack.code },
    customer: { ...customer, phone: parsed.data.phone ?? null },
    appUrl: appUrlOf(request),
  })
  if (!result.ok) return deny(502, result.error)
  return NextResponse.json({ payment_url: result.url, reference: result.intentId })
}
