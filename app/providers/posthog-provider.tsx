'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Analytics } from '@vercel/analytics/next'
import posthog from 'posthog-js'
import { SiteVisitTracker } from '@/components/shared/site-visit-tracker'
import { ANALYTICS_EVENT, analyticsPath, readAnalyticsChoice, saveAnalyticsChoice, type AnalyticsChoice } from '@/lib/analytics/privacy'

let initialized = false
function consentGranted() {
  try { return typeof window !== 'undefined' && readAnalyticsChoice(window.localStorage) === 'granted' }
  catch { return false }
}
function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (initialized || !key || !consentGranted()) return
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    capture_pageview: false, capture_pageleave: false, autocapture: false,
    persistence: 'memory', person_profiles: 'never', ip: false,
    disable_session_recording: true, disable_surveys: true, capture_exceptions: false,
    advanced_disable_feature_flags: true, disable_external_dependency_loading: true,
    request_batching: false, remote_config_refresh_interval_ms: 0,
    before_send: event => {
      if (!consentGranted() || event.event !== '$pageview') return null
      // No referrer, form value, user/cooperative ID or raw URL.
      const path = analyticsPath(window.location.pathname)
      return {uuid: event.uuid, event: event.event, timestamp: event.timestamp, properties: {
        token: event.properties.token, distinct_id: event.properties.distinct_id,
        $current_url: window.location.origin + path, $pathname: path, $process_person_profile: false,
      }}
    },
  })
  initialized = true
}
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const enabled = process.env.NODE_ENV === 'production'
  const [choice, setChoice] = useState<AnalyticsChoice | null>(null)
  const [showChoice, setShowChoice] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const refresh = () => {
      let next: AnalyticsChoice | null = null
      try { next = readAnalyticsChoice(window.localStorage) } catch {}
      setChoice(next); setShowChoice(next === null)
      if (next === 'granted') initPostHog()
    }
    const reopen = () => setShowChoice(true)
    refresh()
    window.addEventListener(ANALYTICS_EVENT, refresh)
    window.addEventListener('storage', refresh)
    window.addEventListener('fhub:analytics-settings', reopen)
    return () => {
      window.removeEventListener(ANALYTICS_EVENT, refresh)
      window.removeEventListener('storage', refresh)
      window.removeEventListener('fhub:analytics-settings', reopen)
    }
  }, [enabled])
  useEffect(() => {
    if (enabled && choice === 'granted' && initialized) posthog.capture('$pageview')
  }, [pathname, choice, enabled])
  function choose(next: AnalyticsChoice) {
    saveAnalyticsChoice(next); setShowChoice(false)
    if (next === 'denied') {
      if (initialized) posthog.reset()
      void fetch('/api/track-visit', {method: 'DELETE'}).catch(() => {})
    }
  }
  return <>
    {children}
    {enabled && choice === 'granted' && <>
      <Analytics beforeSend={event => consentGranted() ? {...event, url: new URL(event.url, window.location.origin).origin + analyticsPath(event.url)} : null} />
      <SiteVisitTracker />
    </>}
    {enabled && showChoice && <section aria-label="Préférences de mesure d’audience" className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-2xl rounded-xl border bg-background p-5 shadow-xl">
      <p className="text-sm">Autorisez-vous la mesure d’audience pour améliorer FaîtiereHub ? Elle mesure les pages consultées et la provenance de connexion, sans le contenu des formulaires. Votre choix est valable six mois.</p>
      <div className="mt-3 flex flex-wrap gap-3 items-center">
        <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => choose('denied')}>Refuser</button>
        <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => choose('granted')}>Accepter</button>
        <a href="/legal/cookies" className="text-sm underline">En savoir plus</a>
      </div>
    </section>}
  </>
}
/** Callers retain compatibility; identifiers are never sent to analytics. */
export function identifyUser(_userId: string, _role: string, _cooperativeId?: string) {}
export function resetAnalytics() { if (initialized) posthog.reset() }
