import { ANALYTICS_CHOICE } from '../../lib/analytics/privacy'

/**
 * Browser state of a visitor who already answered the audience-measurement banner (refused),
 * stored the way `saveAnalyticsChoice` does. A production build (`next start`) shows that banner
 * fixed over the bottom of the screen until a choice exists, on top of the buttons these suites
 * press; they start past it. The banner itself is covered by e2e/production-hardening.spec.ts.
 */
export function audienceChoiceMade(origin: string) {
  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: ANALYTICS_CHOICE, value: JSON.stringify({ choice: 'denied', at: Date.now() }) },
        ],
      },
    ],
  }
}
