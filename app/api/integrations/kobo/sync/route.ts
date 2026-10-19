/**
 * POST /api/integrations/kobo/sync
 *
 * Triggers a manual sync from KoboToolbox API.
 * Pulls new submissions, processes them, and retries failed ones.
 *
 * Body: { cooperativeId: uuid, mode: 'full' | 'incremental', cursor?: number }
 *
 * La sync est REPRENABLE : un appel traite les soumissions par ordre d'_id dans un budget
 * de temps (≈ 40 s) puis répond `partial: true` + `cursor` ; le client rappelle avec ce
 * curseur jusqu'à `partial: false`. Un échec global (token révoqué, formulaire non partagé,
 * Kobo injoignable) répond une erreur HTTP et ne touche NI last_sync_at NI la borne
 * incrémentale (lib/kobo/sync-policy.ts).
 *
 * @security assertAuthenticated + assertRole(['cooperative_admin','faitiere_admin','super_admin'])
 * @security assertTenantAccess(cooperativeId)
 * @security Rate limited: 20 req/min/user (chaque appel dure déjà jusqu'à ~40 s)
 * @security maxDuration = 60 (Vercel function timeout)
 *
 * @test Happy path: valid auth + connected integration → 200 + SyncResult
 * @test Auth failure: member role → 403
 * @test Validation failure: missing cooperativeId → 400
 */
import { type NextRequest, NextResponse } from 'next/server'
import { assertRole, assertTenantAccess } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { incrementalSince, mergeKoboConfig, readKoboConfig } from '@/lib/kobo/config'
import { checkKoboRateLimit } from '@/lib/kobo/rate-limit'
import { decideSyncOutcome } from '@/lib/kobo/sync-policy'
import { readStoredToken } from '@/lib/kobo/stored-token'
import { KoboSyncService } from '@/lib/kobo/sync-service'
import type { SyncResult } from '@/lib/kobo/types'
import { createLogger } from '@/lib/utils/logger'
import { koboSyncRequestSchema } from '@/lib/validators/kobo'

const log = createLogger('api:kobo:sync')

// Vercel function timeout — 60 seconds
export const maxDuration = 60

/** Au-delà de ce temps écoulé, on n'enchaîne plus la file de relance : elle serait coupée. */
const RETRY_STEP_MAX_ELAPSED_MS = 45_000
const RETRY_STEP_DEADLINE_MS = 54_000

export async function POST(request: NextRequest) {
  const startedAt = Date.now()

  // -------------------------------------------------------
  // Authentication + Role check
  // -------------------------------------------------------
  const roleResult = await assertRole('cooperative_admin')
  if (!roleResult.ok) return roleResult.response

  const { ctx } = roleResult

  // -------------------------------------------------------
  // Rate limiting par UTILISATEUR (et non par IP : un NAT d'agents partage la même adresse)
  // -------------------------------------------------------
  const rate = await checkKoboRateLimit({ bucket: 'sync', key: ctx.userId, limit: 20, windowSec: 60 })
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Trop de synchronisations. Réessayez dans quelques instants.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  // -------------------------------------------------------
  // Parse + validate body
  // -------------------------------------------------------
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = koboSyncRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const { cooperativeId, mode, cursor } = parsed.data

  // -------------------------------------------------------
  // Tenant access check
  // -------------------------------------------------------
  const tenantResult = await assertTenantAccess(cooperativeId)
  if (!tenantResult.ok) return tenantResult.response

  // -------------------------------------------------------
  // Get integration config (service_role : `config` n'est pas lisible depuis le navigateur)
  // -------------------------------------------------------
  const admin = createAdminClient()
  const { data: integration } = await admin
    .from('integrations')
    .select('id, config, status, last_sync_at')
    .eq('cooperative_id', cooperativeId)
    .eq('type', 'kobo')
    .maybeSingle()

  // 'error' reste synchronisable : une sync réussie remet l'intégration à 'connected'
  // (sinon un token corrigé côté Kobo exigerait de reconfigurer l'intégration).
  if (!integration || (integration.status !== 'connected' && integration.status !== 'error')) {
    return NextResponse.json(
      { error: 'Intégration KoboToolbox non connectée' },
      { status: 400 },
    )
  }

  const cfg = readKoboConfig(integration.config)

  if (!cfg.apiKey || !cfg.formId) {
    return NextResponse.json(
      { error: 'Configuration incomplète : clé API ou Form ID manquant' },
      { status: 400 },
    )
  }

  // -------------------------------------------------------
  // Decrypt API token (seule une valeur chiffrée est acceptée)
  // -------------------------------------------------------
  const stored = readStoredToken(cfg.apiKey)
  if (!stored.ok) {
    log.error('Stored API token unusable', { reason: stored.reason, cooperativeId })
    return NextResponse.json(
      { error: 'Erreur de déchiffrement du token. Reconfigurez l\'intégration.' },
      { status: 500 },
    )
  }
  const apiToken = stored.token

  // -------------------------------------------------------
  // Determine sync start: borne incrémentale = watermark (jamais l'horloge du serveur)
  // -------------------------------------------------------
  const since = mode === 'incremental' ? incrementalSince(cfg.syncWatermark) : undefined

  // -------------------------------------------------------
  // Execute sync
  // -------------------------------------------------------
  const syncService = new KoboSyncService()

  let result: SyncResult
  try {
    result = await syncService.pullSubmissions({
      cooperativeId,
      formId: cfg.formId,
      apiToken,
      serverUrl: cfg.serverUrl,
      formType: cfg.formType,
      integrationId: integration.id,
      triggeredBy: ctx.userId,
      since,
      cursor: cursor ?? null,
    })
  } catch (err: unknown) {
    // pullSubmissions renvoie ses échecs dans result.fatal ; ceci ne couvre que l'imprévu.
    log.error('Kobo sync crashed', {
      error: err instanceof Error ? err.name : 'Unknown',
      cooperativeId,
    })
    return NextResponse.json({ error: 'Synchronisation échouée' }, { status: 500 })
  }

  // -------------------------------------------------------
  // Retry failed submissions — uniquement si le pull est complet et qu'il reste du temps
  // -------------------------------------------------------
  let retryResult: { succeeded: number; failed: number } = { succeeded: 0, failed: 0 }
  if (!result.fatal && !result.partial && Date.now() - startedAt < RETRY_STEP_MAX_ELAPSED_MS) {
    try {
      const retry = await syncService.retryFailedSubmissions(
        cooperativeId,
        apiToken,
        { formType: cfg.formType, serverUrl: cfg.serverUrl },
        { deadlineAt: startedAt + RETRY_STEP_DEADLINE_MS },
      )
      retryResult = { succeeded: retry.succeeded, failed: retry.failed }
    } catch (err: unknown) {
      log.warn('Retry failed submissions error', {
        error: err instanceof Error ? err.name : 'Unknown',
        cooperativeId,
      })
    }
  }

  // -------------------------------------------------------
  // Décision : statut, last_sync_at, watermark, code HTTP
  // -------------------------------------------------------
  const decision = decideSyncOutcome({
    result,
    mode,
    now: new Date(),
    previousWatermark: cfg.syncWatermark,
    retries: retryResult,
  })

  const update: Record<string, unknown> = { ...decision.integrationUpdate }
  if (decision.configPatch.sync_watermark) {
    // Relecture juste avant écriture : une sync dure jusqu'à ~1 min, la config a pu changer
    // (rotation du token…) ; on ne fusionne que la borne, sur la config la plus récente.
    const { data: fresh } = await admin
      .from('integrations')
      .select('config')
      .eq('cooperative_id', cooperativeId)
      .eq('type', 'kobo')
      .maybeSingle()
    update.config = mergeKoboConfig(fresh?.config ?? integration.config, decision.configPatch)
  }
  if (Object.keys(update).length > 0) {
    const { error: updateError } = await admin
      .from('integrations')
      .update(update)
      .eq('cooperative_id', cooperativeId)
      .eq('type', 'kobo')
    if (updateError) log.error('Failed to update integration after sync', { error: updateError.message, cooperativeId })
  }

  log.info('Kobo sync finished', {
    cooperativeId,
    mode,
    received: result.received,
    matched: result.matched,
    errors: result.errors,
    partial: result.partial ?? false,
    fatal: result.fatal?.code ?? null,
    duration: result.duration,
  })

  return NextResponse.json(decision.body, { status: decision.httpStatus, headers: decision.headers })
}
