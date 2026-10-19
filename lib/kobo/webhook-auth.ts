/**
 * Authentification du webhook Kobo — logique PURE (node:crypto uniquement).
 *
 * Un REST Service KoboToolbox ne propose que no_auth ou basic_auth, plus des
 * en-têtes HTTP personnalisés : il ne signe JAMAIS la requête (pas de HMAC). Le
 * secret doit donc voyager tel quel dans un en-tête, et ne peut protéger que si :
 *   1. il est PROPRE À L'INTÉGRATION (un secret partagé par toute la plateforme
 *      permettrait à n'importe quelle coopérative qui le connaît de poster au nom
 *      d'une autre) ;
 *   2. le tenant est DÉDUIT de ce secret (via l'URL dédiée de l'intégration) et
 *      jamais lu dans le corps de la requête, que l'émetteur contrôle ;
 *   3. il n'est stocké que sous forme de hash (affiché une seule fois à la création
 *      ou à la rotation).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const WEBHOOK_SECRET_PREFIX = 'kwh_'

/** Génère un secret de webhook : 32 octets aléatoires, encodés base64url. */
export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString('base64url')}`
}

/** Empreinte SHA-256 (hex) d'un secret. Le secret étant aléatoire (256 bits), un hash rapide suffit. */
export function hashWebhookSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

/** Comparaison en temps constant de deux chaînes (longueurs différentes comprises). */
export function constantTimeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest()
  const db = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(da, db)
}

/**
 * Vérifie un secret présenté contre le hash stocké de l'intégration.
 * Faux si l'un des deux manque : une intégration sans secret n'authentifie personne.
 */
export function verifyWebhookSecret(
  presented: string | null | undefined,
  storedHash: string | null | undefined,
): boolean {
  if (!presented || !storedHash) return false
  return constantTimeEqual(hashWebhookSecret(presented), storedHash)
}

export type PresentedSecret = { secret: string; via: 'x-kobo-secret' | 'basic' | 'bearer' }

interface HeaderReader {
  get(name: string): string | null
}

/**
 * Lit le secret présenté par KoboToolbox. Trois formes, toutes configurables dans
 * un REST Service :
 *   - en-tête personnalisé `X-Kobo-Secret: <secret>` ;
 *   - Basic Auth natif (le secret est le mot de passe ; l'identifiant est libre) ;
 *   - en-tête personnalisé `Authorization: Bearer <secret>`.
 */
export function extractPresentedSecret(headers: HeaderReader): PresentedSecret | null {
  const direct = headers.get('x-kobo-secret')?.trim()
  if (direct) return { secret: direct, via: 'x-kobo-secret' }

  const auth = headers.get('authorization')?.trim()
  if (!auth) return null

  const basic = /^Basic\s+(.+)$/i.exec(auth)
  if (basic?.[1]) {
    let decoded = ''
    try {
      decoded = Buffer.from(basic[1], 'base64').toString('utf8')
    } catch {
      return null
    }
    const sep = decoded.indexOf(':')
    const password = sep >= 0 ? decoded.slice(sep + 1) : ''
    return password ? { secret: password, via: 'basic' } : null
  }

  const bearer = /^Bearer\s+(.+)$/i.exec(auth)
  if (bearer?.[1]) return { secret: bearer[1].trim(), via: 'bearer' }
  return null
}

// ---------------------------------------------------------------------------
// Limitation des échecs d'authentification (par IP), horloge injectable
// ---------------------------------------------------------------------------

export interface FailureThrottle {
  /** Vrai si la clé a épuisé son quota d'échecs sur la fenêtre. */
  isBlocked(key: string): boolean
  /** Enregistre un échec d'authentification. */
  recordFailure(key: string): void
}

/**
 * Compteur d'échecs en mémoire. Il ne limite QUE les échecs : les adresses IP de
 * KoboToolbox sont partagées par tous ses utilisateurs, un plafond sur les requêtes
 * réussies bloquerait les envois légitimes (voir kobo-21).
 */
export function createFailureThrottle(
  opts: { max: number; windowMs: number; now?: () => number } = { max: 30, windowMs: 60_000 },
): FailureThrottle {
  const now = opts.now ?? Date.now
  const entries = new Map<string, { count: number; resetAt: number }>()
  return {
    isBlocked(key) {
      const e = entries.get(key)
      if (!e) return false
      if (e.resetAt <= now()) {
        entries.delete(key)
        return false
      }
      return e.count >= opts.max
    },
    recordFailure(key) {
      const t = now()
      // Évite une croissance sans borne sous un balayage d'adresses.
      if (entries.size > 5000) {
        for (const [k, v] of entries) if (v.resetAt <= t) entries.delete(k)
      }
      const e = entries.get(key)
      if (!e || e.resetAt <= t) {
        entries.set(key, { count: 1, resetAt: t + opts.windowMs })
        return
      }
      e.count += 1
    },
  }
}
