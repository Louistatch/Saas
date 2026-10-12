/**
 * Production aliases should resolve to the canonical FaîtiereHub domain.
 * Preview deployment URLs must remain on their exact commit for QA.
 *
 * NODE_ENV is "production" for both previews and production builds;
 * VERCEL_ENV specifically distinguishes these deployment targets.
 */
export function redirectProductionVercelHost(hostname: string, vercelEnv?: string): boolean {
  return hostname.toLowerCase().endsWith('.vercel.app') && vercelEnv === 'production'
}
