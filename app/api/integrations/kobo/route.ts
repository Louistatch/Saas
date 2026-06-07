/**
 * /api/integrations/kobo — CRUD sécurisé pour la configuration KoboToolbox
 *
 * GET    ?cooperativeId={uuid} — Retourne la config (token masqué)
 * POST   — Crée/update la config (chiffre le token, teste la connexion)
 * DELETE ?cooperativeId={uuid} — Soft delete (active = false)
 *
 * GET /api/integrations/kobo/stats?cooperativeId={uuid} — voir route séparée
 *
 * @security assertAuthenticated + assertFaitiereAccess (POST/DELETE)
 * @security assertTenantAccess (GET)
 * @security API token chiffré AES-256-GCM avant stockage
 * @security Token JAMAIS retourné au client (masqué: "••••••••{last4}")
 *
 * @test Happy path: valid config + valid token → 200 + {ok: true}
 * @test Auth failure: non-faitiere user → 403
 * @test Validation failure: invalid formId → 400
 */
import { NextRequest, NextResponse } from 'next/server'
import { assertAuthenticated, assertTenantAccess, assertFaitiereAccess } from '@/lib/security/assert-access'
import { encryptSecret, decryptSecret, isEncrypted } from '@/lib/utils/crypto'
import { createLogger } from '@/lib/utils/logger'
import { KoboSyncService } from '@/lib/kobo/sync-service'
import {
  koboConfigSchema,
  koboConfigQuerySchema,
  koboDeleteQuerySchema,
  koboStatsQuerySchema,
} from '@/lib/validators/kobo'
import type { KoboConfigResponse, KoboStatsResponse } from '@/lib/kobo/types'

const log = createLogger('api:integrations:kobo')

// =========================================================
// GET /api/integrations/kobo?cooperativeId={uuid}
// =========================================================
export async function GET(request: NextRequest) {
  // Auth check
  const authResult = await assertAuthenticated()
  if (!authResult.ok) return authResult.response

  const { ctx } = authResult
  const { searchParams } = new URL(request.url)

  // Check if this is a stats request
  const isStats = searchParams.has('stats')

  // Validate query params
  const queryParsed = koboConfigQuerySchema.safeParse({
    cooperativeId: searchParams.get('cooperativeId'),
  })

  if (!queryParsed.success) {
    return NextResponse.json(
      { error: 'Invalid cooperativeId', issues: queryParsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const { cooperativeId } = queryParsed.data

  // Tenant access check
  const tenantResult = await assertTenantAccess(cooperativeId)
  if (!tenantResult.ok) return tenantResult.response

  const { supabase } = ctx

  // Stats endpoint
  if (isStats) {
    const { data, error } = await supabase.rpc('get_kobo_stats', {
      p_cooperative_id: cooperativeId,
    })

    if (error) {
      log.error('Failed to get kobo stats', { error: error.message, cooperativeId })
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
    }

    const stats = data as KoboStatsResponse | null
    return NextResponse.json(stats ?? {
      total: 0,
      pending: 0,
      processing: 0,
      matched: 0,
      unmatched: 0,
      errors: 0,
      duplicates: 0,
      lastSync: null,
    }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  }

  // Get integration config
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('id, cooperative_id, type, status, config, last_sync_at, created_at')
    .eq('cooperative_id', cooperativeId)
    .eq('type', 'kobo')
    .maybeSingle()

  if (error) {
    log.error('Failed to fetch integration', { error: error.message, cooperativeId })
    return NextResponse.json({ error: 'Failed to fetch integration' }, { status: 500 })
  }

  if (!integration) {
    return NextResponse.json({ configured: false }, { status: 200 })
  }

  const config = integration.config as Record<string, unknown> | null

  // Mask the API token — NEVER return it to the client
  const rawToken = config?.api_key as string | undefined
  let apiTokenMasked = ''
  if (rawToken && isEncrypted(rawToken)) {
    // Show only format indicator
    apiTokenMasked = '••••••••••••••••'
  } else if (rawToken) {
    apiTokenMasked = `••••••••${rawToken.slice(-4)}`
  }

  // Get field mappings
  const { data: mappings } = await supabase
    .from('kobo_field_mappings')
    .select('*')
    .eq('cooperative_id', cooperativeId)
    .eq('form_id', (config?.form_id as string) ?? '')

  const response: KoboConfigResponse = {
    cooperativeId,
    formId: (config?.form_id as string) ?? '',
    webhookEnabled: (config?.webhook_enabled as boolean) ?? true,
    status: integration.status ?? 'disconnected',
    lastSyncAt: integration.last_sync_at ?? null,
    apiTokenMasked,
    fieldMappings: mappings ?? [],
  }

  return NextResponse.json(response)
}

// =========================================================
// POST /api/integrations/kobo
// =========================================================
export async function POST(request: NextRequest) {
  // Auth: only faitiere admins can configure integrations
  const authResult = await assertFaitiereAccess()
  if (!authResult.ok) return authResult.response

  const { ctx } = authResult

  // Parse body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate with Zod
  const parsed = koboConfigSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const { cooperativeId, apiToken: newApiToken, formId, webhookEnabled, fieldMappings } = parsed.data

  // Tenant access check
  const tenantResult = await assertTenantAccess(cooperativeId)
  if (!tenantResult.ok) return tenantResult.response

  const { supabase } = ctx

  // Resolve which (plaintext) token to test/save: the freshly-submitted one,
  // or — when omitted — the cooperative's already-saved encrypted token.
  let plaintextToken = newApiToken
  let encryptedToken: string | null = null

  if (!plaintextToken) {
    const { data: existing } = await supabase
      .from('integrations')
      .select('config')
      .eq('cooperative_id', cooperativeId)
      .eq('type', 'kobo')
      .maybeSingle()

    const existingEncrypted = (existing?.config as Record<string, unknown> | null)?.api_key as string | undefined
    if (!existingEncrypted) {
      return NextResponse.json(
        { error: 'Token API requis pour la première configuration' },
        { status: 400 },
      )
    }

    try {
      plaintextToken = decryptSecret(existingEncrypted)
      encryptedToken = existingEncrypted
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Decryption failed'
      log.error('Failed to decrypt stored API token', { error: message })
      return NextResponse.json({ error: 'Server encryption configuration error' }, { status: 500 })
    }
  }

  // Test connection to KoboToolbox before saving
  const syncService = new KoboSyncService()
  const connectionTest = await syncService.testConnection(plaintextToken, formId)

  if (!connectionTest.valid) {
    return NextResponse.json(
      {
        error: 'Connexion KoboToolbox échouée',
        details: connectionTest.error,
      },
      { status: 422 },
    )
  }

  // Encrypt the new token (skip if we're keeping the existing encrypted one)
  if (!encryptedToken) {
    try {
      encryptedToken = encryptSecret(plaintextToken)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Encryption failed'
      log.error('Failed to encrypt API token', { error: message })
      return NextResponse.json(
        { error: 'Server encryption configuration error' },
        { status: 500 },
      )
    }
  }

  // Upsert integration config
  const { error: upsertError } = await supabase.from('integrations').upsert(
    {
      cooperative_id: cooperativeId,
      type: 'kobo',
      status: 'connected',
      last_sync_at: new Date().toISOString(),
      config: {
        api_key: encryptedToken,
        form_id: formId,
        webhook_enabled: webhookEnabled,
        form_title: connectionTest.formTitle ?? null,
        submission_count: connectionTest.submissionCount ?? 0,
      },
    },
    { onConflict: 'cooperative_id,type' },
  )

  if (upsertError) {
    log.error('Failed to upsert integration', { error: upsertError.message, cooperativeId })
    return NextResponse.json({ error: 'Failed to save integration' }, { status: 500 })
  }

  // Save field mappings if provided
  if (fieldMappings && fieldMappings.length > 0) {
    // Delete existing mappings for this form
    await supabase
      .from('kobo_field_mappings')
      .delete()
      .eq('cooperative_id', cooperativeId)
      .eq('form_id', formId)

    // Insert new mappings
    const mappingRows = fieldMappings.map((m) => ({
      cooperative_id: cooperativeId,
      form_id: formId,
      kobo_field: m.koboField,
      target_table: m.targetTable,
      target_column: m.targetColumn,
      transform_fn: m.transformFn ?? null,
      is_key_field: m.isKeyField,
    }))

    const { error: mappingError } = await supabase
      .from('kobo_field_mappings')
      .insert(mappingRows)

    if (mappingError) {
      log.error('Failed to save field mappings', { error: mappingError.message })
      // Non-blocking — config is saved, mappings can be retried
    }
  }

  log.info('Kobo integration configured', {
    cooperativeId,
    formId,
    formTitle: connectionTest.formTitle,
  })

  return NextResponse.json({
    ok: true,
    formTitle: connectionTest.formTitle,
    submissionCount: connectionTest.submissionCount,
  })
}

// =========================================================
// DELETE /api/integrations/kobo?cooperativeId={uuid}
// =========================================================
export async function DELETE(request: NextRequest) {
  // Auth: only faitiere admins can delete integrations
  const authResult = await assertFaitiereAccess()
  if (!authResult.ok) return authResult.response

  const { ctx } = authResult
  const { searchParams } = new URL(request.url)

  // Validate query params
  const queryParsed = koboDeleteQuerySchema.safeParse({
    cooperativeId: searchParams.get('cooperativeId'),
  })

  if (!queryParsed.success) {
    return NextResponse.json(
      { error: 'Invalid cooperativeId' },
      { status: 400 },
    )
  }

  const { cooperativeId } = queryParsed.data

  // Tenant access check
  const tenantResult = await assertTenantAccess(cooperativeId)
  if (!tenantResult.ok) return tenantResult.response

  const { supabase } = ctx

  // Soft delete: set status to disconnected, clear sensitive config
  const { error } = await supabase
    .from('integrations')
    .update({
      status: 'disconnected',
      config: { api_key: null, form_id: null, webhook_enabled: false },
    })
    .eq('cooperative_id', cooperativeId)
    .eq('type', 'kobo')

  if (error) {
    log.error('Failed to disconnect integration', { error: error.message, cooperativeId })
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }

  log.info('Kobo integration disconnected', { cooperativeId })

  return NextResponse.json({ ok: true, message: 'Intégration KoboToolbox déconnectée' })
}
