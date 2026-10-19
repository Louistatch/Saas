import { settlePurchase } from '@/lib/fiches/purchases'
import {
  certificationIntentForTransaction,
  settleCertificationIntent,
} from '@/lib/partners/certification-payment'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/payments/fedapay/webhook — notification FedaPay (transaction.*) : achats de comptes
 * d'exploitation et frais de certification Opérateur.
 *
 * Le corps n'est jamais cru sur parole : on n'en tire que l'identifiant de la
 * transaction, l'achat correspondant est ensuite réglé d'après FedaPay lui-même
 * (GET /transactions/{id}). Une notification forgée ne peut donc rien ouvrir.
 * Vaut aussi pour un achat déjà en échec : un « transaction.approved » arrivé
 * après un refus est relu, et l'achat réglé s'il correspond (settlePurchase).
 * Répond 200 pour que FedaPay ne réessaie pas indéfiniment une transaction inconnue.
 */
export async function POST(request: NextRequest) {
  // biome-ignore lint/suspicious/noExplicitAny: événement FedaPay, seul l'id est lu
  const body = (await request.json().catch(() => null)) as any
  const txId = body?.entity?.id ?? body?.data?.id ?? body?.['v1/transaction']?.id
  if (!txId) return NextResponse.json({ ok: true })
  const { data } = await createAdminClient()
    .from('purchases')
    .select('id')
    .eq('provider', 'fedapay')
    .eq('provider_transaction_id', String(txId))
    .maybeSingle<{ id: string }>()
  if (data) await settlePurchase(data.id)
  else {
    // Frais de certification Opérateur (même relecture auprès de FedaPay).
    const intentId = await certificationIntentForTransaction(String(txId))
    if (intentId) await settleCertificationIntent(intentId)
  }
  return NextResponse.json({ ok: true })
}
