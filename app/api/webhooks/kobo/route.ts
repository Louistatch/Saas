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
import { waitUntil } from '@vercel/functions'
import { timingSafeEqual, createHmac } from 'node:crypto'
import { createClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import {
  koboWebhookPayloadSchema,
  cooperativeNameSchema,
  escapeIlike,
} from '@/lib/validators/kobo'
import { cardPrefix, generateUniqueCardNumber } from '@/lib/utils/card-number'
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
  // 3. Rate limiting — dedicated 'webhook' bucket (100 req/min/IP) — BUG-01
  // Single source of truth: Upstash. No redundant in-memory limiter.
  // -------------------------------------------------------
  const rateLimitBlock = await applyRateLimit(request, 'webhook')
  if (rateLimitBlock) return rateLimitBlock as NextResponse<{ error: string }>

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
    log.warn('Webhook authentication failed', {
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
    })
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

  // BUG-03: hand the async processing to the Vercel runtime via waitUntil().
  // Unlike fire-and-forget, this keeps the function instance alive until the
  // promise settles, so the submission can never be stranded in 'pending' when
  // the instance is recycled. The webhook still returns 200 immediately.
  waitUntil(
    processSubmissionAsync(supabase, submission.id, cooperativeId).catch(
      (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error'
        log.error('Async processing failed', {
          submissionId: submission.id,
          cooperativeId,
          error: message,
        })
      },
    ),
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
    // Get the submission payload
    const { data: submission } = await supabase
      .from('kobo_submissions')
      .select('id, raw_payload, member_card_number, cooperative_id')
      .eq('id', submissionId)
      .single()

    if (!submission) throw new Error('Submission not found')

    const payload = submission.raw_payload as Record<string, unknown>

    // ── Route by form type (from integration config) ───────────
    const { data: integ } = await supabase
      .from('integrations')
      .select('config')
      .eq('cooperative_id', cooperativeId)
      .eq('type', 'kobo')
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle()

    const formType = (integ?.config as Record<string, unknown>)?.form_type as string | undefined

    switch (formType) {
      case 'market_price':
        await processMarketPriceSubmission(supabase, submissionId, payload)
        break
      case 'harvest':
        await processHarvestSubmission(supabase, submissionId, cooperativeId, payload)
        break
      case 'plot_survey':
        await processPlotSurveySubmission(supabase, submissionId, cooperativeId, payload)
        break
      default:
        // Default: member enrollment/update (existing behavior)
        if (submission.member_card_number) {
          await supabase.rpc('match_kobo_submission_to_member', {
            p_submission_id: submissionId,
          })
        } else {
          await enrollNewMemberFromSubmission(supabase, submissionId, cooperativeId, payload)
        }
    }

    // Update sync log as success
    await supabase
      .from('kobo_sync_logs')
      .update({
        status: 'success' as const,
        submissions_processed: 1,
        submissions_matched: 1,
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

    throw err
  }
}

// =========================================================
// Enrollment: Create new member from Kobo submission
// =========================================================
async function enrollNewMemberFromSubmission(
  supabase: ReturnType<typeof createClient>,
  submissionId: string,
  faitiereId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Extract fields from payload (KoboCollect uses "group/field" format)
  const nomComplet = getPayloadField(payload, 'S1/nom_complet') ?? ''
  const telephone = getPayloadField(payload, 'S1/telephone') ?? ''
  const email = getPayloadField(payload, 'S1/email') ?? null
  const region = getPayloadField(payload, 'S3/region') ?? null
  const prefecture = getPayloadField(payload, 'S3/prefecture') ?? null
  const canton = getPayloadField(payload, 'S3/canton') ?? null
  const village = getPayloadField(payload, 'S3/village') ?? null
  const nomCooperative = getPayloadField(payload, 'S2/nom_cooperative') ?? ''

  // Split nom_complet into first_name + last_name
  const nameParts = nomComplet.trim().split(/\s+/)
  const firstName = nameParts[0] ?? ''
  const lastName = nameParts.slice(1).join(' ') || firstName

  // Resolve cooperative by name — SEC-03.
  // Validate with Zod, escape ILIKE wildcards, and RESTRICT the search to the
  // faitière's own hierarchy so a malicious payload cannot attach a member to
  // an arbitrary cooperative elsewhere in the system.
  let targetCooperativeId = faitiereId
  if (nomCooperative) {
    const parsedName = cooperativeNameSchema.safeParse(nomCooperative)
    if (parsedName.success) {
      const safeName = escapeIlike(parsedName.data)

      // Accessible hierarchy from the faitière root (self + descendants).
      const { data: accessible } = await supabase.rpc(
        'get_cooperative_descendants',
        { p_root_id: faitiereId },
      )
      const allowedIds: string[] = Array.isArray(accessible)
        ? (accessible as { id: string }[]).map((r) => r.id)
        : [faitiereId]

      const { data: coop } = await supabase
        .from('cooperatives')
        .select('id')
        .ilike('name', `%${safeName}%`)
        .in('id', allowedIds)
        .limit(1)
        .maybeSingle()

      if (coop) {
        targetCooperativeId = coop.id
      } else {
        // ── AUTO-CREATE cooperative with proper hierarchy ──────
        const { data: faitiereData } = await supabase
          .from('cooperatives').select('faitiere_name')
          .eq('id', faitiereId).maybeSingle()

        // Find regional union to set as parent
        let parentUnionId: string | null = faitiereId
        if (region) {
          const { data: unions } = await supabase
            .from('cooperatives').select('id, name')
            .eq('level', 'union')
            .eq('faitiere_name', faitiereData?.faitiere_name ?? 'FENOMAT')
          if (unions) {
            const match = unions.find(u => u.name.toLowerCase().includes(region.toLowerCase()))
            if (match) parentUnionId = match.id
          }
        }

        const { data: newCoop } = await supabase
          .from('cooperatives')
          .insert({
            name: parsedName.data,
            level: 'cooperative',
            parent_id: parentUnionId,
            faitiere_name: faitiereData?.faitiere_name ?? 'FENOMAT',
          })
          .select('id').single()

        if (newCoop) {
          targetCooperativeId = newCoop.id
          log.info('New cooperative auto-created', { name: parsedName.data, parentId: parentUnionId })
        }
      }
    } else {
      log.warn('Invalid cooperative name in payload — defaulting to faitiere', {
        faitiereId,
      })
    }
  }

  // ── Resolve geographic IDs from text names ──────────────────
  let regionId: string | null = null
  let prefectureId: string | null = null
  let cantonId: string | null = null
  const dateNaissance = getPayloadField(payload, 'S1/date_naissance') ?? getPayloadField(payload, 'date_naissance') ?? null

  if (region) {
    const { data: rRow } = await supabase.from('regions').select('id').ilike('name', `%${region}%`).limit(1).maybeSingle()
    if (rRow) regionId = rRow.id
  }
  if (prefecture && regionId) {
    const { data: pRow } = await supabase.from('prefectures').select('id').ilike('name', `%${prefecture}%`).eq('region_id', regionId).limit(1).maybeSingle()
    if (pRow) prefectureId = pRow.id
  }
  if (canton && prefectureId) {
    const { data: cRow } = await supabase.from('cantons').select('id').ilike('name', `%${canton}%`).eq('prefecture_id', prefectureId).limit(1).maybeSingle()
    if (cRow) cantonId = cRow.id
  }

  // ── Download photo from KoboToolbox attachments → Supabase Storage ──
  let photoUrl: string | null = null
  const photoField = getPayloadField(payload, 'S1/photo_membre')
  const attachments = (payload._attachments ?? []) as Array<Record<string, string>>
  const faitiereCode = getPayloadField(payload, 'S2/code_faitiere') ?? null

  if (photoField && attachments.length > 0) {
    // Find the attachment matching the photo filename
    const photoAtt = attachments.find(a => a.filename?.includes(photoField))
    if (photoAtt?.download_url) {
      try {
        // Get KoboToolbox API key from integration config
        const { data: integ } = await supabase
          .from('integrations')
          .select('config')
          .eq('cooperative_id', faitiereId)
          .eq('type', 'kobo')
          .limit(1)
          .maybeSingle()
        const apiKey = (integ?.config as Record<string, string>)?.api_key
        if (apiKey) {
          const photoResp = await fetch(photoAtt.download_url, {
            headers: { 'Authorization': `Token ${apiKey}` },
          })
          if (photoResp.ok) {
            const photoBuffer = Buffer.from(await photoResp.arrayBuffer())
            const ext = photoField.split('.').pop() ?? 'jpg'
            const storagePath = `member-photos/${Date.now()}_${photoField}`
            const { error: uploadErr } = await supabase.storage
              .from('member-photos')
              .upload(storagePath, photoBuffer, { contentType: `image/${ext}`, upsert: true })
            if (!uploadErr) {
              const { data: urlData } = supabase.storage.from('member-photos').getPublicUrl(storagePath)
              photoUrl = urlData?.publicUrl ?? null
              log.info('Photo uploaded to Supabase Storage', { storagePath })
            } else {
              log.warn('Photo upload failed', { error: uploadErr.message })
            }
          }
        }
      } catch (photoErr) {
        log.warn('Photo download/upload failed', { error: String(photoErr) })
      }
    }
  }

  // Create the member (with photo, faitiere, full location)
  const { data: newMember, error: memberError } = await supabase
    .from('members')
    .insert({
      cooperative_id: targetCooperativeId,
      first_name: firstName,
      last_name: lastName,
      phone: telephone.trim() || null,
      email: email,
      region: region,
      prefecture: prefecture,
      canton: canton,
      village: village,
      photo_url: photoUrl,
      faitiere: faitiereCode,
      region_id: regionId,
      prefecture_id: prefectureId,
      canton_id: cantonId,
      date_of_birth: dateNaissance,
      status: 'active',
    })
    .select('id')
    .single()

  if (memberError || !newMember) {
    throw new Error(`Failed to create member: ${memberError?.message ?? 'Unknown'}`)
  }

  // Generate card number — SEC-02: crypto-secure + uniqueness retry loop.
  const { data: coopData } = await supabase
    .from('cooperatives')
    .select('name, faitiere_name')
    .eq('id', targetCooperativeId)
    .single()

  const prefix = cardPrefix(coopData?.faitiere_name ?? coopData?.name ?? 'FEN')
  const cardNumber = await generateUniqueCardNumber(supabase, prefix)

  // Create member card
  const expiryDate = new Date()
  expiryDate.setFullYear(expiryDate.getFullYear() + 1)

  await supabase.from('member_cards').insert({
    cooperative_id: targetCooperativeId,
    member_id: newMember.id,
    card_number: cardNumber,
    status: 'active',
    expiry_date: expiryDate.toISOString().split('T')[0],
    qr_data: `https://www.faitierehub.com/verify/${cardNumber}`,
  })

  // ── Insert parcelles from S5 repeat group ──
  const parcelles = (payload.S5 ?? []) as Array<Record<string, unknown>>
  for (const p of parcelles) {
    const culture = String(p['S5/culture_principale'] ?? p['culture_principale'] ?? '')
    const surface = parseFloat(String(p['S5/superficie_ha'] ?? p['superficie_ha'] ?? '0'))
    const typeSol = String(p['S5/type_sol'] ?? p['type_sol'] ?? '')
    const irrigation = String(p['S5/irrigation'] ?? p['irrigation'] ?? '')
    if (culture && surface > 0) {
      try {
        await supabase.from('parcelles').insert({
          member_id: newMember.id,
          cooperative_id: targetCooperativeId,
          culture_name: culture,
          surface_ha: surface,
          soil_type: typeSol || null,
          irrigation_type: irrigation || null,
          source: 'kobo',
        })
        log.info('Parcelle inserted', { culture, surface })
      } catch (e: unknown) { log.warn('Parcelle insert failed', { error: String(e) }) }
    }
  }

  // ── Insert productions from S6 repeat group ──
  const productions = (payload.S6 ?? []) as Array<Record<string, unknown>>
  for (const p of productions) {
    const culture = String(p['S6/culture_produite'] ?? p['culture_produite'] ?? '')
    const quantity = parseFloat(String(p['S6/rendement_kg'] ?? p['rendement_kg'] ?? '0'))
    const campagne = String(p['S6/campagne_annee'] ?? p['campagne_annee'] ?? '')
    if (culture && quantity > 0) {
      try {
        await supabase.from('productions').insert({
          member_id: newMember.id,
          cooperative_id: targetCooperativeId,
          culture_name: culture,
          quantity_kg: quantity,
          campaign_year: campagne || new Date().getFullYear().toString(),
          source: 'kobo',
        })
        log.info('Production inserted', { culture, quantity })
      } catch (e: unknown) { log.warn('Production insert failed', { error: String(e) }) }
    }
  }

  // Update submission as matched
  await supabase
    .from('kobo_submissions')
    .update({
      status: 'matched' as const,
      member_id: newMember.id,
      member_card_number: cardNumber,
      matched_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      processed_payload: {
        mode: 'enrollment',
        member_id: newMember.id,
        card_number: cardNumber,
        cooperative_id: targetCooperativeId,
        cooperative_name: coopData?.name ?? nomCooperative,
      } as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  log.info('New member enrolled via KoboCollect', {
    memberId: newMember.id,
    cardNumber,
    cooperativeId: targetCooperativeId,
    submissionId,
  })
}

// =========================================================
// Helper: Get field from Kobo payload (supports nested paths)
// =========================================================
function getPayloadField(payload: Record<string, unknown>, path: string): string | null {
  // Try direct key
  if (path in payload && typeof payload[path] === 'string') {
    return (payload[path] as string).trim()
  }
  // Try nested (KoboCollect "group/field" format stored as flat keys)
  for (const [key, value] of Object.entries(payload)) {
    if (key === path && typeof value === 'string') return value.trim()
    if (key.endsWith(`/${path.split('/').pop()}`) && typeof value === 'string') return value.trim()
  }
  return null
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


// =========================================================
// Market Price: Insert price records from field survey
// =========================================================
// KoboCollect form fields expected:
//   S1/date_releve     — date of the survey
//   S1/marche          — market name (select_one: Lome, Kpalime, Atakpame, Sokode, Kara)
//   S1/agent           — name of the agent who collected
//   S2/produits        — repeat group with:
//     S2/produits/nom_produit  — product name (select_one from cultures list)
//     S2/produits/prix_kg      — price per kg in FCFA
//     S2/produits/unite        — unit (kg, tas, sac)
//     S2/produits/observation  — optional note
async function processMarketPriceSubmission(
  supabase: ReturnType<typeof createClient>,
  submissionId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const log = createLogger('kobo-market-price')

  const dateReleve = getPayloadField(payload, 'S1/date_releve') ?? new Date().toISOString().slice(0, 10)
  const marche = getPayloadField(payload, 'S1/marche') ?? 'Lomé'

  // Extract repeat group (products)
  const produits = (payload['S2/produits'] ?? payload['produits'] ?? []) as Array<Record<string, unknown>>

  if (!Array.isArray(produits) || produits.length === 0) {
    log.warn('No products in market price submission', { submissionId })
    await supabase.from('kobo_submissions').update({
      status: 'processed' as const, updated_at: new Date().toISOString(),
    }).eq('id', submissionId)
    return
  }

  // Resolve culture IDs
  const { data: cultures } = await supabase.from('cultures').select('id, name')
  const cultureMap = new Map((cultures ?? []).map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id]))

  let inserted = 0
  for (const p of produits) {
    const nomProduit = String(p['S2/produits/nom_produit'] ?? p['nom_produit'] ?? '').trim()
    const prixKg = Number(p['S2/produits/prix_kg'] ?? p['prix_kg'] ?? 0)

    if (!nomProduit || prixKg <= 0) continue

    // Find or fuzzy-match culture
    let cultureId = cultureMap.get(nomProduit.toLowerCase())
    if (!cultureId) {
      for (const [name, id] of cultureMap) {
        if (name.includes(nomProduit.toLowerCase()) || nomProduit.toLowerCase().includes(name)) {
          cultureId = id
          break
        }
      }
    }

    if (!cultureId) {
      log.warn('Unknown product, skipping', { nomProduit, submissionId })
      continue
    }

    await supabase.from('market_prices').insert({
      culture_id: cultureId,
      market_name: marche,
      price: prixKg,
      source: 'kobo',
      created_at: dateReleve,
    })
    inserted++
  }

  log.info('Market prices inserted', { submissionId, count: inserted, market: marche })

  await supabase.from('kobo_submissions').update({
    status: 'processed' as const,
    updated_at: new Date().toISOString(),
  }).eq('id', submissionId)
}


// =========================================================
// Harvest: Insert production records
// =========================================================
// KoboCollect form fields expected:
//   S1/carte_membre     — member card number
//   S1/campagne         — campaign year (e.g. "2026A")
//   S2/recoltes         — repeat group with:
//     S2/recoltes/culture    — crop name
//     S2/recoltes/quantite_kg — quantity harvested in kg
//     S2/recoltes/parcelle   — optional parcelle reference
async function processHarvestSubmission(
  supabase: ReturnType<typeof createClient>,
  submissionId: string,
  cooperativeId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const log = createLogger('kobo-harvest')

  const cardNumber = getPayloadField(payload, 'S1/carte_membre') ?? ''
  const campagne = getPayloadField(payload, 'S1/campagne') ?? new Date().getFullYear().toString()

  // Resolve member
  const { data: card } = await supabase
    .from('member_cards')
    .select('member_id')
    .eq('card_number', cardNumber)
    .maybeSingle()

  if (!card) {
    log.warn('Card not found for harvest', { cardNumber, submissionId })
    return
  }

  const recoltes = (payload['S2/recoltes'] ?? payload['recoltes'] ?? []) as Array<Record<string, unknown>>

  for (const r of recoltes) {
    const culture = String(r['S2/recoltes/culture'] ?? r['culture'] ?? '')
    const quantite = Number(r['S2/recoltes/quantite_kg'] ?? r['quantite_kg'] ?? 0)

    if (!culture || quantite <= 0) continue

    await supabase.from('productions').insert({
      member_id: card.member_id,
      culture_name: culture,
      quantity_kg: quantite,
      campaign_year: campagne,
      cooperative_id: cooperativeId,
      source: 'kobo',
    })
  }

  log.info('Harvest recorded', { submissionId, cardNumber, count: recoltes.length })

  await supabase.from('kobo_submissions').update({
    status: 'processed' as const, updated_at: new Date().toISOString(),
  }).eq('id', submissionId)
}


// =========================================================
// Plot Survey: Insert/update parcelle records
// =========================================================
// KoboCollect form fields expected:
//   S1/carte_membre     — member card number
//   S1/campagne         — campaign
//   S2/parcelles        — repeat group with:
//     S2/parcelles/culture       — crop planted
//     S2/parcelles/surface_ha    — surface in hectares
//     S2/parcelles/gps           — GPS coordinates (lat, lon)
//     S2/parcelles/photo         — photo of the plot
async function processPlotSurveySubmission(
  supabase: ReturnType<typeof createClient>,
  submissionId: string,
  cooperativeId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const log = createLogger('kobo-plot')

  const cardNumber = getPayloadField(payload, 'S1/carte_membre') ?? ''
  const campagne = getPayloadField(payload, 'S1/campagne') ?? new Date().getFullYear().toString()

  const { data: card } = await supabase
    .from('member_cards')
    .select('member_id')
    .eq('card_number', cardNumber)
    .maybeSingle()

  if (!card) {
    log.warn('Card not found for plot survey', { cardNumber, submissionId })
    return
  }

  const parcelles = (payload['S2/parcelles'] ?? payload['parcelles'] ?? []) as Array<Record<string, unknown>>

  for (const p of parcelles) {
    const culture = String(p['S2/parcelles/culture'] ?? p['culture'] ?? '')
    const surface = Number(p['S2/parcelles/surface_ha'] ?? p['surface_ha'] ?? 0)
    const gps = String(p['S2/parcelles/gps'] ?? p['gps'] ?? '')

    if (!culture || surface <= 0) continue

    await supabase.from('parcelles').insert({
      member_id: card.member_id,
      culture_name: culture,
      surface_ha: surface,
      gps_coordinates: gps || null,
      campaign_year: campagne,
      cooperative_id: cooperativeId,
      source: 'kobo',
    })
  }

  log.info('Plots recorded', { submissionId, cardNumber, count: parcelles.length })

  await supabase.from('kobo_submissions').update({
    status: 'processed' as const, updated_at: new Date().toISOString(),
  }).eq('id', submissionId)
}
