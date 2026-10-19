import { fedaPayDisabledProviders, fedaPayEnv, isFedaPayConfigured } from '@/lib/payments/fedapay'
import { FedaPayConfigError, offeredProviders } from '@/lib/payments/fedapay-providers'
import { NextResponse } from 'next/server'

const UNAVAILABLE = 'Le paiement en ligne n’est pas disponible pour le moment. Réessayez plus tard.'

/**
 * GET /api/payments/fedapay/providers — opérateurs Mobile Money proposés à
 * l'acheteur. Le paiement est TOUJOURS direct (demande envoyée sur le
 * téléphone, sans quitter le site) : `mode` vaut toujours `direct`, il n'existe
 * plus de page de paiement FedaPay. Les opérateurs masqués par
 * FEDAPAY_DISABLED_PROVIDERS sont absents de la liste.
 *
 * 200 { environment, configured: true, providers: [{ id, label, country, mode }] }
 * 503 { error, providers: [] }, jamais mis en cache : clé FedaPay absente,
 * FedaPay mal configuré, ou tous les opérateurs masqués. La fenêtre d'achat
 * affiche alors « indisponible » et le contact, sans formulaire.
 * Aucun secret : seul l'environnement (sandbox / live) est exposé.
 */
export function GET() {
  const unavailable = (error: string) =>
    NextResponse.json(
      { error, providers: [] },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  // Clé retirée (moyen évident de couper les paiements) : aucun formulaire.
  if (!isFedaPayConfigured()) return unavailable(UNAVAILABLE)
  let environment: ReturnType<typeof fedaPayEnv>
  try {
    environment = fedaPayEnv()
  } catch (e) {
    if (!(e instanceof FedaPayConfigError)) throw e
    return unavailable(UNAVAILABLE)
  }
  const providers = offeredProviders(fedaPayDisabledProviders()).map((p) => ({
    id: p.id,
    label: p.label,
    country: p.country,
    mode: 'direct' as const,
  }))
  if (providers.length === 0)
    return unavailable(
      'Le paiement Mobile Money est momentanément indisponible. Réessayez plus tard.',
    )
  return NextResponse.json(
    { environment, configured: true, providers },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  )
}
