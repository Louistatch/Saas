/**
 * Trivial in-memory token-bucket rate limiter.
 * Good enough to defend simple scraping on a single Node instance —
 * for production deployments behind a load balancer use an external store
 * (Upstash Redis, etc.).
 */

interface Bucket {
  tokens: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    const resetAt = now + windowMs
    buckets.set(key, { tokens: limit - 1, resetAt })
    return { ok: true, remaining: limit - 1, resetAt }
  }
  if (bucket.tokens <= 0) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt }
  }
  bucket.tokens -= 1
  return { ok: true, remaining: bucket.tokens, resetAt: bucket.resetAt }
}

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function isUuid(value: string | null): value is string {
  return !!value && UUID_RE.test(value)
}

export function clientKeyFromHeaders(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'anon'
  )
}
