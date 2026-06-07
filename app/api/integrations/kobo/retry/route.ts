/**
 * POST /api/integrations/kobo/retry
 *
 * Reprocesses ONE specific Kobo submission (per-row "Retenter" action),
 * instead of triggering a full cooperative incremental sync.
 *
 * Body: { cooperativeId: uuid, submissionId: uuid }
 *
 * @security assertRole('cooperative_admin') + assertTenantAccess
 * @security Rate limited: 10 req/min/user
 */
import { NextRequest, NextResponse } from 'next/server'
import { assertTenantAccess, assertRole } from '@/lib/security/assert-access'
import { createLogger } from '@/lib/utils/logger'
import { decryptSecret } from '@/lib/utils/crypto'
import { rateLimit, clientKeyFromHeaders } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { koboRetryRequestSchema } from '@/lib/validators/kobo'
import { KoboSyncService } from '@/lib/kobo/sync-service'

const log = createLogger('api:kobo:retry')

export async function POST(request: NextRequest) {
  const persistentBlock = await applyRateLimit(request, 'auth')
  if (persistentBlock) return persistentBlock

  const ip = clientKeyFromHeaders(request.headers)
  const rl = rateLimit(`retry:kobo:${ip}`, 10, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans quelques instants.' },
      { status: 429 },
    )
  }

  const roleResult = await assertRole('cooperative_admin')
  if (!roleResult.ok) return roleResult.response
  const { ctx } = roleResult

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = koboRetryRequestSchema.safeParse(body)
  if (!parsed.success || !parsed.data.submissionId) {
    return NextResponse.json(
      { error: 'submissionId requis pour une nouvelle tentative ciblée' },
      { status: 400 },
    )
  }

  const { cooperativeId, submissionId } = parsed.data

  const tenantResult = await assertTenantAccess(cooperativeId)
  if (!tenantResult.ok) return tenantResult.response

  const { supabase } = ctx

  const { data: integration } = await supabase
    .from('integrations')
    .select('config, status')
    .eq('cooperative_id', cooperativeId)
    .eq('type', 'kobo')
    .maybeSingle()

  if (!integration || integration.status !== 'connected') {
    return NextResponse.json({ error: 'Intégration KoboToolbox non connectée' }, { status: 400 })
  }

  const config = integration.config as { api_key?: string } | null
  let apiToken: string | undefined
  if (config?.api_key) {
    try {
      apiToken = decryptSecret(config.api_key)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Decryption failed'
      log.error('Failed to decrypt API token for retry', { error: message, cooperativeId })
    }
  }

  const syncService = new KoboSyncService()
  const result = await syncService.retrySingleSubmission(cooperativeId, submissionId, apiToken)

  if (result.succeeded === 1) {
    return NextResponse.json({ ok: true, message: 'Soumission retraitée avec succès' })
  }

  return NextResponse.json(
    { ok: false, error: result.errors[0]?.error ?? 'La nouvelle tentative a échoué' },
    { status: 422 },
  )
}
