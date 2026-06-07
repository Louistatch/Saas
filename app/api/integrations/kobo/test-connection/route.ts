/**
 * POST /api/integrations/kobo/test-connection — read-only KoboToolbox connection check.
 *
 * Unlike POST /api/integrations/kobo (which persists the config), this route
 * NEVER writes to the database. If `apiToken` is omitted, it decrypts and
 * tests the cooperative's already-saved token — so "Tester la connexion"
 * works without forcing the admin to re-type (and risk overwriting) it.
 *
 * @security assertFaitiereAccess + assertTenantAccess
 */
import { NextRequest, NextResponse } from 'next/server'
import { assertFaitiereAccess, assertTenantAccess } from '@/lib/security/assert-access'
import { decryptSecret } from '@/lib/utils/crypto'
import { createLogger } from '@/lib/utils/logger'
import { KoboSyncService } from '@/lib/kobo/sync-service'
import { koboTestConnectionRequestSchema } from '@/lib/validators/kobo'

const log = createLogger('api:integrations:kobo:test-connection')

export async function POST(request: NextRequest) {
  const authResult = await assertFaitiereAccess()
  if (!authResult.ok) return authResult.response

  const { ctx } = authResult

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = koboTestConnectionRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const { cooperativeId, formId } = parsed.data
  let { apiToken } = parsed.data

  const tenantResult = await assertTenantAccess(cooperativeId)
  if (!tenantResult.ok) return tenantResult.response

  const { supabase } = ctx

  // No new token supplied — test against the already-saved (encrypted) one.
  if (!apiToken) {
    const { data: integration } = await supabase
      .from('integrations')
      .select('config')
      .eq('cooperative_id', cooperativeId)
      .eq('type', 'kobo')
      .maybeSingle()

    const encrypted = (integration?.config as Record<string, unknown> | null)?.api_key as string | undefined
    if (!encrypted) {
      return NextResponse.json(
        { error: 'Aucun token enregistré — saisissez un token API à tester.' },
        { status: 400 },
      )
    }

    try {
      apiToken = decryptSecret(encrypted)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Decryption failed'
      log.error('Failed to decrypt stored API token for test', { error: message })
      return NextResponse.json({ error: 'Erreur serveur lors du déchiffrement du token' }, { status: 500 })
    }
  }

  const syncService = new KoboSyncService()
  const result = await syncService.testConnection(apiToken, formId)

  if (!result.valid) {
    return NextResponse.json({ error: 'Connexion KoboToolbox échouée', details: result.error }, { status: 422 })
  }

  return NextResponse.json({
    valid: true,
    formTitle: result.formTitle,
    submissionCount: result.submissionCount,
  })
}
