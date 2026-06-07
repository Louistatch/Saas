/**
 * POST /api/integrations/kobo/sync
 *
 * Triggers a manual sync from KoboToolbox API.
 * Pulls new submissions, processes them, and retries failed ones.
 *
 * Body: { cooperativeId: uuid, mode: 'full' | 'incremental' }
 *
 * @security assertAuthenticated + assertRole(['cooperative_admin','faitiere_admin','super_admin'])
 * @security assertTenantAccess(cooperativeId)
 * @security Rate limited: 5 req/min/user (anti-spam)
 * @security maxDuration = 60 (Vercel function timeout)
 *
 * @test Happy path: valid auth + connected integration → 200 + SyncResult
 * @test Auth failure: member role → 403
 * @test Validation failure: missing cooperativeId → 400
 */
import { NextRequest, NextResponse } from 'next/server'
import { assertAuthenticated, assertTenantAccess, assertRole } from '@/lib/security/assert-access'
import { createLogger } from '@/lib/utils/logger'
import { decryptSecret } from '@/lib/utils/crypto'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { koboSyncRequestSchema } from '@/lib/validators/kobo'
import { KoboSyncService } from '@/lib/kobo/sync-service'
import type { SyncResult } from '@/lib/kobo/types'

const log = createLogger('api:kobo:sync')

// Vercel function timeout — 60 seconds
export const maxDuration = 60

export async function POST(request: NextRequest) {
  // -------------------------------------------------------
  // Rate limiting: 5 req/min/user (anti-spam sync manuelle)
  // -------------------------------------------------------
  const persistentBlock = await applyRateLimit(request, 'kobo-sync')
  if (persistentBlock) return persistentBlock

  // -------------------------------------------------------
  // Authentication + Role check
  // -------------------------------------------------------
  const roleResult = await assertRole('cooperative_admin')
  if (!roleResult.ok) return roleResult.response

  const { ctx } = roleResult

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

  const { cooperativeId, mode } = parsed.data

  // -------------------------------------------------------
  // Tenant access check
  // -------------------------------------------------------
  const tenantResult = await assertTenantAccess(cooperativeId)
  if (!tenantResult.ok) return tenantResult.response

  const { supabase } = ctx

  // -------------------------------------------------------
  // Get integration config
  // -------------------------------------------------------
  const { data: integration } = await supabase
    .from('integrations')
    .select('id, config, status, last_sync_at')
    .eq('cooperative_id', cooperativeId)
    .eq('type', 'kobo')
    .maybeSingle()

  if (!integration || integration.status !== 'connected') {
    return NextResponse.json(
      { error: 'Intégration KoboToolbox non connectée' },
      { status: 400 },
    )
  }

  const config = integration.config as {
    api_key?: string
    form_id?: string
    webhook_enabled?: boolean
  } | null

  if (!config?.api_key || !config?.form_id) {
    return NextResponse.json(
      { error: 'Configuration incomplète : clé API ou Form ID manquant' },
      { status: 400 },
    )
  }

  // -------------------------------------------------------
  // Decrypt API token
  // -------------------------------------------------------
  let apiToken: string
  try {
    apiToken = decryptSecret(config.api_key)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Decryption failed'
    log.error('Failed to decrypt API token', { error: message, cooperativeId })
    return NextResponse.json(
      { error: 'Erreur de déchiffrement du token. Reconfigurez l\'intégration.' },
      { status: 500 },
    )
  }

  // -------------------------------------------------------
  // Determine sync start date
  // -------------------------------------------------------
  let since: Date | undefined
  if (mode === 'incremental' && integration.last_sync_at) {
    since = new Date(integration.last_sync_at)
  }
  // mode === 'full' → since = undefined → fetch all

  // -------------------------------------------------------
  // Execute sync
  // -------------------------------------------------------
  const syncService = new KoboSyncService()

  let result: SyncResult
  try {
    result = await syncService.pullSubmissions({
      cooperativeId,
      formId: config.form_id,
      apiToken,
      since,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    log.error('Kobo sync failed', { error: message, cooperativeId })

    // Update integration status
    await supabase
      .from('integrations')
      .update({ status: 'error' })
      .eq('cooperative_id', cooperativeId)
      .eq('type', 'kobo')

    return NextResponse.json(
      { error: 'Synchronisation échouée', details: message },
      { status: 500 },
    )
  }

  // -------------------------------------------------------
  // Retry failed submissions
  // -------------------------------------------------------
  let retryResult: { succeeded: number; failed: number } = { succeeded: 0, failed: 0 }
  try {
    const retry = await syncService.retryFailedSubmissions(cooperativeId, apiToken)
    retryResult = { succeeded: retry.succeeded, failed: retry.failed }
  } catch (err: unknown) {
    log.warn('Retry failed submissions error', {
      error: err instanceof Error ? err.message : 'Unknown',
      cooperativeId,
    })
  }

  // -------------------------------------------------------
  // Update last_sync_at
  // -------------------------------------------------------
  await supabase
    .from('integrations')
    .update({
      last_sync_at: new Date().toISOString(),
      status: 'connected',
    })
    .eq('cooperative_id', cooperativeId)
    .eq('type', 'kobo')

  // -------------------------------------------------------
  // Response
  // -------------------------------------------------------
  log.info('Kobo sync completed', {
    cooperativeId,
    mode,
    received: result.received,
    matched: result.matched,
    errors: result.errors,
    duration: result.duration,
  })

  return NextResponse.json({
    success: result.success,
    syncLogId: result.syncLogId,
    mode,
    sync: {
      received: result.received,
      processed: result.processed,
      matched: result.matched,
      unmatched: result.unmatched,
      errors: result.errors,
      duration: result.duration,
    },
    retries: retryResult,
    message: `Sync terminée : ${result.received} reçues, ${result.matched} matchées, ${result.unmatched} non matchées, ${result.errors} erreurs`,
  })
}
