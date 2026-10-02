import { settlePurchase } from '@/lib/fiches/purchases'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/payments/fedapay/return?purchase=… — retour du client après paiement.
 * Le statut transmis par FedaPay dans l'URL est ignoré : l'achat est réglé d'après
 * la transaction relue auprès de FedaPay, puis on renvoie vers la page de l'achat.
 */
export async function GET(request: NextRequest) {
  const purchaseId = new URL(request.url).searchParams.get('purchase') ?? ''
  const origin = new URL(request.url).origin
  if (!/^[0-9a-f-]{36}$/i.test(purchaseId)) return NextResponse.redirect(`${origin}/marketplace`)
  await settlePurchase(purchaseId)
  return NextResponse.redirect(`${origin}/marketplace/achat/${purchaseId}`)
}
