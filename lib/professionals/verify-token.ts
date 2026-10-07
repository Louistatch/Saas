import { randomBytes } from 'node:crypto'

/**
 * Jeton de vérification opaque d'une carte (QR /verify/t/<jeton>).
 * 24 octets aléatoires → 32 caractères base64url, sans donnée personnelle.
 */
export function generateVerifyToken(): string {
  return randomBytes(24).toString('base64url')
}

/** Forme acceptée en entrée de route (refus précoce, sans requête). */
export const VERIFY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/
