/**
 * KoboCollect Sync Service v3
 *
 * Handles:
 * - Pull de l'API KoboToolbox v2, page par page, avec curseur (`_id`) et BUDGET TEMPS :
 *   une sync trop longue s'arrête proprement (`partial` + `cursor`) et se reprend,
 *   au lieu d'être coupée par la plateforme (504, journal « started » orphelin)
 * - Échec global (token révoqué, formulaire non partagé…) renvoyé comme `fatal`,
 *   jamais comme un succès « 0 reçue »
 * - Traitement par type de formulaire via le répartiteur commun (processors.ts)
 * - File de relance (error / unmatched / pending anciens), sans famine
 * - Test de connexion, structure du formulaire
 * - Journal d'audit kobo_sync_logs
 *
 * Le token API ne quitte JAMAIS le serveur et n'apparaît dans aucun message.
 */
import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { decryptSecret } from '@/lib/utils/crypto'
import { createLogger } from '@/lib/utils/logger'
import { KoboApiClient, KoboApiError, scrubSecrets } from './api-client'
import { CLAIM_STALE_MS } from './claim'
import { createKoboHostGuard } from './host-guard'
import { extractMemberKey } from './identity'
import { registerSubmission } from './ingest'
import { loadFieldMappings } from './mappings'
import { koboSubmissionIdentity } from './payload'
import { type DispatchInput, type DispatchOutcome, dispatchSubmission } from './processors'
import { DEFAULT_KOBO_SERVER_URL } from './server-url'
import type {
  KoboApiSubmission,
  KoboFieldMappingRow,
  KoboFormField,
  KoboFormGroup,
  KoboFormStructure,
  RetryResult,
  SyncOptions,
  SyncResult,
  TestConnectionResult,
} from './types'

const log = createLogger('kobo:sync-service')

/** Budget d'un appel de pull. La route plafonne à 60 s : on s'arrête avant, avec un curseur de reprise. */
export const DEFAULT_PULL_BUDGET_MS = 40_000
/** Marge laissée à la dernière requête Kobo après la fin du budget. */
const FETCH_GRACE_MS = 10_000
const RETRY_BATCH_SIZE = 50
const MAX_ERROR_DETAILS = 50
/** Un journal « started » plus ancien est une sync interrompue (timeout plateforme, crash). */
const STALE_LOG_MS = 5 * 60_000
/**
 * Une ligne « pending » / « processing » récente est peut-être en cours de traitement (webhook,
 * autre synchronisation) : on ne la relance pas. Même délai que le verrou du répartiteur.
 */
const PENDING_GRACE_MS = CLAIM_STALE_MS

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

export interface KoboSyncServiceDeps {
  /** Client Supabase (session utilisateur) ; défaut : createClient() de lib/supabase/server. */
  supabase?: SupabaseLike
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  /** Répartiteur par type de formulaire ; défaut : processors.dispatchSubmission. */
  dispatch?: (input: DispatchInput) => Promise<DispatchOutcome>
  /** Contrôle SSRF de l'hôte ; défaut : résolution DNS pour les serveurs personnalisés. */
  hostGuard?: (host: string) => Promise<void>
}

/** Contexte de configuration de l'intégration, lu côté serveur (jamais fourni par le navigateur). */
export interface KoboIntegrationContext {
  formType?: string | null
  serverUrl?: string
}

interface PerSubmissionResult {
  processed: number
  matched: number
  unmatched: number
  skipped: number
  errors: number
  persisted: boolean
  errorDetail?: { instanceId: string; error: string }
}

function isoFromKoboTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  // Kobo renvoie une date UTC naïve (« 2026-10-08T10:00:00 ») ; on la rend explicite.
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value)
  const ms = Date.parse(hasZone ? value : `${value}Z`)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

export class KoboSyncService {
  private supabase: SupabaseLike | null

  constructor(private readonly deps: KoboSyncServiceDeps = {}) {
    this.supabase = deps.supabase ?? null
  }

  private async getSupabase(): Promise<SupabaseLike> {
    if (!this.supabase) this.supabase = await createClient()
    return this.supabase
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  private makeClient(apiToken: string, serverUrl: string | undefined, deadlineAt?: number): KoboApiClient {
    const origin = serverUrl ?? DEFAULT_KOBO_SERVER_URL
    return new KoboApiClient({
      serverUrl: origin,
      apiToken,
      fetchImpl: this.deps.fetchImpl,
      sleep: this.deps.sleep,
      now: this.deps.now,
      deadlineAt,
      hostGuard: this.deps.hostGuard ?? createKoboHostGuard(origin),
    })
  }

  private dispatch(input: DispatchInput): Promise<DispatchOutcome> {
    return (this.deps.dispatch ?? dispatchSubmission)(input)
  }

  // -----------------------------------------------------------
  // Pull submissions from KoboToolbox API v2 (curseur + budget temps)
  // -----------------------------------------------------------
  async pullSubmissions(options: SyncOptions): Promise<SyncResult> {
    const startTime = this.now()
    const budgetMs = options.budgetMs ?? DEFAULT_PULL_BUDGET_MS
    const deadline = startTime + budgetMs
    const supabase = await this.getSupabase()

    await this.expireStaleLogs(options.cooperativeId)

    // Create sync log entry (rattaché à l'intégration et à l'utilisateur déclencheur)
    const { data: syncLog } = await supabase
      .from('kobo_sync_logs')
      .insert({
        cooperative_id: options.cooperativeId,
        integration_id: options.integrationId ?? null,
        triggered_by: options.triggeredBy ?? null,
        sync_type: 'pull' as const,
        status: 'started' as const,
        started_at: new Date(startTime).toISOString(),
      })
      .select('id')
      .single()

    const syncLogId = syncLog?.id ?? crypto.randomUUID()

    const result: SyncResult = {
      success: false,
      syncLogId,
      received: 0,
      processed: 0,
      matched: 0,
      unmatched: 0,
      errors: 0,
      duration: 0,
      errorDetails: [],
      skipped: 0,
      unpersisted: 0,
      partial: false,
      cursor: options.cursor ?? null,
      remaining: null,
      watermark: null,
    }

    let cursor: number | null = options.cursor ?? null
    let firstPageCount: number | null = null
    // Le watermark ne couvre que le préfixe CONTIGU de soumissions enregistrées : dès qu'une
    // soumission n'a pas pu être stockée, il n'avance plus (elle sera reprise au run suivant).
    let watermarkBlocked = false

    try {
      const client = this.makeClient(options.apiToken, options.serverUrl, deadline + FETCH_GRACE_MS)
      const mappings = await this.getFieldMappings(options.cooperativeId, options.formId)

      pages: for (;;) {
        const cursorBeforePage = cursor
        if (result.received > 0 && this.now() >= deadline) {
          result.partial = true
          break
        }

        const page = await client.fetchSubmissionsPage({
          formId: options.formId,
          afterId: cursor,
          since: options.since,
        })
        if (firstPageCount === null && page.count !== null) firstPageCount = page.count
        if (page.results.length === 0) break

        for (const submission of page.results) {
          // Toujours au moins une soumission par appel, pour que la reprise progresse.
          if (result.received > 0 && this.now() >= deadline) {
            result.partial = true
            break pages
          }

          const r = await this.processOne(submission, options, mappings)
          result.received++
          result.processed += r.processed
          result.matched += r.matched
          result.unmatched += r.unmatched
          result.skipped = (result.skipped ?? 0) + r.skipped
          result.errors += r.errors
          if (r.errorDetail && (result.errorDetails?.length ?? 0) < MAX_ERROR_DETAILS) {
            result.errorDetails?.push(r.errorDetail)
          }

          if (!r.persisted) {
            result.unpersisted = (result.unpersisted ?? 0) + 1
            watermarkBlocked = true
          } else if (!watermarkBlocked) {
            const iso = isoFromKoboTime(submission._submission_time)
            if (iso && (!result.watermark || iso > result.watermark)) result.watermark = iso
          }

          if (typeof submission._id === 'number') cursor = Math.max(cursor ?? 0, submission._id)
          options.onProgress?.(result.received, firstPageCount ?? result.received)
        }

        if (!page.hasMore) break
        // Aucune soumission avec un _id numérique : relire la même page tournerait en boucle.
        if (cursor === cursorBeforePage) break
      }

      result.cursor = result.partial ? cursor : null
      result.remaining =
        result.partial && firstPageCount !== null ? Math.max(0, firstPageCount - result.received) : null
      result.success = result.errors === 0
      result.duration = this.now() - startTime
      await this.completeSyncLog(syncLogId, result, options)
      return result
    } catch (err: unknown) {
      result.duration = this.now() - startTime
      result.success = false
      result.cursor = cursor
      if (err instanceof KoboApiError) {
        result.fatal = {
          code: err.code,
          message: err.message,
          status: err.status,
          retryAfterSec: err.retryAfterSec,
        }
      } else {
        const message = scrubSecrets(err instanceof Error ? err.message : 'Unknown sync error', [options.apiToken])
        result.fatal = { code: 'server_error', message: `Erreur interne pendant la synchronisation : ${message}` }
      }
      log.error('Pull submissions failed', {
        code: result.fatal.code,
        status: result.fatal.status,
        cooperativeId: options.cooperativeId,
      })
      await this.failSyncLog(syncLogId, result)
      return result
    }
  }

  /** Traite UNE soumission : déduplication, enregistrement, traitement par type de formulaire. */
  private async processOne(
    submission: KoboApiSubmission,
    options: SyncOptions,
    mappings: KoboFieldMappingRow[],
  ): Promise<PerSubmissionResult> {
    const supabase = await this.getSupabase()
    const instanceId = koboSubmissionIdentity(submission).key || String(submission._id)
    const base: PerSubmissionResult = {
      processed: 0,
      matched: 0,
      unmatched: 0,
      skipped: 0,
      errors: 0,
      persisted: true,
    }

    try {
      const key = extractMemberKey(submission, mappings)

      // Déduplication sur l'identité STABLE (meta/rootUuid), par coopérative ; une version modifiée
      // met la ligne existante à jour au lieu d'en créer une seconde (lib/kobo/ingest.ts).
      const registered = await registerSubmission(supabase, {
        cooperativeId: options.cooperativeId,
        formId: options.formId,
        payload: submission as unknown as Record<string, unknown>,
        submittedAt: submission._submission_time,
        memberCardNumber: key.card,
      })

      if (registered.kind === 'error') {
        return {
          ...base,
          errors: 1,
          persisted: false,
          errorDetail: { instanceId, error: registered.message },
        }
      }
      // Déjà connue (ou modification reçue pendant son traitement : reprise à la prochaine synchro).
      if (registered.kind === 'duplicate' || registered.kind === 'busy') return { ...base, skipped: 1 }

      try {
        const outcome = await this.dispatch({
          submissionId: registered.id,
          cooperativeId: options.cooperativeId,
          payload: submission as unknown as Record<string, unknown>,
          formType: options.formType,
          memberCardNumber: key.card,
          apiToken: options.apiToken,
          serverUrl: options.serverUrl,
          mappings,
        })
        if (outcome.status === 'skipped') return { ...base, skipped: 1 }
        return outcome.status === 'matched'
          ? { ...base, processed: 1, matched: 1 }
          : { ...base, processed: 1, unmatched: 1 }
      } catch (err: unknown) {
        // La ligne existe : on y consigne l'échec (sinon elle resterait « pending » sans message).
        const message = scrubSecrets(err instanceof Error ? err.message : 'Processing error', [options.apiToken])
        await this.recordRowFailure(registered.id, message)
        log.error('Failed to process submission', { instanceId, cooperativeId: options.cooperativeId })
        return { ...base, errors: 1, errorDetail: { instanceId, error: message } }
      }
    } catch (err: unknown) {
      const message = scrubSecrets(err instanceof Error ? err.message : 'Processing error', [options.apiToken])
      return { ...base, errors: 1, persisted: false, errorDetail: { instanceId, error: message } }
    }
  }

  /** Consigne l'échec de traitement sur la ligne (statut + message) ; sert aussi à faire tourner la file de relance. */
  private async recordRowFailure(submissionId: string, message: string): Promise<void> {
    const supabase = await this.getSupabase()
    const { error } = await supabase
      .from('kobo_submissions')
      .update({ status: 'error' as const, error_message: message, updated_at: new Date(this.now()).toISOString() })
      .eq('id', submissionId)
    if (error) log.warn('Could not persist submission failure', { submissionId, code: error.code })
  }

  // -----------------------------------------------------------
  // Retry failed submissions from kobo_submissions table
  // -----------------------------------------------------------
  async retryFailedSubmissions(
    cooperativeId: string,
    apiToken?: string,
    ctx: KoboIntegrationContext = {},
    opts: { deadlineAt?: number } = {},
  ): Promise<RetryResult> {
    const supabase = await this.getSupabase()
    const nowMs = this.now()
    const cutoff = new Date(nowMs - PENDING_GRACE_MS).toISOString()

    // Les plus anciennement TENTÉES d'abord (updated_at) : une ligne qui échoue est replacée en
    // fin de file, donc les échecs permanents n'affament plus les plus récentes.
    const [{ data: failed }, { data: stale }] = await Promise.all([
      supabase
        .from('kobo_submissions')
        .select('*')
        .eq('cooperative_id', cooperativeId)
        .in('status', ['error', 'unmatched'])
        .order('updated_at', { ascending: true })
        .limit(RETRY_BATCH_SIZE),
      supabase
        .from('kobo_submissions')
        .select('*')
        .eq('cooperative_id', cooperativeId)
        // « pending » ancien : jamais pris en charge ; « processing » ancien : exécution interrompue.
        .in('status', ['pending', 'processing'])
        .lt('updated_at', cutoff)
        .order('updated_at', { ascending: true })
        .limit(RETRY_BATCH_SIZE),
    ])

    const queue = [...(failed ?? []), ...(stale ?? [])]
      .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))
      .slice(0, RETRY_BATCH_SIZE)

    const result: RetryResult = { total: queue.length, retried: 0, succeeded: 0, failed: 0, skipped: 0, errors: [] }
    if (queue.length === 0) return result

    for (const submission of queue) {
      if (opts.deadlineAt !== undefined && this.now() >= opts.deadlineAt) break
      result.retried++
      const outcome = await this.retrySubmission(submission, cooperativeId, ctx, apiToken)
      if (outcome.ok) {
        result.succeeded++
      } else if (outcome.skipped) {
        // Prise en charge ailleurs au même moment : ni un succès ni un échec.
        result.skipped = (result.skipped ?? 0) + 1
      } else {
        result.failed++
        result.errors.push({ instanceId: submission.kobo_instance_id, error: outcome.error })
      }
    }

    return result
  }

  /**
   * Reprocess exactly one submission — used by the per-row "Retenter" action
   * in the submissions table, instead of triggering a full cooperative sync.
   */
  async retrySingleSubmission(
    cooperativeId: string,
    submissionId: string,
    apiToken?: string,
    ctx: KoboIntegrationContext = {},
  ): Promise<RetryResult> {
    const supabase = await this.getSupabase()

    const { data: submission } = await supabase
      .from('kobo_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('cooperative_id', cooperativeId)
      .maybeSingle()

    if (!submission) {
      return { total: 0, retried: 0, succeeded: 0, failed: 0, skipped: 0, errors: [{ instanceId: 'unknown', error: 'Submission introuvable' }] }
    }

    const outcome = await this.retrySubmission(submission, cooperativeId, ctx, apiToken)

    const skipped = !outcome.ok && outcome.skipped === true
    return {
      total: 1,
      retried: 1,
      succeeded: outcome.ok ? 1 : 0,
      failed: outcome.ok || skipped ? 0 : 1,
      skipped: skipped ? 1 : 0,
      errors: outcome.ok ? [] : [{ instanceId: submission.kobo_instance_id, error: outcome.error }],
    }
  }

  /**
   * Retraite une ligne avec le MÊME répartiteur que le pull et le webhook (prise en charge
   * exclusive, rapprochement, inscription rejouable). Pas de raccourci « membre déjà lié » :
   * une ligne liée à un membre mais sans carte (quota) doit refaire l'émission, pas passer 'matched'.
   */
  private async retrySubmission(
    submission: Record<string, unknown> & { id: string; kobo_instance_id: string; member_id: string | null; member_card_number: string | null; raw_payload: unknown },
    cooperativeId: string,
    ctx: KoboIntegrationContext,
    apiToken?: string,
  ): Promise<{ ok: true } | { ok: false; error: string; skipped?: boolean }> {
    const supabase = await this.getSupabase()

    try {
      const outcome = await this.dispatch({
        submissionId: submission.id,
        cooperativeId,
        payload: submission.raw_payload as Record<string, unknown>,
        formType: ctx.formType,
        memberCardNumber: submission.member_card_number,
        apiToken,
        serverUrl: ctx.serverUrl,
        clearError: true,
      })
      if (outcome.status === 'matched') return { ok: true }
      if (outcome.status === 'skipped') {
        return { ok: false, skipped: true, error: outcome.detail ?? 'Soumission déjà en cours de traitement' }
      }
      // Toujours « unmatched » : on touche updated_at pour que la file tourne.
      await supabase
        .from('kobo_submissions')
        .update({ updated_at: new Date(this.now()).toISOString() })
        .eq('id', submission.id)
      return { ok: false, error: outcome.detail ?? 'Carte membre introuvable' }
    } catch (err: unknown) {
      const message = scrubSecrets(err instanceof Error ? err.message : 'Retry failed', [apiToken])
      await this.recordRowFailure(submission.id, message)
      return { ok: false, error: message }
    }
  }

  // -----------------------------------------------------------
  // Test connection to KoboToolbox
  // -----------------------------------------------------------
  async testConnection(apiToken: string, formId: string, serverUrl?: string): Promise<TestConnectionResult> {
    try {
      return await this.makeClient(apiToken, serverUrl).testConnection(formId)
    } catch (err: unknown) {
      // Création du client / contrôle d'hôte : jamais de message brut, il pourrait contenir le token.
      if (err instanceof KoboApiError) return { valid: false, code: err.code, error: err.message }
      log.error('KoboToolbox connection test failed')
      return { valid: false, code: 'network', error: 'Connexion à KoboToolbox impossible.' }
    }
  }

  // -----------------------------------------------------------
  // Get form structure (for field mapping UI)
  // -----------------------------------------------------------
  async getFormStructure(apiToken: string, formId: string, serverUrl?: string): Promise<KoboFormStructure> {
    const asset = (await this.makeClient(apiToken, serverUrl).getAsset(formId)) as {
      content?: {
        survey?: Array<{
          type: string
          name?: string
          $autoname?: string
          label?: string[]
          required?: boolean
        }>
      }
    }

    const survey = asset.content?.survey ?? []
    const fields: KoboFormField[] = []
    const groups: KoboFormGroup[] = []
    let currentGroup: KoboFormGroup | null = null

    for (const row of survey) {
      const name = row.name ?? row.$autoname ?? ''
      const label = Array.isArray(row.label) ? row.label[0] : undefined

      if (row.type === 'begin_group' || row.type === 'begin_repeat') {
        currentGroup = {
          name,
          label: label ? { default: label } : undefined,
          fields: [],
          repeat: row.type === 'begin_repeat',
        }
        groups.push(currentGroup)
      } else if (row.type === 'end_group' || row.type === 'end_repeat') {
        currentGroup = null
      } else if (name && !row.type.startsWith('begin') && !row.type.startsWith('end')) {
        const field: KoboFormField = {
          name,
          type: row.type,
          label: label ? { default: label } : undefined,
          group: currentGroup?.name,
          required: row.required,
        }
        fields.push(field)
        if (currentGroup) {
          currentGroup.fields.push(field)
        }
      }
    }

    return { fields, groups }
  }

  // -----------------------------------------------------------
  // Private: Get field mappings for a cooperative/form
  // -----------------------------------------------------------
  private async getFieldMappings(
    cooperativeId: string,
    formId: string,
  ): Promise<KoboFieldMappingRow[]> {
    return loadFieldMappings(await this.getSupabase(), cooperativeId, formId)
  }

  // -----------------------------------------------------------
  // Private: sync log lifecycle
  // -----------------------------------------------------------

  /** Marque « failed » les journaux restés « started » depuis plus de 5 minutes (sync interrompue). */
  private async expireStaleLogs(cooperativeId: string): Promise<void> {
    const supabase = await this.getSupabase()
    const nowMs = this.now()
    const { error } = await supabase
      .from('kobo_sync_logs')
      .update({
        status: 'failed' as const,
        error_details: { error: 'Synchronisation interrompue (délai dépassé).' } as unknown as Record<string, unknown>,
        completed_at: new Date(nowMs).toISOString(),
      })
      .eq('cooperative_id', cooperativeId)
      .eq('status', 'started')
      .lt('started_at', new Date(nowMs - STALE_LOG_MS).toISOString())
    if (error) log.warn('Could not expire stale sync logs', { code: error.code })
  }

  /** UPDATE du journal ; si la colonne `details` n'existe pas (environnement sans la migration), on réécrit sans elle. */
  private async updateSyncLog(
    syncLogId: string,
    patch: Record<string, unknown>,
    details: Record<string, unknown>,
  ): Promise<void> {
    const supabase = await this.getSupabase()
    const { error } = await supabase.from('kobo_sync_logs').update({ ...patch, details }).eq('id', syncLogId)
    if (error) {
      const { error: retryError } = await supabase.from('kobo_sync_logs').update(patch).eq('id', syncLogId)
      if (retryError) log.warn('Could not update sync log', { code: retryError.code })
    }
  }

  private async completeSyncLog(syncLogId: string, result: SyncResult, options: SyncOptions): Promise<void> {
    await this.updateSyncLog(
      syncLogId,
      {
        status: result.errors > 0 || result.partial ? ('partial' as const) : ('success' as const),
        submissions_received: result.received,
        submissions_processed: result.processed,
        submissions_matched: result.matched,
        submissions_errors: result.errors,
        duration_ms: result.duration,
        error_details: result.errorDetails?.length
          ? (result.errorDetails as unknown as Record<string, unknown>)
          : null,
        completed_at: new Date(this.now()).toISOString(),
      },
      {
        cursor: result.cursor ?? null,
        partial: result.partial ?? false,
        skipped: result.skipped ?? 0,
        since: options.since ? options.since.toISOString() : null,
        watermark: result.watermark ?? null,
      },
    )
  }

  private async failSyncLog(syncLogId: string, result: SyncResult): Promise<void> {
    await this.updateSyncLog(
      syncLogId,
      {
        status: 'failed' as const,
        submissions_received: result.received,
        submissions_processed: result.processed,
        submissions_matched: result.matched,
        submissions_errors: result.errors,
        duration_ms: result.duration,
        error_details: {
          error: result.fatal?.message ?? 'Échec de la synchronisation',
          code: result.fatal?.code ?? null,
          status: result.fatal?.status ?? null,
        } as unknown as Record<string, unknown>,
        completed_at: new Date(this.now()).toISOString(),
      },
      { cursor: result.cursor ?? null },
    )
  }
}

// =========================================================
// Singleton factory
// =========================================================
let instance: KoboSyncService | null = null

export function getKoboSyncService(): KoboSyncService {
  if (!instance) {
    instance = new KoboSyncService()
  }
  return instance
}

// =========================================================
// Convenience: decrypt token helper (used by route handlers)
// =========================================================
export function decryptApiToken(encryptedToken: string): string {
  return decryptSecret(encryptedToken)
}
