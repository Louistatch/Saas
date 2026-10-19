/**
 * POST /api/integrations/kobo/test-connection — read-only KoboToolbox connection check.
 *
 * Unlike POST /api/integrations/kobo (which persists the config), this route
 * NEVER writes to the database. If `apiToken` is omitted, it decrypts and
 * tests the cooperative's already-saved token — so "Tester la connexion"
 * works without forcing the admin to re-type (and risk overwriting) it.
 *
 * Le test reproduit ce que fera la synchronisation : lecture de l'asset, formulaire
 * déployé, ET lecture des soumissions (permission « Voir les soumissions »). Les erreurs
 * sont des messages français déjà épurés : ni le token, ni de message brut du runtime.
 *
 * @security assertFaitiereAccess + assertTenantAccess
 */
import { type NextRequest, NextResponse } from 'next/server'
import { assertFaitiereAccess, assertTenantAccess } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { readKoboConfig } from '@/lib/kobo/config'
import { readStoredToken } from '@/lib/kobo/stored-token'
import { KoboSyncService } from '@/lib/kobo/sync-service'
import { createLogger } from '@/lib/utils/logger'
import { koboTestConnectionRequestSchema } from '@/lib/validators/kobo'

const log = createLogger('api:integrations:kobo:test-connection')

export async function POST(request: NextRequest) {
  const authResult = await assertFaitiereAccess()
  if (!authResult.ok) return authResult.response

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

  const { cooperativeId, formId, serverUrl: requestedServer } = parsed.data
  let { apiToken } = parsed.data

  const tenantResult = await assertTenantAccess(cooperativeId)
  if (!tenantResult.ok) return tenantResult.response

  // Config lue avec le client service_role, APRÈS les contrôles d'accès.
  const admin = createAdminClient()
  const { data: integration } = await admin
    .from('integrations')
    .select('config')
    .eq('cooperative_id', cooperativeId)
    .eq('type', 'kobo')
    .maybeSingle()
  const cfg = readKoboConfig(integration?.config)
  const serverUrl = requestedServer ?? cfg.serverUrl

  // No new token supplied — test against the already-saved one.
  if (!apiToken) {
    const stored = readStoredToken(cfg.apiKey)
    if (!stored.ok) {
      if (stored.reason === 'missing') {
        return NextResponse.json(
          { error: 'Aucun token enregistré — saisissez un token API à tester.' },
          { status: 400 },
        )
      }
      log.error('Stored API token unusable for test', { reason: stored.reason })
      return NextResponse.json(
        { error: 'Le token enregistré est inutilisable — saisissez-le à nouveau.' },
        { status: 400 },
      )
    }
    apiToken = stored.token
  }

  const syncService = new KoboSyncService()
  const result = await syncService.testConnection(apiToken, formId, serverUrl)

  if (!result.valid) {
    return NextResponse.json(
      { error: 'Connexion KoboToolbox échouée', details: result.error, code: result.code ?? null },
      { status: 422 },
    )
  }

  return NextResponse.json({
    valid: true,
    formTitle: result.formTitle,
    submissionCount: result.submissionCount,
    deploymentStatus: result.deploymentStatus,
    canViewSubmissions: result.canViewSubmissions ?? false,
    warning: result.warning ?? null,
    serverUrl,
    formId,
  })
}
