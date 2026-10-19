/**
 * Lecture du token Kobo enregistré (integrations.config.api_key).
 *
 * Seule une valeur CHIFFRÉE (AES-256-GCM, « v1.… ») est acceptée. Une valeur en clair
 * hérité n'est plus utilisée nulle part : elle n'a pu être écrite que depuis le navigateur
 * (RLS d'origine) et est traitée comme « à reconfigurer ». La route de configuration, elle,
 * peut la rechiffrer lors d'un réenregistrement (voir app/api/integrations/kobo/route.ts).
 */
import 'server-only'

import { decryptSecret, isEncrypted } from '@/lib/utils/crypto'

export type StoredTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'missing' | 'plaintext' | 'decrypt' }

export function readStoredToken(apiKey: string | null | undefined): StoredTokenResult {
  if (!apiKey) return { ok: false, reason: 'missing' }
  if (!isEncrypted(apiKey)) return { ok: false, reason: 'plaintext' }
  try {
    return { ok: true, token: decryptSecret(apiKey) }
  } catch {
    return { ok: false, reason: 'decrypt' }
  }
}
