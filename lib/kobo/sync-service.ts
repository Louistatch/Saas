/**
 * KoboCollect Sync Service v2
 *
 * Handles:
 * - Paginated pull from KoboToolbox API v2
 * - Batch processing (chunks of 50)
 * - Retry queue with exponential backoff
 * - Connection testing
 * - Form structure retrieval (for mapping UI)
 * - Audit logging via kobo_sync_logs
 *
 * All network calls have 30s timeout + 3 retries with exponential backoff.
 * The API token NEVER leaves the server.
 */
import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { decryptSecret } from '@/lib/utils/crypto'
import {
  enrollNewMemberFromSubmission,
  processCooperativeRegistration,
} from './enrollment'
import type {
  KoboApiSubmission,
  KoboApiDataResponse,
  KoboFormField,
  KoboFormGroup,
  KoboFormStructure,
  SyncOptions,
  SyncResult,
  RetryResult,
  TestConnectionResult,
  KoboFieldMappingRow,
} from './types'

const log = createLogger('kobo:sync-service')

const KOBO_API_BASE = 'https://kf.kobotoolbox.org/api/v2'
const REQUEST_TIMEOUT_MS = 30_000
const MAX_RETRIES = 3
const BATCH_SIZE = 50
const PAGE_SIZE = 100

// =========================================================
// KoboSyncService class
// =========================================================

export class KoboSyncService {
  private supabase: Awaited<ReturnType<typeof createClient>> | null = null

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await createClient()
    }
    return this.supabase
  }

  // -----------------------------------------------------------
  // Pull submissions from KoboToolbox API v2 (paginated)
  // -----------------------------------------------------------
  async pullSubmissions(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now()
    const supabase = await this.getSupabase()

    // Create sync log entry
    const { data: syncLog } = await supabase
      .from('kobo_sync_logs')
      .insert({
        cooperative_id: options.cooperativeId,
        sync_type: 'pull' as const,
        status: 'started' as const,
        started_at: new Date().toISOString(),
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
    }

    try {
      // Fetch all submissions (paginated)
      const allSubmissions = await this.fetchAllSubmissions(
        options.apiToken,
        options.formId,
        options.since,
      )

      result.received = allSubmissions.length

      if (allSubmissions.length === 0) {
        result.success = true
        result.duration = Date.now() - startTime
        await this.completeSyncLog(syncLogId, result)
        return result
      }

      // Get field mappings for this cooperative/form
      const mappings = await this.getFieldMappings(
        options.cooperativeId,
        options.formId,
      )

      // Resolve form type from integration config (determines enrollment vs update routing)
      const formType = await this.getFormType(options.cooperativeId)

      // Process in batches
      const batches = this.chunk(allSubmissions, BATCH_SIZE)
      let processedCount = 0

      for (const batch of batches) {
        const batchResults = await this.processBatch(
          batch,
          options.cooperativeId,
          options.formId,
          mappings,
          formType,
          options.apiToken,
        )

        result.processed += batchResults.processed
        result.matched += batchResults.matched
        result.unmatched += batchResults.unmatched
        result.errors += batchResults.errors
        if (batchResults.errorDetails) {
          result.errorDetails = [
            ...(result.errorDetails ?? []),
            ...batchResults.errorDetails,
          ]
        }

        processedCount += batch.length
        if (options.onProgress) {
          options.onProgress(processedCount, allSubmissions.length)
        }
      }

      result.success = result.errors === 0
      result.duration = Date.now() - startTime
      await this.completeSyncLog(syncLogId, result)

      return result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown sync error'
      log.error('Pull submissions failed', { error: message, cooperativeId: options.cooperativeId })

      result.duration = Date.now() - startTime
      result.errorDetails = [{ instanceId: 'global', error: message }]
      await this.failSyncLog(syncLogId, message)

      return result
    }
  }

  // -----------------------------------------------------------
  // Retry failed submissions from kobo_submissions table
  // -----------------------------------------------------------
  async retryFailedSubmissions(cooperativeId: string, apiToken?: string): Promise<RetryResult> {
    const supabase = await this.getSupabase()

    const { data: failed } = await supabase
      .from('kobo_submissions')
      .select('*')
      .eq('cooperative_id', cooperativeId)
      .in('status', ['error', 'pending'])
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (!failed || failed.length === 0) {
      return { total: 0, retried: 0, succeeded: 0, failed: 0, errors: [] }
    }

    const result: RetryResult = {
      total: failed.length,
      retried: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    }

    const formType = await this.getFormType(cooperativeId)

    for (const submission of failed) {
      result.retried++
      const outcome = await this.retrySubmission(submission, cooperativeId, formType, apiToken)
      if (outcome.ok) {
        result.succeeded++
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
  async retrySingleSubmission(cooperativeId: string, submissionId: string, apiToken?: string): Promise<RetryResult> {
    const supabase = await this.getSupabase()

    const { data: submission } = await supabase
      .from('kobo_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('cooperative_id', cooperativeId)
      .maybeSingle()

    if (!submission) {
      return { total: 0, retried: 0, succeeded: 0, failed: 0, errors: [{ instanceId: 'unknown', error: 'Submission introuvable' }] }
    }

    const formType = await this.getFormType(cooperativeId)
    const outcome = await this.retrySubmission(submission, cooperativeId, formType, apiToken)

    return {
      total: 1,
      retried: 1,
      succeeded: outcome.ok ? 1 : 0,
      failed: outcome.ok ? 0 : 1,
      errors: outcome.ok ? [] : [{ instanceId: submission.kobo_instance_id, error: outcome.error }],
    }
  }

  /** Routes a single submission through the matching/processing path appropriate for its form type. */
  private async retrySubmission(
    submission: Record<string, unknown> & { id: string; kobo_instance_id: string; member_id: string | null; member_card_number: string | null; raw_payload: unknown },
    cooperativeId: string,
    formType: string | null,
    apiToken?: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const supabase = await this.getSupabase()

    try {
      const payload = submission.raw_payload as Record<string, unknown>

      if (formType === 'cooperative_registration') {
        await processCooperativeRegistration(submission.id, cooperativeId, payload)
        return { ok: true }
      }

      if (formType === 'harvest' || formType === 'plot_survey' || formType === 'market_price') {
        // These form types are processed directly from raw_payload (member
        // matched via card number embedded in the payload), never through the
        // member-enrollment path — routing them there would create bogus members.
        const { data: updated } = await supabase.rpc('match_kobo_submission_to_member', {
          p_submission_id: submission.id,
        }).then(() => supabase
          .from('kobo_submissions')
          .select('status, member_id')
          .eq('id', submission.id)
          .single())

        if (updated?.status === 'matched' && updated.member_id) {
          await supabase.rpc('process_kobo_submission', { p_submission_id: submission.id })
          return { ok: true }
        }
        return { ok: false, error: 'Carte membre introuvable pour cette soumission' }
      }

      if (submission.member_id) {
        // Member already enrolled — just fix missing photo/signature and mark matched
        await this.backfillMemberMedia(submission.member_id, payload, apiToken)
        await supabase
          .from('kobo_submissions')
          .update({ status: 'matched', updated_at: new Date().toISOString() })
          .eq('id', submission.id)
        return { ok: true }
      }

      if (submission.member_card_number) {
        // Has card number — try RPC match
        await supabase.rpc('match_kobo_submission_to_member', { p_submission_id: submission.id })

        const { data: updated } = await supabase
          .from('kobo_submissions')
          .select('status, member_id')
          .eq('id', submission.id)
          .single()

        if (updated?.status === 'matched' && updated.member_id) {
          await supabase.rpc('process_kobo_submission', { p_submission_id: submission.id })
          return { ok: true }
        }
        return { ok: false, error: 'Could not match to member' }
      }

      // No card number and no existing member — enroll as new member
      await enrollNewMemberFromSubmission(submission.id, cooperativeId, payload, apiToken)
      return { ok: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Retry failed'
      return { ok: false, error: message }
    }
  }

  // -----------------------------------------------------------
  // Test connection to KoboToolbox
  // -----------------------------------------------------------
  async testConnection(
    apiToken: string,
    formId: string,
  ): Promise<TestConnectionResult> {
    try {
      const response = await this.fetchWithRetry(
        `${KOBO_API_BASE}/assets/${encodeURIComponent(formId)}/`,
        apiToken,
      )

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return { valid: false, error: 'Token API invalide ou expiré' }
        }
        if (response.status === 404) {
          return { valid: false, error: 'Formulaire non trouvé (vérifiez le Form ID)' }
        }
        return { valid: false, error: `Erreur KoboToolbox: ${response.status}` }
      }

      const data = (await response.json()) as {
        name?: string
        deployment__submission_count?: number
      }

      return {
        valid: true,
        formTitle: data.name ?? undefined,
        submissionCount: data.deployment__submission_count ?? 0,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      log.error('KoboToolbox connection test failed', { error: message })
      return { valid: false, error: message }
    }
  }

  // -----------------------------------------------------------
  // Get form structure (for field mapping UI)
  // -----------------------------------------------------------
  async getFormStructure(
    apiToken: string,
    formId: string,
  ): Promise<KoboFormStructure> {
    const response = await this.fetchWithRetry(
      `${KOBO_API_BASE}/assets/${encodeURIComponent(formId)}/`,
      apiToken,
    )

    if (!response.ok) {
      throw new Error(`KoboToolbox API error: ${response.status}`)
    }

    const asset = (await response.json()) as {
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
  // Private: Fetch all submissions with pagination
  // -----------------------------------------------------------
  private async fetchAllSubmissions(
    apiToken: string,
    formId: string,
    since?: Date,
  ): Promise<KoboApiSubmission[]> {
    const allSubmissions: KoboApiSubmission[] = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const url = new URL(
        `${KOBO_API_BASE}/assets/${encodeURIComponent(formId)}/data/`,
      )
      url.searchParams.set('format', 'json')
      url.searchParams.set('limit', String(PAGE_SIZE))
      url.searchParams.set('start', String(offset))

      if (since) {
        url.searchParams.set(
          'query',
          JSON.stringify({
            _submission_time: { $gte: since.toISOString() },
          }),
        )
      }

      const response = await this.fetchWithRetry(url.toString(), apiToken)

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(
          `KoboToolbox API error ${response.status}: ${text.slice(0, 200)}`,
        )
      }

      const data = (await response.json()) as KoboApiDataResponse | KoboApiSubmission[]

      // KoboToolbox API can return either paginated or flat array
      let results: KoboApiSubmission[]
      if (Array.isArray(data)) {
        results = data
        hasMore = false
      } else {
        results = data.results ?? []
        hasMore = data.next !== null && results.length === PAGE_SIZE
      }

      allSubmissions.push(...results)
      offset += PAGE_SIZE

      // Safety: cap at 10,000 submissions per sync
      if (allSubmissions.length >= 10_000) {
        log.warn('Reached 10,000 submission cap during pull', { formId })
        hasMore = false
      }
    }

    return allSubmissions
  }

  // -----------------------------------------------------------
  // Private: Process a batch of submissions
  // -----------------------------------------------------------
  private async processBatch(
    submissions: KoboApiSubmission[],
    cooperativeId: string,
    formId: string,
    mappings: KoboFieldMappingRow[],
    formType: string | null,
    apiToken: string,
  ): Promise<{
    processed: number
    matched: number
    unmatched: number
    errors: number
    errorDetails: Array<{ instanceId: string; error: string }>
  }> {
    const supabase = await this.getSupabase()
    const batchResult = {
      processed: 0,
      matched: 0,
      unmatched: 0,
      errors: 0,
      errorDetails: [] as Array<{ instanceId: string; error: string }>,
    }

    for (const submission of submissions) {
      const instanceId = submission._uuid ?? String(submission._id)

      try {
        // Deduplication check
        const { data: existing } = await supabase
          .from('kobo_submissions')
          .select('id, status')
          .eq('kobo_instance_id', instanceId)
          .maybeSingle()

        if (existing) {
          // Already processed — skip
          batchResult.processed++
          if (existing.status === 'matched') batchResult.matched++
          else batchResult.unmatched++
          continue
        }

        // Extract card number from payload using key field mapping
        const cardNumber = this.extractCardNumber(submission, mappings)

        // Insert into kobo_submissions
        const { data: inserted, error: insertError } = await supabase
          .from('kobo_submissions')
          .insert({
            cooperative_id: cooperativeId,
            kobo_instance_id: instanceId,
            kobo_form_id: formId,
            raw_payload: submission as unknown as Record<string, unknown>,
            member_card_number: cardNumber,
            status: 'pending' as const,
            submitted_at: submission._submission_time,
          })
          .select('id')
          .single()

        if (insertError || !inserted) {
          batchResult.errors++
          batchResult.errorDetails.push({
            instanceId,
            error: insertError?.message ?? 'Insert failed',
          })
          continue
        }

        // Route by form type
        if (formType === 'cooperative_registration') {
          await processCooperativeRegistration(
            inserted.id,
            cooperativeId,
            submission as unknown as Record<string, unknown>,
          )
          batchResult.matched++
        } else if (cardNumber) {
          // Try to match by card number (update existing member's submission)
          await supabase.rpc('match_kobo_submission_to_member', {
            p_submission_id: inserted.id,
          })

          const { data: updated } = await supabase
            .from('kobo_submissions')
            .select('status, member_id')
            .eq('id', inserted.id)
            .single()

          if (updated?.status === 'matched' && updated.member_id) {
            await supabase.rpc('process_kobo_submission', {
              p_submission_id: inserted.id,
            })
            batchResult.matched++
          } else {
            batchResult.unmatched++
          }
        } else {
          // No card number — enroll as new member
          await enrollNewMemberFromSubmission(
            inserted.id,
            cooperativeId,
            submission as unknown as Record<string, unknown>,
            apiToken,
          )
          batchResult.matched++
        }

        batchResult.processed++
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Processing error'
        batchResult.errors++
        batchResult.errorDetails.push({ instanceId, error: message })
        log.error('Failed to process submission', {
          instanceId,
          cooperativeId,
          error: message,
        })
      }
    }

    return batchResult
  }

  // -----------------------------------------------------------
  // Private: Extract card number from submission using mappings
  // -----------------------------------------------------------
  private extractCardNumber(
    submission: KoboApiSubmission,
    mappings: KoboFieldMappingRow[],
  ): string | null {
    // Card numbers must match this pattern (e.g. "FEN-46738", "COOP-12345")
    const CARD_PATTERN = /^[A-Z]{2,6}-\d{4,8}$/

    const validate = (v: string): string | null => {
      const normalized = v.trim().toUpperCase()
      return CARD_PATTERN.test(normalized) ? normalized : null
    }

    // Find the key field mapping
    const keyMapping = mappings.find((m) => m.is_key_field)

    if (keyMapping) {
      const value = this.getNestedValue(submission, keyMapping.kobo_field)
      if (value) {
        const transformed = this.applyTransform(String(value), keyMapping.transform_fn)
        return validate(transformed)
      }
    }

    // Fallback: look for common card number field names
    const fallbackKeys = [
      'member_card_number',
      'card_number',
      'numero_carte',
      'S1/member_card_number',
    ]

    for (const key of fallbackKeys) {
      const value = this.getNestedValue(submission, key)
      if (value) return validate(String(value))
    }

    return null
  }

  // -----------------------------------------------------------
  // Private: Get nested value from submission (supports "group/field" paths)
  // -----------------------------------------------------------
  private getNestedValue(
    obj: Record<string, unknown>,
    path: string,
  ): unknown {
    // Try direct key first
    if (path in obj) return obj[path]

    // Try nested path (KoboCollect uses "group/field" format)
    const parts = path.split('/')
    let current: unknown = obj
    for (const part of parts) {
      if (current === null || current === undefined) return null
      if (typeof current !== 'object') return null
      current = (current as Record<string, unknown>)[part]
    }
    return current
  }

  // -----------------------------------------------------------
  // Private: Apply transform function to a value
  // -----------------------------------------------------------
  private applyTransform(value: string, transformFn: string | null): string {
    if (!transformFn) return value.trim()

    switch (transformFn) {
      case 'uppercase':
        return value.trim().toUpperCase()
      case 'trim':
        return value.trim()
      case 'to_number':
        return value.replace(/[^0-9.-]/g, '')
      case 'to_date':
        return value.trim()
      default:
        return value.trim()
    }
  }

  // -----------------------------------------------------------
  // Private: Get form type from integration config
  // -----------------------------------------------------------
  private async getFormType(cooperativeId: string): Promise<string | null> {
    const supabase = await this.getSupabase()
    const { data } = await supabase
      .from('integrations')
      .select('config')
      .eq('cooperative_id', cooperativeId)
      .eq('type', 'kobo')
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle()
    return (data?.config as Record<string, unknown>)?.form_type as string | null ?? null
  }

  // -----------------------------------------------------------
  // Private: Get field mappings for a cooperative/form
  // -----------------------------------------------------------
  private async getFieldMappings(
    cooperativeId: string,
    formId: string,
  ): Promise<KoboFieldMappingRow[]> {
    const supabase = await this.getSupabase()

    const { data } = await supabase
      .from('kobo_field_mappings')
      .select('*')
      .eq('cooperative_id', cooperativeId)
      .eq('form_id', formId)

    return (data as KoboFieldMappingRow[] | null) ?? []
  }

  // -----------------------------------------------------------
  // Private: Complete sync log
  // -----------------------------------------------------------
  private async completeSyncLog(syncLogId: string, result: SyncResult): Promise<void> {
    const supabase = await this.getSupabase()

    await supabase
      .from('kobo_sync_logs')
      .update({
        status: result.errors > 0 ? ('partial' as const) : ('success' as const),
        submissions_received: result.received,
        submissions_processed: result.processed,
        submissions_matched: result.matched,
        submissions_errors: result.errors,
        duration_ms: result.duration,
        error_details: result.errorDetails?.length
          ? (result.errorDetails as unknown as Record<string, unknown>)
          : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncLogId)
  }

  // -----------------------------------------------------------
  // Private: Fail sync log
  // -----------------------------------------------------------
  private async failSyncLog(syncLogId: string, error: string): Promise<void> {
    const supabase = await this.getSupabase()

    await supabase
      .from('kobo_sync_logs')
      .update({
        status: 'failed' as const,
        error_details: { error } as unknown as Record<string, unknown>,
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncLogId)
  }

  // -----------------------------------------------------------
  // Private: Fetch with retry (exponential backoff)
  // -----------------------------------------------------------
  private async fetchWithRetry(
    url: string,
    apiToken: string,
    attempt: number = 0,
  ): Promise<Response> {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Token ${apiToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      // Retry on 5xx or 429
      if (
        (response.status >= 500 || response.status === 429) &&
        attempt < MAX_RETRIES
      ) {
        const delay = Math.min(30_000, 1000 * Math.pow(2, attempt))
        await this.sleep(delay)
        return this.fetchWithRetry(url, apiToken, attempt + 1)
      }

      return response
    } catch (err: unknown) {
      if (attempt < MAX_RETRIES) {
        const delay = Math.min(30_000, 1000 * Math.pow(2, attempt))
        log.warn('KoboToolbox request failed, retrying', {
          attempt: attempt + 1,
          delay,
          error: err instanceof Error ? err.message : 'Unknown',
        })
        await this.sleep(delay)
        return this.fetchWithRetry(url, apiToken, attempt + 1)
      }
      throw err
    }
  }

  // -----------------------------------------------------------
  // Private: Download photo + signature for an already-enrolled member
  // -----------------------------------------------------------
  private async backfillMemberMedia(
    memberId: string,
    payload: Record<string, unknown>,
    apiToken?: string,
  ): Promise<void> {
    if (!apiToken) return
    const supabase = await this.getSupabase()

    const attachments = (payload._attachments ?? []) as Array<Record<string, string>>
    if (!attachments.length) return

    const downloadAndUpload = async (
      field: string | null,
      bucket: string,
      prefix: string,
    ): Promise<string | null> => {
      if (!field) return null
      const att =
        attachments.find((a) => a.question_xpath?.includes(field.split('/').pop() ?? field)) ??
        attachments.find((a) => a.filename?.includes(field))
      if (!att?.download_url) return null
      try {
        const resp = await fetch(att.download_url, { headers: { Authorization: `Token ${apiToken}` } })
        if (!resp.ok) return null
        const buf = Buffer.from(await resp.arrayBuffer())
        const ext = field.split('.').pop() ?? 'png'
        const path = `${prefix}/${Date.now()}_${field.split('/').pop()}`
        const { error } = await supabase.storage.from(bucket).upload(path, buf, {
          contentType: `image/${ext}`, upsert: true,
        })
        if (error) return null
        return supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl ?? null
      } catch { return null }
    }

    const getField = (keys: string[]): string | null => {
      for (const key of keys) {
        const v = (payload[key] ?? payload[key.split('/').pop() ?? key]) as string | undefined
        if (v && typeof v === 'string') return v.trim()
      }
      return null
    }

    const photoField = getField(['S1/photo_membre', 'photo_membre', 'identification/photo'])
    const signatureField = getField(['S7/signature_membre', 'signature_membre', 'signature'])

    const [photoUrl, signatureUrl] = await Promise.all([
      downloadAndUpload(photoField, 'member-photos', 'member-photos'),
      downloadAndUpload(signatureField, 'member-signatures', 'member-signatures'),
    ])

    const updates: Record<string, string> = {}
    if (photoUrl) updates.photo_url = photoUrl
    if (signatureUrl) updates.signature_url = signatureUrl
    if (Object.keys(updates).length) {
      await supabase.from('members').update(updates).eq('id', memberId)
    }
  }

  // -----------------------------------------------------------
  // Private: Utilities
  // -----------------------------------------------------------
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
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
