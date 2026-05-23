/**
 * Security headers configuration — centralized for consistency.
 * Used by next.config.mjs and can be imported by API routes that need
 * to override specific headers (e.g., embed endpoint).
 */

export const SECURITY_HEADERS = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'on',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
} as const

/**
 * Content Security Policy — strict but functional.
 * 
 * NOTE: 'unsafe-inline' for scripts is required by Next.js for inline scripts.
 * 'unsafe-eval' is required by some dependencies. Both should be removed
 * when migrating to nonce-based CSP in production.
 */
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.vercel-analytics.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ')
