import type { Metadata } from 'next'

// [SECURITY FIX - PHANTOM-001] Métadonnées anti-phishing pour la page de vérification
export const metadata: Metadata = {
  title: 'Vérification officielle carte membre — FaîtiereHub',
  description: 'Page officielle de vérification des cartes membres FENOMAT. Vérifiez l\'authenticité d\'une carte membre en scannant le QR code.',
  robots: { index: false, follow: false }, // Ne pas indexer les pages de vérification individuelles
  openGraph: {
    title: 'Vérification officielle — FaîtiereHub',
    description: 'Page officielle de vérification des cartes membres FENOMAT.',
    siteName: 'FaîtiereHub',
    url: 'https://www.faitierehub.com/verify',
  },
  // Prevent all caching at the HTML level
  other: {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  },
}

// Force dynamic rendering — never statically cache this route
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Layout for /verify pages — NO auth providers, NO caching.
 * This is a public page (QR code scanning) that must:
 * - Always fetch fresh data
 * - Never serve stale cached content
 * - Work without any authentication context
 */
export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
