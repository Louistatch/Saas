'use client'

/**
 * Trafic maison (§ demande admin) — un appel léger à chaque navigation,
 * jamais bloquant. sendBeacon survit à la fermeture d'onglet ; fetch keepalive
 * en repli pour les navigateurs qui ne le supportent pas.
 */

import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

function trackVisit(path: string) {
  const body = JSON.stringify({ path, referrer: document.referrer || undefined })
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/track-visit', new Blob([body], { type: 'application/json' }))
    return
  }
  fetch('/api/track-visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}

function TrackerInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const qs = searchParams?.toString()
    trackVisit(qs ? `${pathname}?${qs}` : pathname)
  }, [pathname, searchParams])

  return null
}

export function SiteVisitTracker() {
  return (
    <Suspense fallback={null}>
      <TrackerInner />
    </Suspense>
  )
}
