import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production
  enabled: process.env.NODE_ENV === 'production',

  // Performance monitoring — at 10M MAU a flat 10% is millions of txns/day and
  // blows the quota. Use a low base rate and oversample only critical paths.
  tracesSampler: (ctx) => {
    const name = ctx.name ?? ''
    // Always trace auth + payment-critical flows.
    if (name.includes('/auth') || name.includes('/api/auth')) return 0.5
    if (name.includes('/api/webhooks')) return 0.2
    // Everything else: 1% baseline.
    return 0.01
  },

  // Session replay for debugging — keep error replays, drop ambient sessions
  // (replays are the costliest signal at scale).
  replaysSessionSampleRate: 0.001,
  replaysOnErrorSampleRate: 1.0,

  // Filter out noisy errors
  ignoreErrors: [
    'ResizeObserver loop',
    'Non-Error promise rejection',
    'Load failed',
    'Failed to fetch',
    'AbortError',
  ],

  integrations: [
    Sentry.replayIntegration(),
    Sentry.browserTracingIntegration(),
  ],
})
