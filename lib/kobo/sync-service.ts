/**
 * KoboCollect Sync Service
 * 
 * Handles:
 * - Pulling submissions from KoboToolbox API
 * - Retry queue for failed syncs
 * - Conflict resolution (duplicate detection)
 * - Data mapping from Kobo fields to Supabase tables
 * - Audit logging
 */
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { decryptSecret } from '@/lib/utils/crypto'
import { createLogger } from '@/lib/utils/logger'

const log = createLogger('kobo:sync')

const KOBO_API_BASE = 'https://kf.kobotoolbox.org/api/v2'

export interface KoboSubmission {
  _id: number
  _uuid: string
  _submission_time: string
  _attachments?: { download_url: string; filename: string }[]
  [key: string]: unknown
}

export interface SyncResult {
  total: number
  created: number
  updated: number
  skipped: number
  failed: number
  errors: { submission_id: string; error: string }[]
}

export interface FieldMapping {
  first_name?: string
  last_name?: string
  phone?: string
  email?: string
  photo?: string
  region?: string
  prefecture?: string
  canton?: string
  village?: string
  culture?: string
  superficie?: string
  cooperative_name?: string
}

/**
 * Fetch submissions from KoboToolbox API
 */
export async function fetchKoboSubmissions(
  apiKey: string,
  formId: string,
  since?: string,
): Promise<KoboSubmission[]> {
  const url = new URL(`${KOBO_API_BASE}/assets/${formId}/data.json`)
  if (since) {
    url.searchParams.set('query', JSON.stringify({ _submission_time: { $gte: since } }))
  }
  url.searchParams.set('limit', '1000')
  url.searchParams.set('sort', JSON.stringify({ _submission_time: -1 }))

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Token ${apiKey}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`KoboToolbox API error ${response.status}: ${text.slice(0, 200)}`)
  }

  const data = await response.json()
  return data.results ?? data ?? []
}

/**
 * Process a batch of Kobo submissions into the database.
 * Uses the retry queue for resilience.
 */
export async function processKoboSubmissions(
  cooperativeId: string,
  submissions: KoboSubmission[],
  fieldMapping: FieldMapping,
): Promise<SyncResult> {
  const supabase = await createClient()
  const result: SyncResult = { total: submissions.length, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] }

  for (const submission of submissions) {
    const submissionId = String(submission._uuid || submission._id)

    try {
      // Check if already processed
      const { data: existing } = await supabase
        .from('kobo_sync_queue')
        .select('id, status')
        .eq('cooperative_id', cooperativeId)
        .eq('submission_id', submissionId)
        .single()

      if (existing?.status === 'completed') {
        result.skipped++
        continue
      }

      // Flatten nested Kobo data
      const flat = flattenSubmission(submission)

      // Extract fields using mapping
      const firstName = extractField(flat, fieldMapping.first_name ?? 'prenom', 'first_name')
      const lastName = extractField(flat, fieldMapping.last_name ?? 'nom', 'last_name')
      const phone = cleanPhone(extractField(flat, fieldMapping.phone ?? 'telephone', 'phone'))
      const region = extractField(flat, fieldMapping.region ?? 'region', 'region')
      const prefecture = extractField(flat, fieldMapping.prefecture ?? 'prefecture', 'prefecture')
      const canton = extractField(flat, fieldMapping.canton ?? 'canton', 'canton')
      const village = extractField(flat, fieldMapping.village ?? 'village', 'village')
      const culture = extractField(flat, fieldMapping.culture ?? 'culture_principale', 'culture')
      const superficie = parseFloat(extractField(flat, fieldMapping.superficie ?? 'superficie_ha', '') || '0') || null
      const photoUrl = submission._attachments?.[0]?.download_url ?? null

      if (!firstName || !lastName) {
        result.failed++
        result.errors.push({ submission_id: submissionId, error: 'Nom/prénom manquant' })
        await queueFailed(supabase, cooperativeId, submissionId, submission, 'Nom/prénom manquant')
        continue
      }

      // Check for duplicate (same phone in same cooperative)
      let memberId: string | null = null
      if (phone) {
        const { data: dup } = await supabase
          .from('members')
          .select('id')
          .eq('cooperative_id', cooperativeId)
          .eq('phone', phone)
          .single()

        if (dup) {
          // Update existing
          await supabase.from('members').update({
            first_name: firstName,
            last_name: lastName,
            photo_url: photoUrl,
            region, prefecture, canton, village,
          }).eq('id', dup.id)
          memberId = dup.id
          result.updated++
        }
      }

      if (!memberId) {
        // Create new member
        const { data: newMember, error: insertErr } = await supabase
          .from('members')
          .insert({
            cooperative_id: cooperativeId,
            first_name: firstName,
            last_name: lastName,
            phone,
            photo_url: photoUrl,
            region, prefecture, canton, village,
            status: 'active',
          })
          .select('id')
          .single()

        if (insertErr || !newMember) {
          result.failed++
          result.errors.push({ submission_id: submissionId, error: insertErr?.message ?? 'Insert failed' })
          await queueFailed(supabase, cooperativeId, submissionId, submission, insertErr?.message ?? 'Insert failed')
          continue
        }
        memberId = newMember.id
        result.created++
      }

      // Create parcelle if culture data exists
      if (culture && memberId) {
        await supabase.from('parcelles').insert({
          member_id: memberId,
          cooperative_id: cooperativeId,
          name: `Parcelle ${culture}`,
          culture_principale: culture,
          superficie_ha: superficie,
        })
      }

      // Mark as completed in queue
      await supabase.from('kobo_sync_queue').upsert({
        cooperative_id: cooperativeId,
        submission_id: submissionId,
        payload: submission as any,
        status: 'completed',
        processed_at: new Date().toISOString(),
      }, { onConflict: 'cooperative_id,submission_id' })

      // Audit log
      await supabase.from('audit_logs').insert({
        cooperative_id: cooperativeId,
        action: 'member.sync.kobo',
        entity_type: 'member',
        entity_id: memberId,
        metadata: { submission_id: submissionId, source: 'kobo_sync' },
      })

    } catch (err: any) {
      result.failed++
      result.errors.push({ submission_id: submissionId, error: err?.message ?? 'Unknown error' })
      await queueFailed(supabase, cooperativeId, submissionId, submission, err?.message)
    }
  }

  return result
}

/**
 * Retry failed submissions from the queue
 */
export async function retryFailedSubmissions(cooperativeId: string): Promise<SyncResult> {
  const supabase = await createClient()

  const { data: pending } = await supabase
    .from('kobo_sync_queue')
    .select('*')
    .eq('cooperative_id', cooperativeId)
    .in('status', ['pending', 'failed'])
    .lt('attempts', 5)
    .lte('next_retry_at', new Date().toISOString())
    .order('created_at')
    .limit(50)

  if (!pending || pending.length === 0) {
    return { total: 0, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] }
  }

  // Get field mapping
  const { data: integration } = await supabase
    .from('integrations')
    .select('config')
    .eq('cooperative_id', cooperativeId)
    .eq('type', 'kobo')
    .single()

  const mapping = (integration?.config as any)?.field_mapping ?? {}

  const submissions = pending.map(p => p.payload as KoboSubmission)
  return processKoboSubmissions(cooperativeId, submissions, mapping)
}

// --- Helpers ---

async function queueFailed(
  supabase: any,
  cooperativeId: string,
  submissionId: string,
  payload: any,
  errorMessage?: string,
) {
  const backoff = Math.min(300_000, 30_000 * Math.pow(2, 0)) // exponential backoff
  await supabase.from('kobo_sync_queue').upsert({
    cooperative_id: cooperativeId,
    submission_id: submissionId,
    payload,
    status: 'failed',
    error_message: errorMessage,
    attempts: 1,
    next_retry_at: new Date(Date.now() + backoff).toISOString(),
  }, { onConflict: 'cooperative_id,submission_id' })
}

function flattenSubmission(data: Record<string, unknown>): Record<string, string> {
  const flat: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue
    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        if (subValue != null) flat[subKey] = String(subValue)
      }
    } else {
      const cleanKey = key.includes('/') ? key.split('/').pop()! : key
      flat[cleanKey] = String(value)
    }
  }
  return flat
}

function extractField(flat: Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (!key) continue
    if (flat[key] && flat[key] !== 'null' && flat[key] !== 'undefined') {
      const val = flat[key].trim()
      return val ? val.charAt(0).toUpperCase() + val.slice(1) : null
    }
  }
  return null
}

function cleanPhone(value: string | null): string | null {
  if (!value) return null
  let phone = value.replace(/[^0-9+]/g, '')
  if (phone.length === 8 && !phone.startsWith('+')) {
    phone = '+228' + phone
  } else if (phone.startsWith('228') && phone.length === 11) {
    phone = '+' + phone
  }
  return phone || null
}
