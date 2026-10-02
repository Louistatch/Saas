import 'server-only'
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Connexion par carte — primitives cryptographiques.
 *
 * Le numéro de carte IDENTIFIE le membre, il ne l'AUTHENTIFIE pas : il est
 * imprimé sur la carte, encodé dans le QR, et affiché par la page publique de
 * scan à quiconque la lit — acheteur, contrôleur, curieux. S'en servir comme
 * mot de passe donnerait les parcelles GPS, les cotisations et les intrants
 * d'un producteur à tous ceux qui ont un jour scanné sa carte, c'est-à-dire à
 * tous les destinataires prévus du produit.
 *
 * Ce qui prouve que l'on tient la carte, c'est un code à usage unique reçu par
 * SMS sur le téléphone enregistré pour ce membre. Le numéro de carte n'est que
 * l'adresse à laquelle on l'envoie.
 *
 * Fonctions pures : pas de base de données ici, pour pouvoir les tester seules.
 */

/** Secret minimal exigé. En dessous, on refuse de fonctionner (échec fermé). */
const MIN_SECRET_LENGTH = 32

/** Une session de carte dure une demi-journée de travail, pas plus. */
export const CARD_SESSION_TTL_SECONDS = 8 * 60 * 60

/** Un code SMS vit dix minutes. */
export const CODE_TTL_SECONDS = 10 * 60

export function authSecret(): string | null {
  const value = process.env.CARD_AUTH_SECRET?.trim()
  return value && value.length >= MIN_SECRET_LENGTH ? value : null
}

export function isCardAuthConfigured(): boolean {
  return authSecret() !== null
}

/**
 * Sous-clé par usage. Le même secret sert à signer les sessions, hacher les
 * codes et pseudonymiser les IP ; sans séparation, un hachage produit pour un
 * usage pourrait être rejoué dans un autre.
 */
function subKey(purpose: string): Buffer {
  const secret = authSecret()
  if (!secret) throw new Error('CARD_AUTH_SECRET manquant ou trop court')
  return createHmac('sha256', secret).update(`faitierehub:${purpose}`).digest()
}

function hmacHex(purpose: string, data: string): string {
  return createHmac('sha256', subKey(purpose)).update(data).digest('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

// ─── Codes à usage unique ───────────────────────────────────────────────────

/** Six chiffres tirés d'une source cryptographique (jamais Math.random). */
export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

/**
 * Le code n'est JAMAIS stocké en clair : une fuite de la table des défis ne
 * donnerait alors pas de quoi se connecter. L'identifiant du défi entre dans le
 * haché, ce qui interdit de rejouer le haché d'un défi sur un autre.
 */
export function hashCode(challengeId: string, code: string): string {
  return hmacHex('otp-v1', `${challengeId}:${code}`)
}

export function codeMatches(challengeId: string, code: string, storedHash: string): boolean {
  return safeEqualHex(hashCode(challengeId, code), storedHash)
}

/** Pseudonymise une IP : on sait compter les demandes d'une même source sans conserver l'adresse. */
export function hashIp(ip: string): string {
  return hmacHex('ip-v1', ip)
}

// ─── Session de carte ───────────────────────────────────────────────────────

interface SessionPayload {
  v: 1
  /** numéro de carte */
  c: string
  /** identifiant du membre */
  m: string
  /** expiration, en secondes epoch */
  e: number
}

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64url')

/**
 * Cookie par carte (`fh_card_COO-92353`) plutôt qu'un cookie unique : un même
 * téléphone peut servir à plusieurs membres d'une famille, et une session ne
 * doit jamais ouvrir une autre carte que celle pour laquelle elle a été émise.
 */
export function cardSessionCookieName(cardNumber: string): string {
  return `fh_card_${cardNumber}`
}

export function signCardSession(
  input: { cardNumber: string; memberId: string },
  nowMs: number = Date.now(),
): { token: string; expiresAt: Date } {
  const e = Math.floor(nowMs / 1000) + CARD_SESSION_TTL_SECONDS
  const payload: SessionPayload = { v: 1, c: input.cardNumber, m: input.memberId, e }
  const body = b64(JSON.stringify(payload))
  const sig = createHmac('sha256', subKey('session-v1')).update(body).digest()
  return { token: `${body}.${b64(sig)}`, expiresAt: new Date(e * 1000) }
}

/**
 * Valide un jeton pour UNE carte donnée. Renvoie le membre, ou `null` au
 * moindre doute : signature, version, carte, expiration.
 */
export function verifyCardSession(
  token: string | undefined | null,
  cardNumber: string,
  nowMs: number = Date.now(),
): { memberId: string } | null {
  if (!token || !isCardAuthConfigured()) return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const expected = createHmac('sha256', subKey('session-v1')).update(body).digest()
  let given: Buffer
  try {
    given = Buffer.from(sig, 'base64url')
  } catch {
    return null
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  let payload: SessionPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
  } catch {
    return null
  }
  if (payload.v !== 1 || payload.c !== cardNumber) return null
  if (typeof payload.m !== 'string' || typeof payload.e !== 'number') return null
  if (payload.e * 1000 <= nowMs) return null
  return { memberId: payload.m }
}
