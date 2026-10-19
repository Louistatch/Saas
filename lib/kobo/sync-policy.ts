/**
 * Politique de réponse d'une synchronisation — logique PURE.
 *
 * Règles (kobo-02, kobo-15, kobo-17) :
 *  - un échec GLOBAL (token révoqué, formulaire non partagé, Kobo injoignable…) n'est
 *    JAMAIS un succès : réponse non 2xx, last_sync_at et watermark INTACTS ;
 *  - une erreur de configuration (token, partage, serveur) passe l'intégration en
 *    'error' ; une panne passagère (réseau, 5xx, 429) ne la dégrade pas ;
 *  - last_sync_at (affichage) n'avance que sur un pull COMPLET ; la borne de la sync
 *    incrémentale est un watermark distinct (config.sync_watermark = plus grande
 *    _submission_time déjà enregistrée), avancé avec le préfixe contigu des soumissions
 *    effectivement stockées — jamais avec l'horloge du serveur ;
 *  - un pull interrompu par le budget temps répond `partial` + `cursor` : l'appelant reprend.
 *
 * Imports relatifs uniquement : ce fichier est chargé tel quel par node:test.
 */
import { isConfigurationError } from './api-client'
import { maxIso } from './config'
import type { KoboErrorCode, SyncResult } from './types'

export interface SyncDecisionInput {
  result: SyncResult
  mode: 'full' | 'incremental'
  now: Date
  /** Watermark déjà enregistré (config.sync_watermark). */
  previousWatermark: string | null
  retries: { succeeded: number; failed: number }
}

export interface SyncDecision {
  httpStatus: number
  headers?: Record<string, string>
  body: Record<string, unknown>
  /** Colonnes de `integrations` à mettre à jour (absent = ne pas toucher). */
  integrationUpdate: { status?: 'connected' | 'error'; last_sync_at?: string }
  /** Clés à fusionner dans integrations.config (absent = ne pas toucher). */
  configPatch: { sync_watermark?: string }
}

/** Codes pour lesquels la cause est la configuration (token, partage, serveur) et non une panne passagère. */
function isConfigFailure(code: KoboErrorCode): boolean {
  return (
    isConfigurationError(code) ||
    code === 'invalid_response' ||
    code === 'redirect' ||
    code === 'bad_request'
  )
}

function counts(result: SyncResult) {
  return {
    received: result.received,
    processed: result.processed,
    matched: result.matched,
    unmatched: result.unmatched,
    skipped: result.skipped ?? 0,
    errors: result.errors,
    duration: result.duration,
    // Les 5 premières erreurs suffisent à diagnostiquer ; les messages sont déjà épurés du token.
    errorDetails: (result.errorDetails ?? []).slice(0, 5),
  }
}

export function decideSyncOutcome(input: SyncDecisionInput): SyncDecision {
  const { result, mode, now, previousWatermark, retries } = input
  const common = { syncLogId: result.syncLogId, mode }

  if (result.fatal) {
    const f = result.fatal
    const config = isConfigFailure(f.code)
    const rateLimited = f.code === 'rate_limited'
    return {
      httpStatus: config ? 422 : rateLimited ? 503 : 502,
      headers:
        rateLimited && f.retryAfterSec ? { 'Retry-After': String(f.retryAfterSec) } : undefined,
      body: {
        success: false,
        error: f.message,
        code: f.code,
        retryAfterSec: f.retryAfterSec ?? null,
        partial: false,
        cursor: result.cursor ?? null,
        ...common,
        sync: counts(result),
        retries,
      },
      // Jamais de last_sync_at ni de watermark sur un échec : la prochaine sync repart du même point.
      integrationUpdate: config ? { status: 'error' } : {},
      configPatch: {},
    }
  }

  const watermark = maxIso(previousWatermark, result.watermark)
  const configPatch =
    watermark && watermark !== previousWatermark ? { sync_watermark: watermark } : {}

  if (result.partial) {
    return {
      httpStatus: 200,
      body: {
        success: result.errors === 0,
        partial: true,
        cursor: result.cursor ?? null,
        remaining: result.remaining ?? null,
        ...common,
        sync: counts(result),
        retries,
        message: `Synchronisation en cours : ${result.received} soumission(s) lue(s) dans cet appel, reprise automatique.`,
      },
      // Le pull fonctionne : on sort d'un éventuel état 'error', mais last_sync_at attend la fin.
      integrationUpdate: { status: 'connected' },
      configPatch,
    }
  }

  const message =
    result.errors > 0
      ? `Sync terminée avec ${result.errors} erreur(s) : ${result.received} lue(s), ${result.matched} matchée(s), ${result.unmatched} non matchée(s).`
      : `Sync terminée : ${result.received} lue(s), ${result.matched} matchée(s), ${result.unmatched} non matchée(s), ${result.skipped ?? 0} déjà connue(s).`

  return {
    httpStatus: 200,
    body: {
      success: result.errors === 0,
      partial: false,
      cursor: null,
      remaining: null,
      ...common,
      sync: counts(result),
      retries,
      message,
    },
    integrationUpdate: { status: 'connected', last_sync_at: now.toISOString() },
    configPatch,
  }
}
