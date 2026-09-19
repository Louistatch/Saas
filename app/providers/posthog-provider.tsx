'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'

/**
 * PostHog provider (Étape 4.3 — monitoring at scale).
 *
 * Captures product analytics, funnels (signup → cooperative created → first
 * card), and feature-flag rollouts. Initialized client-side only, gated on a
 * public key so it is a no-op in environments without PostHog configured.
 *
 * Scale note (10M MAU): pageviews are captured manually (capture_pageview:false)
 * so we control volume and avoid double-counting App Router client navigations.
 */

let initialized = false

function initPostHog() {
  if (initialized) return
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key || typeof window === 'undefined') return

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    capture_pageview: false, // we send $pageview manually on route change
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    autocapture: false, // explicit events only — keeps event volume predictable
    disable_session_recording: true, // enable selectively; recordings are costly at scale
    loaded: (ph) => {
      if (process.env.NODE_ENV === 'development') ph.debug()
    },
  })
  initialized = true
}

function PageviewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || typeof window === 'undefined') return
    const qs = searchParams?.toString()
    const url = qs ? `${pathname}?${qs}` : pathname
    posthog.capture('$pageview', { $current_url: window.location.origin + url })
  }, [pathname, searchParams])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog()
  }, [])

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    // No key configured — render children without the provider (no-op).
    return <>{children}</>
  }

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </PHProvider>
  )
}

/**
 * Identify the logged-in user for funnel correlation. Call after auth resolves.
 * Never send PII beyond what's necessary (id + coarse role).
 */
export function identifyUser(userId: string, role: string, cooperativeId?: string) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || typeof window === 'undefined') return
  posthog.identify(userId, { role, cooperative_id: cooperativeId ?? null })
}

/** Reset on logout so the next session is anonymous. */
export function resetAnalytics() {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || typeof window === 'undefined') return
  posthog.reset()
}
