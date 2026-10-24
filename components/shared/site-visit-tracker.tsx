'use client'

/**
 * Trafic maison (§ demande admin) — un appel léger à chaque navigation,
 * jamais bloquant. sendBeacon survit à la fermeture d'onglet ; fetch keepalive
 * en repli pour les navigateurs qui ne le supportent pas.
 */

import { analyticsPath } from '@/lib/analytics/privacy'
import { usePathname } from 'next/navigation'
import { Suspense, useEffect } from 'react'

function trackVisit(path: string) {
  let referrer: string | undefined
  try { referrer = document.referrer ? new URL(document.referrer).origin : undefined } catch {}
  const body = JSON.stringify({ path: analyticsPath(path), referrer })
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

  useEffect(() => {
    trackVisit(pathname)
  }, [pathname])

  return null
}

export function SiteVisitTracker() {
  return (
    <Suspense fallback={null}>
      <TrackerInner />
    </Suspense>
  )
}
