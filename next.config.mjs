import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // strict-dynamic: scripts loaded by trusted scripts are allowed
      // unsafe-inline is ignored when strict-dynamic is present (fallback for old browsers)
      "script-src 'self' 'unsafe-inline' 'strict-dynamic' https:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https:",
      "font-src 'self'",
      `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.vercel-analytics.com https://*.vercel.app`,
      "frame-ancestors 'self'",
      "frame-src 'self' https://*.vercel.app",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
]

const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: '.',
  },
  async headers() {
    return [
      {
        source: '/((?!embed|api/widget|verify).*)',
        headers: securityHeaders,
      },
      {
        // Verify pages: NEVER cache — always fetch fresh data after QR scan
        source: '/verify/:path*',
        headers: [
          ...securityHeaders,
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
          { key: 'Surrogate-Control', value: 'no-store' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/embed',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ]
  },
}

// Sentry wraps the config for source maps upload + error tracking
// If SENTRY_DSN is not set, it gracefully does nothing.
export default withSentryConfig(nextConfig, {
  // Suppresses source maps uploading logs during build
  silent: true,
  
  // Upload source maps for better stack traces
  widenClientFileUpload: true,
  
  // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers
  tunnelRoute: '/monitoring',
  
  // Hides source maps from generated client bundles
  hideSourceMaps: true,
  
  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,
})
