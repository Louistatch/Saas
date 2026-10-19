/**
 * Limitation de débit propre au module Kobo, indexée par UTILISATEUR ou par
 * INTÉGRATION (jamais par IP seule) et sur des seaux dédiés :
 *  - 'sync'    : pull manuel, par utilisateur ;
 *  - 'retry'   : relance de soumissions, par utilisateur (n'utilise plus le seau
 *                'auth' du login, 5/min par IP) ;
 *  - 'webhook' : réception Kobo, par intégration, APRÈS authentification. Les
 *                adresses IP sortantes de KoboToolbox sont partagées par tous ses
 *                utilisateurs : un plafond par IP bloquerait des envois légitimes.
 *
 * Upstash Redis quand UPSTASH_REDIS_REST_URL est défini (persistant entre
 * déploiements), sinon repli sur le limiteur en mémoire.
 */
import 'server-only'

import { rateLimit as memoryRateLimit } from '@/lib/utils/rate-limit'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export type KoboRateBucket = 'sync' | 'retry' | 'webhook'

export interface KoboRateLimitCheck {
  bucket: KoboRateBucket
  /** Identifiant de l'utilisateur ou de l'intégration. */
  key: string
  limit: number
  windowSec: number
}

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null

const limiters = new Map<string, Ratelimit>()

function getLimiter(check: KoboRateLimitCheck): Ratelimit | null {
  if (!redis) return null
  const id = `${check.bucket}:${check.limit}:${check.windowSec}`
  let limiter = limiters.get(id)
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(check.limit, `${check.windowSec} s`),
      prefix: `rl:kobo:${check.bucket}`,
    })
    limiters.set(id, limiter)
  }
  return limiter
}

export async function checkKoboRateLimit(
  check: KoboRateLimitCheck,
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const limiter = getLimiter(check)
  if (limiter) {
    try {
      const { success, reset } = await limiter.limit(check.key)
      return { ok: success, retryAfterSec: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) }
    } catch {
      // Redis indisponible : on retombe sur le limiteur mémoire plutôt que de bloquer.
    }
  }
  const r = memoryRateLimit(
    `kobo:${check.bucket}:${check.key}`,
    check.limit,
    check.windowSec * 1000,
  )
  return { ok: r.ok, retryAfterSec: Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000)) }
}
