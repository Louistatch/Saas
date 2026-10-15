// [SECURITY FIX - GHOST-003]
// Rate limiting persistant via Upstash Redis.
// Résiste aux redéploiements Vercel (contrairement au Map en mémoire).
// Fallback automatique sur le rate limiter en mémoire si Upstash n'est pas configuré.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { type NextRequest, NextResponse } from 'next/server'
import { rateLimit } from './rate-limit'

// Vérifier si Upstash est configuré
const isUpstashConfigured = !!(
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
)

// Initialisation unique (singleton côté module)
const redis = isUpstashConfigured
  ? Redis.fromEnv()
  : null

// Plusieurs limiteurs selon le contexte
export const rateLimiters = redis
  ? {
      // Vérification de carte : 10/minute — critique (brute force cards)
      verify: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '60 s'),
        prefix: 'rl:verify',
      }),

      // API marketplace : 60/minute — usage normal
      marketplace: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(60, '60 s'),
        prefix: 'rl:marketplace',
      }),

      // API embed : 30/minute par origin
      embed: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, '60 s'),
        prefix: 'rl:embed',
      }),

      // HarooLife commands have a separate budget from login and existing services.
      haroolife: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, '60 s'),
        prefix: 'rl:haroolife',
      }),

      // Auth endpoints : 5/minute — anti brute-force login
      auth: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '60 s'),
        prefix: 'rl:auth',
      }),

      // Webhooks (Kobo) : 100/minute — high write volume from field syncs (BUG-01)
      webhook: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, '60 s'),
        prefix: 'rl:webhook',
      }),

      // AI chat : 20/minute per IP — prevents LLM quota drain
      'ai-chat': new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, '60 s'),
        prefix: 'rl:ai-chat',
      }),

      // AI vision : 10/minute per IP — image analysis, heavier than chat
      'ai-vision': new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '60 s'),
        prefix: 'rl:ai-vision',
      }),

      // AI voice : 15/minute per IP — audio processing, similar cost to vision
      'ai-voice': new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(15, '60 s'),
        prefix: 'rl:ai-voice',
      }),

      // Kobo sync manuelle : 5/minute — anti-spam déclenchement manuel
      'kobo-sync': new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '60 s'),
        prefix: 'rl:kobo-sync',
      }),
    }
  : null

/**
 * Apply persistent rate limiting via Upstash Redis.
 * Returns a 429 response if the limit is exceeded, or null if the request is allowed.
 * Falls back to the in-memory limiter (same budgets, per instance) if Upstash is not configured.
 */
type LimiterName =
  | 'haroolife'
  | 'verify'
  | 'marketplace'
  | 'embed'
  | 'auth'
  | 'webhook'
  | 'ai-chat'
  | 'ai-vision'
  | 'ai-voice'
  | 'kobo-sync'

/** Same budgets as the Upstash limiters, per minute and per IP, for the in-memory fallback. */
const PER_MINUTE: Record<LimiterName, number> = {
  verify: 10,
  marketplace: 60,
  embed: 30,
  haroolife: 20,
  auth: 5,
  webhook: 100,
  'ai-chat': 20,
  'ai-vision': 10,
  'ai-voice': 15,
  'kobo-sync': 5,
}

export async function applyRateLimit(
  request: NextRequest,
  limiter: LimiterName
): Promise<NextResponse | null> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'

  if (!rateLimiters) {
    // Upstash not configured: an in-memory budget per instance instead of no limit at all
    // (several routes relied on this function alone and were left unprotected).
    const mem = rateLimit(`rl:${limiter}:${ip}`, PER_MINUTE[limiter], 60_000)
    if (mem.ok) return null
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans quelques instants.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, Math.ceil((mem.resetAt - Date.now()) / 1000))) },
      },
    )
  }

  const { success, limit, reset } = await rateLimiters[limiter].limit(ip)

  if (!success) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans quelques instants.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(reset),
          'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        },
      }
    )
  }

  return null // Pas de blocage
}
