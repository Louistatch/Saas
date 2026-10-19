import { settlePurchase } from '@/lib/fiches/purchases'
import { settleCertificationIntent } from '@/lib/partners/certification-payment'
import { type NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f-]{36}$/i

/**
 * GET /api/payments/fedapay/return?purchase=… | ?certification=… — retour du client après
 * paiement sur la page hébergée FedaPay.
 * - certification : les frais de certification Opérateur passent encore par la page FedaPay
 *   (lib/partners/certification-payment.ts).
 * - purchase : ne sert plus qu'aux achats de comptes d'exploitation créés autrefois par la
 *   page FedaPay (le paiement est désormais direct, sans quitter le site) ; gardée pour qu'un
 *   tel achat encore en cours aboutisse sur sa page.
 * Le statut transmis par FedaPay dans l'URL est ignoré : l'achat ou la certification est réglé
 * d'après la transaction relue auprès de FedaPay, puis on renvoie vers la bonne page.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams
  const origin = new URL(request.url).origin
  const certification = params.get('certification') ?? ''
  if (UUID.test(certification)) {
    const state = await settleCertificationIntent(certification)
    // En attente : la référence permet à la page de relancer cette même vérification.
    const ref = state === 'pending' ? `&ref=${certification}` : ''
    return NextResponse.redirect(`${origin}/operator?certification=${state}${ref}`)
  }
  const purchaseId = params.get('purchase') ?? ''
  if (!UUID.test(purchaseId)) return NextResponse.redirect(`${origin}/marketplace`)
  await settlePurchase(purchaseId)
  return NextResponse.redirect(`${origin}/marketplace/achat/${purchaseId}`)
}
