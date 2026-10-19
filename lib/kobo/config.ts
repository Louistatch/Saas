/**
 * Lecture / fusion de integrations.config pour Kobo — logique PURE.
 *
 * `config` n'appartient PAS entièrement au formulaire de l'interface : form_type,
 * server_url, webhook_secret_hash, sync_watermark… sont gérés ailleurs. On le FUSIONNE
 * donc toujours avec l'existant (jamais de reconstruction), et on n'en renvoie JAMAIS
 * le contenu brut au navigateur : seules les valeurs non secrètes passent par
 * KoboConfigResponse (api_key chiffré et hash du secret de webhook restent côté serveur).
 *
 * Imports relatifs uniquement : ce fichier est chargé tel quel par node:test.
 */
import { DEFAULT_KOBO_SERVER_URL } from './server-url'
import { KOBO_FORM_TYPES, type KoboFormType } from './types'

export interface KoboConfigView {
  /** Token chiffré (v1.<iv>.<blob>) — ou valeur héritée en clair — : ne JAMAIS sérialiser. */
  apiKey: string | null
  formId: string | null
  serverUrl: string
  formType: KoboFormType | null
  webhookEnabled: boolean
  /** SHA-256 du secret de webhook de l'intégration — ne JAMAIS sérialiser. */
  webhookSecretHash: string | null
  /** Plus grande _submission_time déjà enregistrée (ISO) : borne de la sync incrémentale. */
  syncWatermark: string | null
  formTitle: string | null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function readKoboConfig(raw: unknown): KoboConfigView {
  const c = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >
  const formType = str(c.form_type)
  return {
    apiKey: str(c.api_key),
    formId: str(c.form_id),
    serverUrl: str(c.server_url) ?? DEFAULT_KOBO_SERVER_URL,
    formType: (KOBO_FORM_TYPES as readonly string[]).includes(formType ?? '')
      ? (formType as KoboFormType)
      : null,
    // Absent = actif (comportement historique).
    webhookEnabled: c.webhook_enabled !== false,
    webhookSecretHash: str(c.webhook_secret_hash),
    syncWatermark: str(c.sync_watermark),
    formTitle: str(c.form_title),
  }
}

/**
 * Fusionne `patch` dans `existing` sans jamais supprimer une clé inconnue.
 * Une valeur `undefined` dans le patch est ignorée ; `null` écrit explicitement null.
 */
export function mergeKoboConfig(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = (
    existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}
  ) as Record<string, unknown>
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) merged[key] = value
  }
  return merged
}

/** Retire les clés dont la valeur ne doit pas survivre à une déconnexion (secrets, curseurs). */
export function stripKoboConnectionKeys(config: Record<string, unknown>): Record<string, unknown> {
  const {
    api_key: _a,
    form_id: _f,
    form_title: _t,
    webhook_secret_hash: _w,
    sync_watermark: _s,
    submission_count: _c,
    ...rest
  } = config
  return rest
}

/** URL dédiée de l'intégration à coller dans KoboToolbox → REST Services (sans secret). */
export function buildWebhookUrl(appOrigin: string, integrationId: string): string {
  return `${appOrigin.replace(/\/+$/, '')}/api/webhooks/kobo?integration=${encodeURIComponent(integrationId)}`
}

/** Marge appliquée à la borne incrémentale : les doublons sont absorbés par la déduplication. */
export const INCREMENTAL_MARGIN_MS = 10 * 60_000

/** Date de départ d'une sync incrémentale : watermark − marge, ou undefined (= tout relire). */
export function incrementalSince(watermarkIso: string | null): Date | undefined {
  if (!watermarkIso) return undefined
  const ms = Date.parse(watermarkIso)
  return Number.isNaN(ms) ? undefined : new Date(ms - INCREMENTAL_MARGIN_MS)
}

/** Plus grande des deux dates ISO (null toléré). */
export function maxIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null
  if (!b) return a
  return a >= b ? a : b
}
