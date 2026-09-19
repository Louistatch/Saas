// notify_url CinetPay dédié aux commandes de cartes physiques — troisième
// callback du genre (cotisations, portefeuille Partenaire, maintenant
// ceci), jamais un seul callback qui devine le domaine depuis son contenu
// (§39 du plan).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { checkCinetPayTransaction } from '@/lib/payments/cinetpay'
import { claimCardOrderForSettlement } from '@/lib/payments/settle-card-order'
import { generateOrganizationEarningsForOrder } from '@/lib/cards/print-orders'

export async function POST(req: NextRequest): Promise<NextResponse> {
  let transactionId: string | null = null

  const contentType = req.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('application/json')) {
      const body = await req.json()
      transactionId = body.cpm_trans_id ?? body.transaction_id ?? null
    } else {
      const form = await req.formData()
      transactionId = (form.get('cpm_trans_id') ?? form.get('transaction_id'))?.toString() ?? null
    }
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!transactionId) {
    return NextResponse.json({ error: 'Missing cpm_trans_id' }, { status: 400 })
  }

  const check = await checkCinetPayTransaction(transactionId)
  if (!check.success) {
    return NextResponse.json({ error: check.error ?? 'Verification failed' }, { status: 502 })
  }

  const supabase = createClient()

  const { data: order, error: fetchError } = await supabase
    .from('card_print_orders')
    .select('id')
    .eq('provider_reference', transactionId)
    .single()

  if (fetchError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const isSuccess = check.status === 'ACCEPTED'
  const isTerminal =
    check.status === 'ACCEPTED' || check.status === 'REFUSED' || check.status === 'CANCELLED'

  if (!isTerminal) {
    return NextResponse.json({ received: true })
  }

  const settlement = await claimCardOrderForSettlement(supabase, order.id, {
    status: isSuccess ? 'paid' : 'cancelled',
    paid_at: isSuccess ? now : null,
    cancelled_at: isSuccess ? null : now,
    updated_at: now,
  })

  if (!settlement.claimed) {
    if (settlement.reason === 'error') {
      return NextResponse.json({ error: settlement.message }, { status: 500 })
    }
    return NextResponse.json({ received: true, duplicate: true })
  }

  if (isSuccess) {
    const earnings = await generateOrganizationEarningsForOrder(supabase, order.id)
    if (!earnings.ok) {
      // La commande est réglée mais les créances organisation n'ont pas pu
      // être écrites : ne jamais faire échouer la réponse à CinetPay pour
      // autant (il rejouerait indéfiniment sur un paiement déjà réglé).
      // L'écart — commande 'paid' sans organization_earnings — se répare
      // manuellement, la même logique que credit_partner_wallet en PR 2.
      console.error('[card-order-callback] generateOrganizationEarningsForOrder failed', {
        orderId: order.id,
        error: earnings.error,
      })
    }
  }

  return NextResponse.json({ received: true })
}
