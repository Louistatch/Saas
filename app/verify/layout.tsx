import type { Metadata } from 'next'

export const metadata: Metadata = {
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
