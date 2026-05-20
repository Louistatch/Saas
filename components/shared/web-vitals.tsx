'use client'

import { useReportWebVitals } from 'next/web-vitals'

/**
 * Reports Core Web Vitals to Sentry and console (dev).
 * Mount once in the root layout.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    // Log in dev
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[vitals] ${metric.name}: ${Math.round(metric.value)}ms`)
    }

    // Send to Sentry as custom measurement
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
      const { name, value, id } = metric
      // @ts-expect-error — Sentry types may not include this yet
      window.__SENTRY__?.hub?.getClient()?.captureEvent?.({
        type: 'transaction',
        transaction: `web-vital/${name}`,
        measurements: {
          [name]: { value, unit: 'millisecond' },
        },
        tags: { metric_id: id },
      })
    }
  })

  return null
}
