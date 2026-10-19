import { readKoboConfig } from '@/lib/kobo/config'
import { checkKoboRateLimit } from '@/lib/kobo/rate-limit'
import { readStoredToken } from '@/lib/kobo/stored-token'
import { KoboSyncService } from '@/lib/kobo/sync-service'
import { assertRole, assertTenantAccess } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import { koboRetryRequestSchema } from '@/lib/validators/kobo'
/**
 * POST /api/integrations/kobo/retry
 *
 * Reprocesses Kobo submissions that are in error / unmatched / stale-pending:
 *  - with `submissionId` : exactly ONE row (per-row "Retenter" action) ;
 *  - without            : the retry queue (the oldest-attempted rows first), used by
 *                         « Retenter les erreurs » — without triggering a full sync.
 *
 * Body: { cooperativeId: uuid, submissionId?: uuid }
 *
 * @security assertRole('cooperative_admin') + assertTenantAccess
 * @security Rate limited: 10 req/min/USER, dedicated bucket (no longer the login 'auth' bucket)
 */
import { type NextRequest, NextResponse } from 'next/server'

const log = createLogger('api:kobo:retry')

// La relance en lot peut enchaîner jusqu'à 50 retraitements.
export const maxDuration = 60
const BULK_DEADLINE_MS = 45_000

export async function POST(request: NextRequest) {
  const roleResult = await assertRole('cooperative_admin')
  if (!roleResult.ok) return roleResult.response
  const { ctx } = roleResult

  const rate = await checkKoboRateLimit({ bucket: 'retry', key: ctx.userId, limit: 10, windowSec: 60 })
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans quelques instants.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = koboRetryRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête de nouvelle tentative invalide' }, { status: 400 })
  }

  const { cooperativeId, submissionId } = parsed.data

  const tenantResult = await assertTenantAccess(cooperativeId)
  if (!tenantResult.ok) return tenantResult.response

  const admin = createAdminClient()
  const { data: integration } = await admin
    .from('integrations')
    .select('config, status')
    .eq('cooperative_id', cooperativeId)
    .eq('type', 'kobo')
    .maybeSingle()

  if (!integration || (integration.status !== 'connected' && integration.status !== 'error')) {
    return NextResponse.json({ error: 'Intégration KoboToolbox non connectée' }, { status: 400 })
  }

  const cfg = readKoboConfig(integration.config)
  // Sans token exploitable la relance reste possible (hors téléchargement des pièces jointes).
  const stored = readStoredToken(cfg.apiKey)
  if (!stored.ok && stored.reason !== 'missing') {
    log.error('Stored API token unusable for retry', { reason: stored.reason, cooperativeId })
  }
  const apiToken = stored.ok ? stored.token : undefined

  const syncService = new KoboSyncService()
  const integrationCtx = { formType: cfg.formType, serverUrl: cfg.serverUrl }

  if (!submissionId) {
    const bulk = await syncService.retryFailedSubmissions(cooperativeId, apiToken, integrationCtx, {
      deadlineAt: Date.now() + BULK_DEADLINE_MS,
    })
    if (bulk.total === 0) {
      return NextResponse.json({ ok: true, retried: 0, succeeded: 0, failed: 0, message: 'Aucune soumission à retenter' })
    }
    return NextResponse.json({
      ok: bulk.failed === 0,
      retried: bulk.retried,
      succeeded: bulk.succeeded,
      failed: bulk.failed,
      skipped: bulk.skipped ?? 0,
      message: `${bulk.succeeded} soumission(s) retraitée(s), ${bulk.failed} en échec${
        bulk.skipped ? `, ${bulk.skipped} déjà en cours` : ''
      }`,
      errors: bulk.errors.slice(0, 5),
    })
  }

  const result = await syncService.retrySingleSubmission(cooperativeId, submissionId, apiToken, integrationCtx)

  if (result.succeeded === 1) {
    return NextResponse.json({ ok: true, message: 'Soumission retraitée avec succès' })
  }

  // Prise en charge par un autre traitement (webhook, synchronisation) : rien à relancer maintenant.
  if (result.skipped === 1) {
    return NextResponse.json(
      { ok: false, error: result.errors[0]?.error ?? 'Soumission déjà en cours de traitement' },
      { status: 409 },
    )
  }

  return NextResponse.json(
    { ok: false, error: result.errors[0]?.error ?? 'La nouvelle tentative a échoué' },
    { status: 422 },
  )
}
