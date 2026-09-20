import { type NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@/lib/supabase/admin'
import { claimPaymentForSettlement } from '@/lib/payments/settle'

interface OrangeCallbackBody {
  reference: string
  tx_id: string
  status: 'SUCCESS' | 'FAILED'
  failure_reason?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.ORANGE_MONEY_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const rawBody = await req.text()

  const signature = req.headers.get('x-orange-signature') ?? ''
  const expected = createHmac('sha256', apiKey).update(rawBody).digest('hex')
  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  const valid = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: OrangeCallbackBody
  try {
    body = JSON.parse(rawBody) as OrangeCallbackBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { reference, tx_id, status, failure_reason } = body
  if (typeof reference !== 'string' || !reference || typeof tx_id !== 'string' || !tx_id || !['SUCCESS', 'FAILED'].includes(status)) {
    return NextResponse.json({ error: 'Missing reference or status' }, { status: 400 })
  }

  const supabase = createClient()

  const { data: payment, error: fetchError } = await supabase
    .from('payments')
    .select('id, cooperative_id, cotisation_id, amount_fcfa, member_id, currency, provider')
    .eq('reference', reference)
    .single()

  if (fetchError || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  if (payment.provider !== 'orange_money') {
    return NextResponse.json({ error: 'Provider mismatch' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const isSuccess = status === 'SUCCESS'

  // Cette route n'avait aucun contrôle d'idempotence : chaque rejeu remarquait
  // la cotisation payée et réexpédiait un SMS au membre. La signature HMAC
  // authentifie l'émetteur, elle n'empêche pas la répétition — Orange Money
  // rejoue ses notifications par conception.
  // L'écriture conditionnelle sérialise : un seul appel la gagne, et les effets
  // de bord ci-dessous lui sont réservés.
  const settlement = await claimPaymentForSettlement(supabase, payment.id, {
    status: isSuccess ? 'success' : 'failed',
    provider_tx_id: tx_id ?? null,
    paid_at: isSuccess ? now : null,
    failure_reason: isSuccess ? null : (failure_reason ?? 'Payment failed'),
    updated_at: now,
  })

  if (!settlement.claimed) {
    if (settlement.reason === 'error') {
      return NextResponse.json({ error: settlement.message }, { status: 500 })
    }
    return NextResponse.json({ received: true, duplicate: true })
  }

  return NextResponse.json({ received: true })
}
