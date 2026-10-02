import { settlePurchase } from '@/lib/fiches/purchases'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/payments/fedapay/webhook — notification FedaPay (transaction.*).
 *
 * Le corps n'est jamais cru sur parole : on n'en tire que l'identifiant de la
 * transaction, l'achat correspondant est ensuite réglé d'après FedaPay lui-même.
 * Une notification forgée ne peut donc rien ouvrir. Répond 200 pour que FedaPay
 * ne réessaie pas indéfiniment une transaction inconnue.
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
  return NextResponse.json({ ok: true })
}
