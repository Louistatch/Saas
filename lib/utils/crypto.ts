/**
 * AES-256-GCM secret encryption for the integration store.
 * Server-only. Requires INTEGRATION_SECRET_KEY (base64-encoded 32 bytes).
 *
 * Format of the stored ciphertext: `v1.<base64 iv>.<base64 ciphertext+tag>`
 */
import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const raw = process.env.INTEGRATION_SECRET_KEY
  if (!raw) {
    throw new Error(
      'INTEGRATION_SECRET_KEY is not set. Generate with `openssl rand -base64 32`.',
    )
  }
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    throw new Error('INTEGRATION_SECRET_KEY must decode to 32 bytes (base64).')
  }
  return buf
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ''
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64')}.${Buffer.concat([enc, tag]).toString('base64')}`
}

export function decryptSecret(payload: string): string {
  if (!payload) return ''
  const parts = payload.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted payload')
  }
  const iv = Buffer.from(parts[1], 'base64')
  const blob = Buffer.from(parts[2], 'base64')
  const ciphertext = blob.subarray(0, blob.length - 16)
  const tag = blob.subarray(blob.length - 16)
  const decipher = createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return dec.toString('utf8')
}

/**
 * Returns true when the value is a recognizable encrypted payload.
 */
export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('v1.')
}
