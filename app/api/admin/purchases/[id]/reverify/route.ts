import { settlePurchaseDetailed } from '@/lib/fiches/purchases'
import { assertRole } from '@/lib/security/assert-access'
import { rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * POST /api/admin/purchases/[id]/reverify — revérification manuelle d'un achat
 * auprès de FedaPay (super_admin). Même règle que le webhook et le cron
 * (settlePurchase) : rien n'est décidé ici, seul FedaPay fait foi.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  if (!rateLimit(`purchase-reverify:${guard.ctx.userId}`, 30, 60_000).ok)
    return NextResponse.json(
      { error: 'Trop de revérifications. Patientez une minute.' },
      { status: 429 },
    )

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Achat invalide' }, { status: 400 })

  const outcome = await settlePurchaseDetailed(id)
  if (!outcome.purchase) return NextResponse.json({ error: 'Achat introuvable' }, { status: 404 })
  const p = outcome.purchase
  return NextResponse.json(
    {
      purchase: {
        id: p.id,
        payment_status: p.payment_status,
        access_granted: p.access_granted,
        paid_at: p.paid_at,
        provider_transaction_id: p.provider_transaction_id,
      },
      fedapay_status: outcome.txStatus,
      changed: outcome.changed,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
