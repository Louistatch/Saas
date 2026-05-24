/**
 * POST /api/webhooks/kobo
 *
 * KoboToolbox webhook endpoint — receives field submissions in real-time.
 *
 * Pipeline (strict order):
 *  1. Method guard (POST only)
 *  2. Content-Type + Size validation
 *  3. Rate limiting (100 req/min/IP)
 *  4. Authentication (HMAC-SHA256 signature OR Bearer secret, timing-safe)
 *  5. JSON parsing + Zod validation
 *  6. Tenant resolution (_xform_id_string → cooperative_id)
 *  7. Deduplication (_uuid check)
 *  8. Insert + async processing (match + process)
 *  9. Response (always 200 if auth OK — Kobo retries on non-200)
 *
 * @security KOBO_WEBHOOK_SECRET required, timing-safe comparison
 * @security Rate limited: 100 req/min/IP via Upstash (fallback in-memory)
 * @security Payload capped at 2MB
 * @security No stack traces exposed to client
 *
 * @test Happy path: valid signature + valid payload → 200 + submission_id
 * @test Auth failure: missing/invalid signature → 403
 * @test Validation failure: malformed payload → 200 + {valid: false}
 */
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual, createHmac } from 'node:crypto'
import { createClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { rateLimit, clientKeyFromHeaders } from '@/lib/utils/rate-limit'
import { koboWebhookPayloadSchema } from '@/lib/validators/kobo'
import type { KoboWebhookResponse } from '@/lib/kobo/types'

const log = createLogger('webhook:kobo')

// =========================================================
// Timing-safe string comparison
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

// =========================================================
// HMAC-SHA256 signature verification
// =========================================================
function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  return safeCompare(signature, expected)
}

// =========================================================
// POST handler
// =========================================================
export async function POST(request: NextRequest): Promise<NextResponse<KoboWebhookResponse | { error: string }>> {
  // -------------------------------------------------------
  // 1. Content-Type validation
  // -------------------------------------------------------
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type invalide' },
      { status: 415 },
    )
  }

  // -------------------------------------------------------
  // 2. Size check — payload ≤ 2MB
  // -------------------------------------------------------
  const contentLength = parseInt(
    request.headers.get('content-length') ?? '0',
    10,
  )
  if (isNaN(contentLength) || contentLength > 2_097_152) {
    return NextResponse.json(
      { error: 'Payload trop volumineux (max 2MB)' },
      { status: 413 },
    )
  }

  // -------------------------------------------------------
  // 3. Rate limiting — 100 req/min/IP
  // -------------------------------------------------------
  // Try persistent (Upstash) first, fallback to in-memory
  const persistentBlock = await applyRateLimit(request, 'verify')
  if (persistentBlock) return persistentBlock as NextResponse<{ error: string }>

  // In-memory fallback (if Upstash not configured)
  const ip = clientKeyFromHeaders(request.headers)
  const rl = rateLimit(`webhook:kobo:${ip}`, 100, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Trop de requêtes' },
      { status: 429 },
    )
  }

  // -------------------------------------------------------
  // 4. Authentication — timing-safe secret verification
  // -------------------------------------------------------
  const expectedSecret = process.env.KOBO_WEBHOOK_SECRET
  if (!expectedSecret || expectedSecret.length < 32) {
    log.error('KOBO_WEBHOOK_SECRET is not configured or too short — rejecting all requests')
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 503 },
    )
  }

  // Read raw body for HMAC verification
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Cannot read body' }, { status: 400 })
  }

  // Check multiple auth methods (in priority order):
  // 1. X-KoboToolbox-Signature (HMAC-SHA256)
  // 2. X-Kobo-Secret (direct secret comparison)
  // 3. Authorization: Bearer <secret>
  const hmacSignature = request.headers.get('x-kobotoolbox-signature')
  const directSecret = request.headers.get('x-kobo-secret')
  const authHeader = request.headers.get('authorization')

  let authenticated = false

  if (hmacSignature) {
    authenticated = verifyHmacSignature(rawBody, hmacSignature, expectedSecret)
  } else if (directSecret) {
    authenticated = safeCompare(directSecret, expectedSecret)
  } else if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    authenticated = safeCompare(token, expectedSecret)
  }

  if (!authenticated) {
    log.warn('Webhook authentication failed', { ip })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // -------------------------------------------------------
  // 5. JSON parsing + Zod validation
  // -------------------------------------------------------
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = koboWebhookPayloadSchema.safeParse(body)
  if (!parsed.success) {
    log.error('Webhook payload validation failed', {
      errors: parsed.error.flatten().fieldErrors,
    })
    // Return 200 to Kobo (otherwise it retries indefinitely)
    return NextResponse.json({ received: true, status: 'error', message: 'Invalid payload' })
  }

  const payload = parsed.data

  // -------------------------------------------------------
  // 6. Tenant resolution — _xform_id_string → cooperative_id
  // -------------------------------------------------------
  const supabase = createClient()

  const { data: integration } = await supabase
    .from('integrations')
    .select('id, cooperative_id, config')
    .eq('type', 'kobo')
    .eq('status', 'connected')
    .filter('config->>form_id', 'eq', payload._xform_id_string)
    .limit(1)
    .maybeSingle()

  if (!integration) {
    log.warn('No integration found for form', {
      formId: payload._xform_id_string,
    })
    // Return 200 — don't make Kobo retry for a config issue
    return NextResponse.json({
      received: true,
      status: 'error',
      message: 'No integration configured for this form',
    })
  }

  const cooperativeId = integration.cooperative_id as string

  // -------------------------------------------------------
  // 7. Deduplication — check kobo_instance_id
  // -------------------------------------------------------
  const { data: existing } = await supabase
    .from('kobo_submissions')
    .select('id, status')
    .eq('kobo_instance_id', payload._uuid)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      received: true,
      submission_id: existing.id,
      status: 'duplicate',
      message: 'Already processed',
    })
  }

  // -------------------------------------------------------
  // 8. Insert + async processing
  // -------------------------------------------------------

  // Extract card number from payload (configurable via field mappings)
  const config = integration.config as Record<string, unknown> | null
  const fieldMapping = (config?.field_mapping as Record<string, string>) ?? {}
  const cardNumberField = fieldMapping.member_id ?? 'member_card_number'
  const memberCardNumber = extractCardNumber(payload, cardNumberField)

  // Insert submission
  const { data: submission, error: insertError } = await supabase
    .from('kobo_submissions')
    .insert({
      cooperative_id: cooperativeId,
      kobo_instance_id: payload._uuid,
      kobo_form_id: payload._xform_id_string,
      raw_payload: payload as unknown as Record<string, unknown>,
      member_card_number: memberCardNumber,
      status: 'pending' as const,
      submitted_at: payload._submission_time,
    })
    .select('id')
    .single()

  if (insertError || !submission) {
    log.error('Failed to insert kobo submission', {
      error: insertError?.message,
      cooperativeId,
      instanceId: payload._uuid,
    })
    // Still return 200 — don't make Kobo retry
    return NextResponse.json({
      received: true,
      status: 'error',
      message: 'Storage error',
    })
  }

  // Log sync event
  await supabase.from('kobo_sync_logs').insert({
    cooperative_id: cooperativeId,
    integration_id: integration.id,
    sync_type: 'webhook' as const,
    status: 'started' as const,
    submissions_received: 1,
    started_at: new Date().toISOString(),
  })

  // Fire-and-forget: match + process (wrapped in try/catch)
  processSubmissionAsync(supabase, submission.id, cooperativeId).catch(
    (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Async processing failed', {
        submissionId: submission.id,
        cooperativeId,
        error: message,
      })
    },
  )

  // -------------------------------------------------------
  // 9. Response — always 200 if auth passed
  // -------------------------------------------------------
  return NextResponse.json({
    received: true,
    submission_id: submission.id,
    status: 'pending',
    message: 'Submission received and queued for processing',
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
// Async processing (fire-and-forget)
// =========================================================
async function processSubmissionAsync(
  supabase: ReturnType<typeof createClient>,
  submissionId: string,
  cooperativeId: string,
): Promise<void> {
  try {
    // Step 1: Match to member
    await supabase.rpc('match_kobo_submission_to_member', {
      p_submission_id: submissionId,
    })

    // Step 2: Check if matched
    const { data: updated } = await supabase
      .from('kobo_submissions')
      .select('status, member_id')
      .eq('id', submissionId)
      .single()

    if (updated?.status === 'matched' && updated.member_id) {
      // Step 3: Process (extract parcelles/productions)
      await supabase.rpc('process_kobo_submission', {
        p_submission_id: submissionId,
      })
    }

    // Update sync log
    const matchStatus = updated?.status === 'matched' ? 1 : 0
    await supabase
      .from('kobo_sync_logs')
      .update({
        status: 'success' as const,
        submissions_processed: 1,
        submissions_matched: matchStatus,
        completed_at: new Date().toISOString(),
      })
      .eq('cooperative_id', cooperativeId)
      .eq('sync_type', 'webhook')
      .is('completed_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Processing error'

    // Mark submission as error
    await supabase
      .from('kobo_submissions')
      .update({
        status: 'error' as const,
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId)

    // Update sync log
    await supabase
      .from('kobo_sync_logs')
      .update({
        status: 'failed' as const,
        submissions_errors: 1,
        error_details: { error: message } as unknown as Record<string, unknown>,
        completed_at: new Date().toISOString(),
      })
      .eq('cooperative_id', cooperativeId)
      .eq('sync_type', 'webhook')
      .is('completed_at', null)
      .order('started_at', { ascending: false })
      .limit(1)

    throw err // Re-throw for the .catch() handler to log
  }
}

// =========================================================
// Extract card number from payload
// =========================================================
function extractCardNumber(
  payload: Record<string, unknown>,
  fieldName: string,
): string | null {
  // Try direct field
  if (payload[fieldName] && typeof payload[fieldName] === 'string') {
    return (payload[fieldName] as string).trim().toUpperCase()
  }

  // Try nested (KoboCollect group/field format)
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>
      if (nested[fieldName] && typeof nested[fieldName] === 'string') {
        return (nested[fieldName] as string).trim().toUpperCase()
      }
    }
    // Try "S1/member_card_number" style keys
    if (key.endsWith(`/${fieldName}`) && typeof value === 'string') {
      return value.trim().toUpperCase()
    }
  }

  // Fallback: common field names
  const fallbacks = ['member_card_number', 'card_number', 'numero_carte']
  for (const fb of fallbacks) {
    if (fb === fieldName) continue
    if (payload[fb] && typeof payload[fb] === 'string') {
      return (payload[fb] as string).trim().toUpperCase()
    }
  }

  return null
}
