/**
 * /api/integrations/kobo — CRUD sécurisé pour la configuration KoboToolbox
 *
 * GET    ?cooperativeId={uuid} — Retourne la config (token masqué, jamais le contenu brut de `config`)
 * GET    ?cooperativeId={uuid}&stats — Statistiques de soumissions
 * POST   — Crée/met à jour la config : chiffre le token, TESTE la connexion (asset + soumissions),
 *          FUSIONNE avec la config existante (form_type & co. ne sont jamais effacés),
 *          REFUSE (409) un formulaire déjà lié à une autre organisation
 * DELETE ?cooperativeId={uuid} — Déconnexion : efface token, secret de webhook, correspondances
 *
 * @security assertAuthenticated + assertFaitiereAccess (POST/DELETE)
 * @security assertTenantAccess (GET)
 * @security API token chiffré AES-256-GCM avant stockage
 * @security Token JAMAIS retourné au client (ni en clair, ni chiffré, ni ses derniers caractères)
 * @security `integrations.config` n'est lue/écrite qu'avec le client service_role, APRÈS les
 *           contrôles d'accès ci-dessus : la RLS ne doit pas exposer config au navigateur
 *           (migration 20261010_100000_kobo_security_and_sync.sql).
 *
 * @test Happy path: valid config + valid token → 200 + {ok: true}
 * @test Auth failure: non-faitiere user → 403
 * @test Validation failure: invalid formId → 400
 */
import { type NextRequest, NextResponse } from 'next/server'
import { assertAuthenticated, assertFaitiereAccess, assertTenantAccess } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { buildWebhookUrl, mergeKoboConfig, readKoboConfig, stripKoboConnectionKeys } from '@/lib/kobo/config'
import { KoboSyncService } from '@/lib/kobo/sync-service'
import { koboServerKind } from '@/lib/kobo/server-url'
import type { KoboConfigResponse, KoboStatsResponse } from '@/lib/kobo/types'
import { decryptSecret, encryptSecret, isEncrypted } from '@/lib/utils/crypto'
import { createLogger } from '@/lib/utils/logger'
import { generateWebhookSecret, hashWebhookSecret } from '@/lib/kobo/webhook-auth'
import {
  koboConfigQuerySchema,
  koboConfigSchema,
  koboDeleteQuerySchema,
} from '@/lib/validators/kobo'

const log = createLogger('api:integrations:kobo')

type AdminClient = ReturnType<typeof createAdminClient>

function appOrigin(request: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, '')
}

/** Charge la ligne d'intégration Kobo d'une coopérative (service_role : config incluse). */
async function loadIntegration(admin: AdminClient, cooperativeId: string) {
  const { data, error } = await admin
    .from('integrations')
    .select('id, status, config, last_sync_at')
    .eq('cooperative_id', cooperativeId)
    .eq('type', 'kobo')
    .maybeSingle()
  return { integration: data as { id: string; status: string; config: unknown; last_sync_at: string | null } | null, error }
}

/**
 * Un formulaire Kobo alimente UNE seule organisation : lié à deux, le webhook et les
 * synchronisations inscriraient chacun la même personne dans leur propre arbre. Renvoie
 * l'intégration d'une AUTRE coopérative qui utilise déjà ce formulaire (déconnectée : non).
 */
async function findFormOwner(admin: AdminClient, formId: string, cooperativeId: string) {
  const { data, error } = await admin
    .from('integrations')
    .select('id, cooperative_id, status')
    .eq('type', 'kobo')
    .filter('config->>form_id', 'eq', formId)
    .neq('cooperative_id', cooperativeId)
    .in('status', ['connected', 'error'])
    .limit(1)
  if (error) return { error: error.message, owner: null }
  return { error: null, owner: ((data ?? [])[0] as { cooperative_id: string } | undefined) ?? null }
}

/**
 * Remplace les correspondances de champs d'un formulaire. Une liste vide SUPPRIME tout.
 * Si l'insertion échoue après la suppression, les anciennes lignes sont rétablies
 * (compensation : supabase-js n'offre pas de transaction côté client).
 */
async function replaceFieldMappings(
  admin: AdminClient,
  cooperativeId: string,
  formId: string,
  mappings: Array<{
    koboField: string
    targetTable: string
    targetColumn: string
    transformFn?: string
    isKeyField: boolean
  }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: previous } = await admin
    .from('kobo_field_mappings')
    .select('*')
    .eq('cooperative_id', cooperativeId)
    .eq('form_id', formId)

  const { error: deleteError } = await admin
    .from('kobo_field_mappings')
    .delete()
    .eq('cooperative_id', cooperativeId)
    .eq('form_id', formId)
  if (deleteError) return { ok: false, error: deleteError.message }

  if (mappings.length === 0) return { ok: true }

  const rows = mappings.map((m) => ({
    cooperative_id: cooperativeId,
    form_id: formId,
    kobo_field: m.koboField,
    target_table: m.targetTable,
    target_column: m.targetColumn,
    transform_fn: m.transformFn ?? null,
    is_key_field: m.isKeyField,
  }))
  const { error: insertError } = await admin.from('kobo_field_mappings').insert(rows)
  if (insertError) {
    if (previous && previous.length > 0) {
      const restore = previous.map(({ id: _id, created_at: _created, ...rest }: Record<string, unknown>) => rest)
      await admin.from('kobo_field_mappings').insert(restore)
    }
    return { ok: false, error: insertError.message }
  }
  return { ok: true }
}

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

    // La RPC renvoie `last_sync` = date de la dernière SOUMISSION, pas de la dernière synchronisation.
    // On affiche la fin de la dernière synchronisation réellement terminée (journal kobo_sync_logs).
    const { data: lastLog } = await supabase
      .from('kobo_sync_logs')
      .select('completed_at')
      .eq('cooperative_id', cooperativeId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const raw = (data ?? {}) as Record<string, unknown>
    const num = (v: unknown) => (typeof v === 'number' ? v : 0)
    const stats: KoboStatsResponse = {
      total: num(raw.total),
      pending: num(raw.pending),
      processing: num(raw.processing),
      matched: num(raw.matched),
      unmatched: num(raw.unmatched),
      errors: num(raw.errors),
      duplicates: num(raw.duplicates),
      lastSync: (lastLog?.completed_at as string | undefined) ?? null,
    }
    return NextResponse.json(stats, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  }

  // Intégration + config : lues avec le client service_role APRÈS assertTenantAccess.
  const admin = createAdminClient()
  const { integration, error } = await loadIntegration(admin, cooperativeId)

  if (error) {
    log.error('Failed to fetch integration', { error: error.message, cooperativeId })
    return NextResponse.json({ error: 'Failed to fetch integration' }, { status: 500 })
  }

  if (!integration) {
    return NextResponse.json({ configured: false }, { status: 200 })
  }

  const cfg = readKoboConfig(integration.config)

  // Get field mappings
  const { data: mappings } = await supabase
    .from('kobo_field_mappings')
    .select('*')
    .eq('cooperative_id', cooperativeId)
    .eq('form_id', cfg.formId ?? '')

  // Jamais le contenu de `config` : uniquement des valeurs non secrètes, dans une liste blanche.
  const response: KoboConfigResponse = {
    cooperativeId,
    formId: cfg.formId ?? '',
    serverUrl: cfg.serverUrl,
    formType: cfg.formType ?? 'member_enrollment',
    webhookEnabled: cfg.webhookEnabled,
    webhookUrl: buildWebhookUrl(appOrigin(request), integration.id),
    webhookSecretConfigured: cfg.webhookSecretHash !== null,
    status: integration.status ?? 'disconnected',
    lastSyncAt: integration.last_sync_at ?? null,
    // Masque fixe : on ne révèle ni le token, ni sa version chiffrée, ni ses derniers caractères.
    apiTokenMasked: cfg.apiKey ? '••••••••••••••••' : '',
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

  // Parse body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate with Zod (token normalisé, Form ID extrait d'une URL, serveur contrôlé)
  const parsed = koboConfigSchema.safeParse(body)
  if (!parsed.success) {
    // `details` : premier motif lisible (ex. une correspondance de champ non prise en charge).
    const first = parsed.error.issues[0]
    return NextResponse.json(
      {
        error: 'Invalid input',
        details: first ? `${first.path.join('.') || 'configuration'} : ${first.message}` : undefined,
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const { cooperativeId, apiToken: newApiToken, formId, serverUrl: requestedServer, formType, webhookEnabled, fieldMappings } =
    parsed.data

  // Tenant access check
  const tenantResult = await assertTenantAccess(cooperativeId)
  if (!tenantResult.ok) return tenantResult.response

  const admin = createAdminClient()

  // Un formulaire, une organisation : refus AVANT tout appel à Kobo (aucun routage ambigu possible).
  const ownership = await findFormOwner(admin, formId, cooperativeId)
  if (ownership.error) {
    log.error('Failed to check form ownership', { error: ownership.error, cooperativeId })
    return NextResponse.json({ error: 'Failed to save integration' }, { status: 500 })
  }
  if (ownership.owner) {
    // Le nom de l'autre organisation n'est révélé qu'à ceux qui y ont accès.
    let label = 'une autre organisation'
    const otherAccess = await assertTenantAccess(ownership.owner.cooperative_id)
    if (otherAccess.ok) {
      const { data: other } = await admin
        .from('cooperatives')
        .select('name')
        .eq('id', ownership.owner.cooperative_id)
        .maybeSingle()
      if (other?.name) label = `« ${other.name as string} »`
    }
    return NextResponse.json(
      {
        error: 'Formulaire déjà utilisé',
        details: `Ce formulaire est déjà lié à ${label}. Un formulaire Kobo ne peut alimenter qu'une seule organisation : déconnectez-le de l'autre d'abord.`,
        code: 'form_already_linked',
      },
      { status: 409 },
    )
  }

  const { integration: existingRow } = await loadIntegration(admin, cooperativeId)
  const existing = readKoboConfig(existingRow?.config)
  const serverUrl = requestedServer ?? existing.serverUrl

  // Resolve which (plaintext) token to test/save: the freshly-submitted one,
  // or — when omitted — the cooperative's already-saved token.
  let plaintextToken = newApiToken
  let encryptedToken: string | null = null

  if (!plaintextToken) {
    if (!existing.apiKey) {
      return NextResponse.json(
        { error: 'Token API requis pour la première configuration' },
        { status: 400 },
      )
    }
    if (isEncrypted(existing.apiKey)) {
      try {
        plaintextToken = decryptSecret(existing.apiKey)
        encryptedToken = existing.apiKey
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Decryption failed'
        log.error('Failed to decrypt stored API token', { error: message })
        return NextResponse.json({ error: 'Server encryption configuration error' }, { status: 500 })
      }
    } else {
      // Valeur héritée en clair : elle est rechiffrée à l'enregistrement.
      plaintextToken = existing.apiKey
    }
  }

  // Test connection to KoboToolbox before saving (asset déployé + permission « Voir les soumissions »)
  const syncService = new KoboSyncService()
  const connectionTest = await syncService.testConnection(plaintextToken, formId, serverUrl)

  if (!connectionTest.valid) {
    return NextResponse.json(
      {
        error: 'Connexion KoboToolbox échouée',
        details: connectionTest.error,
        code: connectionTest.code ?? null,
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

  // Secret de webhook propre à l'intégration : généré à la première configuration (ou pour une
  // intégration héritée qui n'en a pas), affiché UNE fois, seul son hash est stocké.
  const newWebhookSecret = existing.webhookSecretHash ? null : generateWebhookSecret()
  const targetChanged = existing.formId !== formId || existing.serverUrl !== serverUrl

  // FUSION avec la config existante : form_type, secret de webhook, watermark… ne sont jamais effacés.
  const config = mergeKoboConfig(existingRow?.config, {
    api_key: encryptedToken,
    form_id: formId,
    server_url: serverUrl,
    webhook_enabled: webhookEnabled ?? existing.webhookEnabled,
    form_title: connectionTest.formTitle ?? null,
    submission_count: connectionTest.submissionCount ?? 0,
    form_type: formType,
    webhook_secret_hash: newWebhookSecret ? hashWebhookSecret(newWebhookSecret) : undefined,
    // Autre formulaire ou autre serveur : l'ancienne borne incrémentale n'a plus de sens.
    sync_watermark: targetChanged ? null : undefined,
  })

  // last_sync_at n'est PAS écrit ici (aucune soumission n'a été lue) ; remis à null si la cible change.
  const { data: saved, error: upsertError } = await admin
    .from('integrations')
    .upsert(
      {
        cooperative_id: cooperativeId,
        type: 'kobo',
        status: 'connected',
        config,
        ...(existingRow && targetChanged ? { last_sync_at: null } : {}),
      },
      { onConflict: 'cooperative_id,type' },
    )
    .select('id')
    .single()

  // 23505 : l'index unique « un formulaire, une organisation » a tranché une course entre deux enregistrements.
  if (upsertError?.code === '23505') {
    return NextResponse.json(
      {
        error: 'Formulaire déjà utilisé',
        details: "Ce formulaire est déjà lié à une autre organisation. Un formulaire Kobo ne peut alimenter qu'une seule organisation.",
        code: 'form_already_linked',
      },
      { status: 409 },
    )
  }

  if (upsertError || !saved) {
    log.error('Failed to upsert integration', { error: upsertError?.message, cooperativeId })
    return NextResponse.json({ error: 'Failed to save integration' }, { status: 500 })
  }

  // Correspondances de champs : omis = inchangées ; [] = toutes supprimées.
  const warnings: string[] = []
  if (fieldMappings !== undefined) {
    const replaced = await replaceFieldMappings(admin, cooperativeId, formId, fieldMappings)
    if (!replaced.ok) {
      log.error('Failed to save field mappings', { error: replaced.error })
      warnings.push(
        "Configuration enregistrée, mais les correspondances de champs n'ont pas pu l'être : réessayez.",
      )
    }
  }

  log.info('Kobo integration configured', {
    cooperativeId,
    formId,
    serverKind: koboServerKind(serverUrl),
    formTitle: connectionTest.formTitle,
  })

  return NextResponse.json({
    ok: true,
    formTitle: connectionTest.formTitle,
    submissionCount: connectionTest.submissionCount,
    deploymentStatus: connectionTest.deploymentStatus,
    warning: connectionTest.warning ?? null,
    warnings,
    serverUrl,
    webhookUrl: buildWebhookUrl(appOrigin(request), saved.id as string),
    // Affiché UNE seule fois : seul son hash SHA-256 est conservé.
    webhookSecret: newWebhookSecret,
  })
}

// =========================================================
// DELETE /api/integrations/kobo?cooperativeId={uuid}
// =========================================================
export async function DELETE(request: NextRequest) {
  // Auth: only faitiere admins can delete integrations
  const authResult = await assertFaitiereAccess()
  if (!authResult.ok) return authResult.response

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

  const admin = createAdminClient()
  const { integration } = await loadIntegration(admin, cooperativeId)

  if (integration) {
    // Déconnexion : le token, le secret de webhook (le webhook cesse d'authentifier) et la borne
    // incrémentale disparaissent ; les préférences (form_type, server_url) sont conservées.
    const config = {
      ...stripKoboConnectionKeys(mergeKoboConfig(integration.config, {})),
      webhook_enabled: false,
    }
    const { error } = await admin
      .from('integrations')
      .update({ status: 'disconnected', last_sync_at: null, config })
      .eq('cooperative_id', cooperativeId)
      .eq('type', 'kobo')

    if (error) {
      log.error('Failed to disconnect integration', { error: error.message, cooperativeId })
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
    }

    // Les correspondances de champs appartiennent à la configuration déconnectée.
    const { error: mappingError } = await admin.from('kobo_field_mappings').delete().eq('cooperative_id', cooperativeId)
    if (mappingError) log.warn('Failed to clear field mappings on disconnect', { error: mappingError.message })
  }

  log.info('Kobo integration disconnected', { cooperativeId })

  return NextResponse.json({ ok: true, message: 'Intégration KoboToolbox déconnectée' })
}
