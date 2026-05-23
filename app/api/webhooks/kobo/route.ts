import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { timingSafeEqual } from 'node:crypto'

const log = createLogger('webhook:kobo')

/**
 * Timing-safe string comparison to prevent timing attacks on secrets.
 */
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

/**
 * POST /api/webhooks/kobo
 * 
 * Webhook endpoint for KoboCollect submissions.
 * When a technician submits a form in the field:
 * 1. Receives the submission data (name, phone, photo, location, cooperative, culture)
 * 2. Cleans and validates the data
 * 3. Creates the member in the correct cooperative
 * 4. The card can then be generated from the dashboard
 * 
 * KoboToolbox sends data as JSON with field mappings configured in the integration settings.
 * 
 * Expected fields (configurable via field_mapping in integrations table):
 * - first_name, last_name
 * - phone
 * - photo (attachment URL)
 * - cooperative_name or cooperative_id
 * - region, prefecture, canton, village
 * - culture_principale
 * - superficie_ha
 */
export async function POST(request: NextRequest) {
  // Verify webhook secret — MANDATORY, not optional
  const webhookSecret = request.headers.get('x-kobo-secret')
  const expectedSecret = process.env.KOBO_WEBHOOK_SECRET

  if (!expectedSecret) {
    log.error('KOBO_WEBHOOK_SECRET is not configured — rejecting all webhook requests')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  if (!webhookSecret || !safeCompare(webhookSecret, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  log.info('KoboCollect submission received', { keys: Object.keys(body) })

  try {
    const supabase = await createClient()

    // Extract and clean data from KoboCollect submission
    // KoboCollect sends nested data — we flatten it
    const submission = flattenKoboData(body)

    const firstName = cleanString(submission.first_name || submission.prenom || submission.nom_prenom?.split(' ')[0])
    const lastName = cleanString(submission.last_name || submission.nom || submission.nom_prenom?.split(' ').slice(1).join(' '))
    const phone = cleanPhone(submission.phone || submission.telephone || submission.tel)
    const photoUrl = submission.photo || submission._attachments?.[0]?.download_url || null
    const cooperativeName = cleanString(submission.cooperative || submission.cooperative_name || submission.nom_cooperative)
    const region = cleanString(submission.region)
    const prefecture = cleanString(submission.prefecture)
    const canton = cleanString(submission.canton)
    const village = cleanString(submission.village || submission.localite)
    const culture = cleanString(submission.culture || submission.culture_principale)
    const superficie = submission.superficie_ha ? parseFloat(String(submission.superficie_ha)) : null

    // Validation
    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: 'Nom et prénom sont obligatoires', received: { firstName, lastName } },
        { status: 400 },
      )
    }

    // Find the cooperative
    let cooperativeId: string | null = null
    if (submission.cooperative_id) {
      cooperativeId = String(submission.cooperative_id)
    } else if (cooperativeName) {
      // Escape ILIKE special characters to prevent wildcard injection
      const escapedName = cooperativeName.replace(/[%_\\]/g, '\\$&')
      const { data: coop } = await supabase
        .from('cooperatives')
        .select('id')
        .ilike('name', `%${escapedName}%`)
        .limit(1)
        .single()
      cooperativeId = coop?.id ?? null
    }

    if (!cooperativeId) {
      // Fallback: try to find by the integration's cooperative_id
      // (the webhook URL might be specific to a cooperative)
      const coopIdParam = new URL(request.url).searchParams.get('cooperative_id')
      if (coopIdParam) cooperativeId = coopIdParam

      if (!cooperativeId) {
        return NextResponse.json(
          { error: 'Coopérative non trouvée', cooperative_name: cooperativeName },
          { status: 400 },
        )
      }
    }

    // Check for duplicate (same name + phone in same cooperative)
    if (phone) {
      const { data: existing } = await supabase
        .from('members')
        .select('id')
        .eq('cooperative_id', cooperativeId)
        .eq('phone', phone)
        .limit(1)
        .single()

      if (existing) {
        // Update existing member instead of creating duplicate
        await supabase.from('members').update({
          first_name: firstName,
          last_name: lastName,
          photo_url: photoUrl,
          region: region,
          prefecture: prefecture,
          canton: canton,
          village: village,
        }).eq('id', existing.id)

        log.info('Member updated (duplicate phone)', { id: existing.id, phone })
        return NextResponse.json({
          success: true,
          action: 'updated',
          member_id: existing.id,
          message: `Membre ${firstName} ${lastName} mis à jour`,
        })
      }
    }

    // Create the member
    const { data: newMember, error: memberError } = await supabase
      .from('members')
      .insert({
        cooperative_id: cooperativeId,
        first_name: firstName,
        last_name: lastName,
        phone: phone,
        photo_url: photoUrl,
        region: region,
        prefecture: prefecture,
        canton: canton,
        village: village,
        status: 'active',
      })
      .select('id')
      .single()

    if (memberError) {
      log.error('Failed to create member', memberError)
      return NextResponse.json(
        { error: 'Échec création membre', details: memberError.message },
        { status: 500 },
      )
    }

    // If culture + superficie provided, create a parcelle
    if (culture && newMember) {
      await supabase.from('parcelles').insert({
        member_id: newMember.id,
        cooperative_id: cooperativeId,
        name: `Parcelle ${culture}`,
        culture_principale: culture,
        superficie_ha: superficie,
      }) // Non-blocking — ignore result
    }

    // Log the import
    await supabase.from('audit_logs').insert({
      cooperative_id: cooperativeId,
      action: 'member.create.kobo',
      entity_type: 'member',
      entity_id: newMember?.id,
      metadata: {
        source: 'kobocollect',
        submission_id: submission._id || submission._uuid,
        culture,
      },
    })

    log.info('Member created from KoboCollect', { id: newMember?.id, name: `${firstName} ${lastName}` })

    return NextResponse.json({
      success: true,
      action: 'created',
      member_id: newMember?.id,
      message: `Membre ${firstName} ${lastName} créé dans la coopérative`,
    })

  } catch (error) {
    log.error('Webhook processing error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// --- Helpers ---

function flattenKoboData(data: Record<string, unknown>): Record<string, any> {
  const flat: Record<string, any> = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Flatten nested groups (KoboCollect uses group/field format)
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        flat[subKey] = subValue
      }
    } else {
      // Remove KoboCollect prefixes like "group_abc/"
      const cleanKey = key.includes('/') ? key.split('/').pop()! : key
      flat[cleanKey] = value
    }
  }
  return flat
}

function cleanString(value: unknown): string | null {
  if (!value) return null
  const str = String(value).trim()
  if (str === '' || str === 'null' || str === 'undefined' || str === 'n/a') return null
  // Capitalize first letter
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function cleanPhone(value: unknown): string | null {
  if (!value) return null
  let phone = String(value).replace(/[^0-9+]/g, '')
  // Add Togo country code if missing
  if (phone.length === 8 && !phone.startsWith('+')) {
    phone = '+228' + phone
  } else if (phone.startsWith('228') && phone.length === 11) {
    phone = '+' + phone
  }
  // Format: +228 XX XX XX XX
  if (phone.startsWith('+228') && phone.length === 12) {
    phone = `+228 ${phone.slice(4, 6)} ${phone.slice(6, 8)} ${phone.slice(8, 10)} ${phone.slice(10, 12)}`
  }
  return phone || null
}
