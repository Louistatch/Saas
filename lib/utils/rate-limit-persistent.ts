// [SECURITY FIX - GHOST-003]
// Rate limiting persistant via Upstash Redis.
// Résiste aux redéploiements Vercel (contrairement au Map en mémoire).
// Fallback automatique sur le rate limiter en mémoire si Upstash n'est pas configuré.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'

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
 * Falls back to in-memory rate limiting if Upstash is not configured.
 */
export async function applyRateLimit(
  request: NextRequest,
  limiter: 'verify' | 'marketplace' | 'embed' | 'auth' | 'webhook' | 'ai-chat' | 'ai-vision' | 'kobo-sync'
): Promise<NextResponse | null> {
  if (!rateLimiters) {
    // Upstash not configured — fall through to in-memory rate limiter in route handlers
    return null
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'

  const { success, limit, remaining, reset } = await rateLimiters[limiter].limit(ip)

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
