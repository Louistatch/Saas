/**
 * POST /api/webhooks/kobo?integration=<id>
 *
 * KoboToolbox webhook endpoint (REST Service) — receives field submissions in real-time.
 *
 * Configuration dans KoboToolbox → Paramètres du projet → REST Services :
 *   - URL : celle affichée par l'interface (…/api/webhooks/kobo?integration=<id>) ;
 *   - secret : en-tête HTTP personnalisé `X-Kobo-Secret: <secret>`, ou Authentification de
 *     base (le secret est le mot de passe). KoboToolbox ne signe JAMAIS ses requêtes (pas de HMAC).
 *
 * Pipeline (strict order):
 *  1. Content-Type + Size validation
 *  2. Failure throttle (échecs d'authentification par IP — jamais les envois réussis : les IP de
 *     KoboToolbox sont partagées par tous ses utilisateurs)
 *  3. Authentification : secret PROPRE À L'INTÉGRATION (hash SHA-256, comparaison en temps
 *     constant) ; le tenant est déduit de l'intégration authentifiée, JAMAIS du corps
 *     de la requête. Repli transitoire : KOBO_WEBHOOK_SECRET sur l'ancienne URL, réservé aux
 *     intégrations qui n'ont pas encore de secret propre (voir resolveLegacyIntegration)
 *  4. JSON parsing + Zod validation
 *  5. Le formulaire du payload doit être CELUI de l'intégration (sinon 403)
 *  6. webhook_enabled, limite de débit par intégration
 *  7. Déduplication sur l'identité STABLE de la soumission (meta/rootUuid, sinon _uuid), par
 *     coopérative ; une version modifiée met la ligne à jour au lieu de créer un doublon
 *  8. Async processing (répartiteur commun : prise en charge exclusive de la ligne, rapprochement
 *     par le champ clé configuré dans l'arbre de l'organisation, inscription rejouable)
 *
 * Codes de réponse alignés sur la relance de Kobo (502/503/504 sont réessayés, tout autre
 * 4xx/5xx non) : erreur de stockage ou surcharge → 503 + Retry-After ; payload invalide → 422.
 *
 * @security Secret par intégration, timing-safe ; secret global en repli transitoire uniquement
 * @security Payload capped at 2MB
 * @security No stack traces, secrets or tokens exposed to client or logs
 *
 * @test Happy path: secret de l'intégration + payload valide → 200 + submission_id
 * @test Auth failure: missing/invalid secret → 403
 * @test Wrong tenant: secret valide mais formulaire d'une autre coopérative → 403
 */
import { waitUntil } from '@vercel/functions'
import { timingSafeEqual } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { readKoboConfig } from '@/lib/kobo/config'
import { extractMemberKey } from '@/lib/kobo/identity'
import { registerSubmission } from '@/lib/kobo/ingest'
import { loadFieldMappings } from '@/lib/kobo/mappings'
import { dispatchSubmission } from '@/lib/kobo/processors'
import { checkKoboRateLimit } from '@/lib/kobo/rate-limit'
import { readStoredToken } from '@/lib/kobo/stored-token'
import { scrubSecrets } from '@/lib/kobo/api-client'
import type { KoboWebhookResponse } from '@/lib/kobo/types'
import {
  createFailureThrottle,
  extractPresentedSecret,
  verifyWebhookSecret,
} from '@/lib/kobo/webhook-auth'
import { createClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import { koboWebhookPayloadSchema } from '@/lib/validators/kobo'

const log = createLogger('webhook:kobo')

const MAX_BODY_BYTES = 2_097_152
/** Plafond par intégration (après authentification) : large, pour absorber une équipe qui synchronise d'un coup. */
const WEBHOOK_LIMIT_PER_MINUTE = 300
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

// Échecs d'authentification par IP : au-delà de 30/min, on répond 429 sans toucher à la base.
const failureThrottle = createFailureThrottle({ max: 30, windowMs: 60_000 })

type AdminClient = ReturnType<typeof createClient>

interface IntegrationRow {
  id: string
  cooperative_id: string | null
  status: string
  config: unknown
}

// =========================================================
// Timing-safe string comparison (secret global hérité)
// =========================================================
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) {
    // Compare against self to maintain constant time
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

function json(body: KoboWebhookResponse | { error: string }, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers })
}

/**
 * REPLI TRANSITOIRE (ancienne URL sans ?integration=) : le secret global identifie l'appelant
 * comme « un client Kobo de la plateforme », pas une coopérative. La coopérative est alors lue
 * dans le payload, ce qui n'est acceptable que si le formulaire désigne UNE seule intégration
 * et que celle-ci n'a pas encore de secret propre. À retirer une fois les REST Services migrés.
 */
async function resolveLegacyIntegration(
  supabase: AdminClient,
  formId: string,
): Promise<{ integration: IntegrationRow } | { response: NextResponse }> {
  const { data } = await supabase
    .from('integrations')
    .select('id, cooperative_id, status, config')
    .eq('type', 'kobo')
    .in('status', ['connected', 'error'])
    .filter('config->>form_id', 'eq', formId)
    .limit(2)

  const rows = (data ?? []) as IntegrationRow[]
  if (rows.length === 0) {
    log.warn('No integration found for form (legacy secret)')
    // 200 : ne pas faire réessayer Kobo pour un problème de configuration.
    return { response: json({ received: true, status: 'error', message: 'No integration configured for this form' }) }
  }
  if (rows.length > 1) {
    log.warn('Legacy secret refused: form attached to several integrations')
    return { response: json({ error: 'Formulaire rattaché à plusieurs intégrations : utilisez le secret de l\'intégration' }, 409) }
  }
  const integration = rows[0] as IntegrationRow
  if (readKoboConfig(integration.config).webhookSecretHash) {
    log.warn('Legacy secret refused: integration has its own secret', { integrationId: integration.id })
    return { response: json({ error: 'Unauthorized' }, 403) }
  }
  log.warn('Webhook authenticated with the DEPRECATED global secret', { integrationId: integration.id })
  return { integration }
}

// =========================================================
// POST handler
// =========================================================
export async function POST(request: NextRequest): Promise<NextResponse> {
  // -------------------------------------------------------
  // 1. Content-Type + size validation
  // -------------------------------------------------------
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return json({ error: 'Content-Type invalide' }, 415)
  }

  const contentLength = Number.parseInt(request.headers.get('content-length') ?? '0', 10)
  if (Number.isNaN(contentLength) || contentLength > MAX_BODY_BYTES) {
    return json({ error: 'Payload trop volumineux (max 2MB)' }, 413)
  }

  // -------------------------------------------------------
  // 2. Failure throttle (IP) — ne compte que les échecs d'authentification
  // -------------------------------------------------------
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (failureThrottle.isBlocked(ip)) {
    return json({ error: 'Trop de requêtes non authentifiées' }, 429, { 'Retry-After': '60' })
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return json({ error: 'Cannot read body' }, 400)
  }
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return json({ error: 'Payload trop volumineux (max 2MB)' }, 413)
  }

  const supabase = createClient()
  const presented = extractPresentedSecret(request.headers)
  const integrationParam = new URL(request.url).searchParams.get('integration')

  // -------------------------------------------------------
  // 3. Authentification — secret propre à l'intégration ; tenant déduit du secret
  // -------------------------------------------------------
  let integration: IntegrationRow | null = null
  let legacyAuth = false

  if (integrationParam !== null) {
    if (UUID_RE.test(integrationParam)) {
      const { data } = await supabase
        .from('integrations')
        .select('id, cooperative_id, status, config')
        .eq('id', integrationParam)
        .eq('type', 'kobo')
        .maybeSingle()
      const row = data as IntegrationRow | null
      // Le secret GLOBAL n'est jamais accepté ici : seul le hash de cette intégration compte.
      if (row && verifyWebhookSecret(presented?.secret, readKoboConfig(row.config).webhookSecretHash)) {
        integration = row
      }
    }
  } else {
    const expectedSecret = process.env.KOBO_WEBHOOK_SECRET
    if (expectedSecret && expectedSecret.length >= 32 && presented && safeCompare(presented.secret, expectedSecret)) {
      legacyAuth = true
    }
  }

  if (!integration && !legacyAuth) {
    failureThrottle.recordFailure(ip)
    log.warn('Webhook authentication failed', { ip })
    return json({ error: 'Unauthorized' }, 403)
  }

  // -------------------------------------------------------
  // 4. JSON parsing + Zod validation
  // -------------------------------------------------------
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const parsed = koboWebhookPayloadSchema.safeParse(body)
  if (!parsed.success) {
    const issues = parsed.error.flatten().fieldErrors
    log.error('Webhook payload validation failed', { errors: issues })
    // 422 (pas 200) : l'échec reste visible dans les journaux de KoboToolbox et dans kobo_sync_logs ;
    // Kobo ne réessaie pas un 4xx, donc pas de boucle.
    if (integration?.cooperative_id) {
      await supabase.from('kobo_sync_logs').insert({
        cooperative_id: integration.cooperative_id,
        integration_id: integration.id,
        sync_type: 'webhook' as const,
        status: 'failed' as const,
        submissions_received: 1,
        submissions_errors: 1,
        error_details: { error: 'Payload invalide', issues } as unknown as Record<string, unknown>,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
    }
    return json({ received: false, status: 'error', message: 'Invalid payload' }, 422)
  }

  const payload = parsed.data

  // -------------------------------------------------------
  // 5. Tenant : celui de l'intégration authentifiée (jamais lu dans le corps)
  // -------------------------------------------------------
  if (legacyAuth) {
    const legacy = await resolveLegacyIntegration(supabase, payload._xform_id_string)
    if ('response' in legacy) return legacy.response
    integration = legacy.integration
  }
  if (!integration) return json({ error: 'Unauthorized' }, 403)

  const cfg = readKoboConfig(integration.config)
  const cooperativeId = integration.cooperative_id
  if (!cooperativeId) {
    log.warn('Integration missing cooperative_id', { integrationId: integration.id })
    return json({ received: true, status: 'error', message: 'Integration not linked to a cooperative' })
  }

  // Le secret de la coopérative A ne vaut que pour SON formulaire : jamais pour celui d'une autre.
  if (cfg.formId !== payload._xform_id_string) {
    log.warn('Webhook form does not belong to the authenticated integration', { integrationId: integration.id })
    return json({ error: 'Formulaire non attribué à cette intégration' }, 403)
  }

  // -------------------------------------------------------
  // 6. Interrupteur « webhook actif » + limite de débit par intégration
  // -------------------------------------------------------
  if (integration.status === 'disconnected' || !cfg.webhookEnabled) {
    // 200 : l'admin a coupé le webhook volontairement, Kobo ne doit pas réessayer en boucle.
    log.info('Webhook disabled for integration', { integrationId: integration.id })
    return json({ received: false, status: 'disabled', message: 'Webhook désactivé pour cette intégration' })
  }

  const rate = await checkKoboRateLimit({
    bucket: 'webhook',
    key: integration.id,
    limit: WEBHOOK_LIMIT_PER_MINUTE,
    windowSec: 60,
  })
  if (!rate.ok) {
    // 503 + Retry-After : Kobo réessaie (le 429 n'est pas dans ses codes réessayés).
    return json({ error: 'Trop de requêtes, réessayez plus tard' }, 503, { 'Retry-After': String(rate.retryAfterSec) })
  }

  // -------------------------------------------------------
  // 7. Déduplication (identité stable, par coopérative) + insertion
  // -------------------------------------------------------
  // Le champ clé configuré (carte OU téléphone) vient de kobo_field_mappings, comme pour le pull :
  // un seul module d'extraction (lib/kobo/identity.ts). L'ancienne lecture de
  // `config.field_mapping.member_id` ne correspondait à aucune écriture.
  let mappings: Awaited<ReturnType<typeof loadFieldMappings>> = []
  try {
    mappings = await loadFieldMappings(supabase, cooperativeId, cfg.formId)
  } catch {
    // Indice d'affichage seulement : le répartiteur relit les correspondances et lève s'il échoue.
    log.warn('Field mappings unavailable at ingestion', { integrationId: integration.id })
  }
  const memberKey = extractMemberKey(payload, mappings)

  const registered = await registerSubmission(supabase, {
    cooperativeId,
    formId: cfg.formId,
    payload: payload as unknown as Record<string, unknown>,
    submittedAt: payload._submission_time,
    memberCardNumber: memberKey.card,
  })

  if (registered.kind === 'duplicate' || registered.kind === 'busy') {
    return json({
      received: true,
      submission_id: registered.id,
      status: 'duplicate',
      message: 'Already processed',
    })
  }
  if (registered.kind === 'error') {
    log.error('Failed to insert kobo submission', {
      error: registered.message,
      cooperativeId,
      instanceId: payload._uuid,
    })
    // 503 : Kobo réessaie (502/503/504 + erreurs réseau, jusqu'à 3 fois) — un 200 perdait la soumission.
    return json({ error: 'Storage error' }, 503, { 'Retry-After': '60' })
  }
  const submission = { id: registered.id }

  // Log sync event — identifié par SA clé primaire (et non « le dernier journal ouvert »).
  const { data: logRow } = await supabase
    .from('kobo_sync_logs')
    .insert({
      cooperative_id: cooperativeId,
      integration_id: integration.id,
      sync_type: 'webhook' as const,
      status: 'started' as const,
      submissions_received: 1,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const syncLogId = (logRow?.id as string | undefined) ?? null

  // BUG-03: hand the async processing to the Vercel runtime via waitUntil().
  // Unlike fire-and-forget, this keeps the function instance alive until the
  // promise settles, so the submission can never be stranded in 'pending' when
  // the instance is recycled. The webhook still returns 200 immediately.
  waitUntil(
    processSubmissionAsync(supabase, submission.id, cooperativeId, cfg, syncLogId).catch((err: unknown) => {
      log.error('Async processing failed', {
        submissionId: submission.id,
        cooperativeId,
        error: err instanceof Error ? err.name : 'Unknown error',
      })
    }),
  )

  // -------------------------------------------------------
  // 9. Response — 200 once the submission is stored
  // -------------------------------------------------------
  return json({
    received: true,
    submission_id: submission.id,
    status: 'pending',
    message:
      registered.kind === 'edited'
        ? 'Modified submission received and queued for reprocessing'
        : 'Submission received and queued for processing',
  })
}

// =========================================================
// Method guard — reject non-POST
// =========================================================
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

// =========================================================
// Async processing (waitUntil)
// =========================================================
async function processSubmissionAsync(
  supabase: AdminClient,
  submissionId: string,
  cooperativeId: string,
  cfg: ReturnType<typeof readKoboConfig>,
  syncLogId: string | null,
): Promise<void> {
  // Mise à jour du journal par sa clé primaire ; sans id (insert du journal échoué), rien à mettre à jour.
  const updateLog = async (patch: Record<string, unknown>) => {
    if (!syncLogId) return
    await supabase.from('kobo_sync_logs').update(patch).eq('id', syncLogId)
  }

  let apiKey: string | null = null
  try {
    const { data: submission } = await supabase
      .from('kobo_submissions')
      .select('id, raw_payload, member_card_number, cooperative_id')
      .eq('id', submissionId)
      .single()

    if (!submission) throw new Error('Submission not found')

    // config.api_key is stored encrypted (AES-256-GCM); une valeur en clair héritée n'est plus acceptée :
    // sans token exploitable, la soumission est traitée mais sans téléchargement de photo/signature.
    const stored = readStoredToken(cfg.apiKey)
    if (stored.ok) {
      apiKey = stored.token
    } else if (stored.reason !== 'missing') {
      log.error('Stored Kobo API key unusable', { submissionId, reason: stored.reason })
    }

    // Répartiteur COMMUN (webhook, pull, relance) : par type de formulaire, résultat lu, erreurs levées.
    const outcome = await dispatchSubmission({
      submissionId,
      cooperativeId,
      payload: submission.raw_payload as Record<string, unknown>,
      formType: cfg.formType,
      memberCardNumber: submission.member_card_number,
      apiToken: apiKey,
      serverUrl: cfg.serverUrl,
    })

    // Journal : compteurs issus du VRAI résultat (et non « matched: 1 » en dur).
    await updateLog({
      status: 'success' as const,
      // 'skipped' : la ligne est prise en charge ailleurs (verrou) — rien n'a été traité ici.
      submissions_processed: outcome.status === 'skipped' ? 0 : 1,
      submissions_matched: outcome.status === 'matched' ? 1 : 0,
      completed_at: new Date().toISOString(),
    })
  } catch (err: unknown) {
    const message = scrubSecrets(err instanceof Error ? err.message : 'Processing error', [apiKey])

    // Mark submission as error
    await supabase
      .from('kobo_submissions')
      .update({
        status: 'error' as const,
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId)

    await updateLog({
      status: 'failed' as const,
      submissions_errors: 1,
      error_details: { error: message } as unknown as Record<string, unknown>,
      completed_at: new Date().toISOString(),
    })

    throw err
  }
}
