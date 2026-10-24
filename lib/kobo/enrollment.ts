/**
 * Shared KoboCollect enrollment logic.
 *
 * Used by both:
 *  - POST /api/webhooks/kobo  (real-time webhook path)
 *  - KoboSyncService.processBatch  (pull/sync path)
 *
 * Always uses the admin Supabase client so it can bypass RLS when
 * writing members, member_cards, parcelles, and productions.
 */
import 'server-only'

import { samePerson } from '@/lib/dedup/names'
import { isAllowedKoboAttachmentUrl } from '@/lib/kobo/attachment-url'
import { decideCooperativeMatch, resolveKoboOrganization } from '@/lib/kobo/cooperative-resolution'
import { finishMemberEnrollment, normalizeSavedSubmission } from '@/lib/kobo/processing'
import { processPhotoFaceCrop } from '@/lib/photos/process-photo'
import { createClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import { cooperativeNameSchema } from '@/lib/validators/kobo'

const log = createLogger('kobo:enrollment')

// =========================================================
// Internal helpers
// =========================================================

function getPayloadField(payload: Record<string, unknown>, path: string): string | null {
  if (path in payload && typeof payload[path] === 'string') {
    return (payload[path] as string).trim()
  }
  for (const [key, value] of Object.entries(payload)) {
    if (key === path && typeof value === 'string') return value.trim()
    if (key.endsWith(`/${path.split('/').pop()}`) && typeof value === 'string') return value.trim()
  }
  return null
}

// =========================================================
// Enroll a new member from a KoboCollect submission
// =========================================================
export async function enrollNewMemberFromSubmission(
  submissionId: string,
  faitiereId: string,
  /** KoboToolbox API token — required to download photo attachments */
  apiToken?: string | null,
): Promise<void> {
  const supabase = createClient()
  const payload = await normalizeSavedSubmission(supabase, submissionId)
  const consent = getPayloadField(payload, 'S1/consentement_donnees')
  if (consent && consent !== 'oui') throw new Error('Consentement au traitement des données refusé')

  const prenomField =
    getPayloadField(payload, 'S1/prenom') ?? getPayloadField(payload, 'prenom') ?? ''
  const nomField = getPayloadField(payload, 'S1/nom') ?? getPayloadField(payload, 'nom') ?? ''
  const nomCompletField =
    getPayloadField(payload, 'S1/nom_complet') ?? getPayloadField(payload, 'nom_complet') ?? ''
  const telephone =
    getPayloadField(payload, 'S1/telephone') ?? getPayloadField(payload, 'telephone') ?? ''
  const email = getPayloadField(payload, 'S1/email') ?? getPayloadField(payload, 'email') ?? null
  const region = getPayloadField(payload, 'S3/region') ?? getPayloadField(payload, 'region') ?? null
  const prefecture =
    getPayloadField(payload, 'S3/prefecture') ?? getPayloadField(payload, 'prefecture') ?? null
  const canton = getPayloadField(payload, 'S3/canton') ?? getPayloadField(payload, 'canton') ?? null
  const village =
    getPayloadField(payload, 'S3/village') ?? getPayloadField(payload, 'village') ?? null
  const nomCooperative =
    getPayloadField(payload, 'S2/nom_cooperative') ??
    getPayloadField(payload, 'nom_cooperative') ??
    getPayloadField(payload, 'cooperative_info/cooperative_name') ??
    ''
  const dateNaissance =
    getPayloadField(payload, 'S1/date_naissance') ??
    getPayloadField(payload, 'date_naissance') ??
    getPayloadField(payload, 'S1/age') ??
    null
  const faitiereCode =
    getPayloadField(payload, 'S2/code_faitiere') ??
    getPayloadField(payload, 'code_faitiere') ??
    null

  // Resolve first/last name
  let firstName: string
  let lastName: string
  if (prenomField || nomField) {
    firstName = prenomField.trim()
    lastName = nomField.trim() || prenomField.trim()
  } else {
    const nameParts = nomCompletField.trim().split(/\s+/)
    firstName = nameParts[0] ?? ''
    lastName = nameParts.slice(1).join(' ') || firstName
  }

  if (!firstName) {
    throw new Error('Prénom manquant dans la soumission Kobo')
  }

  // Resolve only inside the configured root, with an atomic database recheck.
  let targetCooperativeId = faitiereId
  let cooperativeResolution: Record<string, unknown> | null = null
  if (nomCooperative) {
    let parentId = faitiereId
    if (region) {
      const { data: unions, error } = await supabase
        .from('cooperatives')
        .select('id, name')
        .eq('level', 'union')
        .eq('parent_id', faitiereId)
        .is('deleted_at', null)
      if (error) throw new Error('Unions de la faîtière indisponibles')
      const regional = unions?.find((u) => u.name.toLowerCase().includes(region.toLowerCase()))
      if (regional) parentId = regional.id
    }
    const resolved = await resolveKoboOrganization(supabase, faitiereId, nomCooperative, parentId)
    targetCooperativeId = resolved.id
    cooperativeResolution = resolved
  }

  // ── Resolve geographic IDs ──────────────────────────────────
  let regionId: string | null = null
  let prefectureId: string | null = null
  let cantonId: string | null = null

  if (region) {
    const { data: rRow } = await supabase
      .from('regions')
      .select('id')
      .ilike('name', `%${region}%`)
      .limit(1)
      .maybeSingle()
    if (rRow) regionId = rRow.id
  }
  if (prefecture && regionId) {
    const { data: pRow } = await supabase
      .from('prefectures')
      .select('id')
      .ilike('name', `%${prefecture}%`)
      .eq('region_id', regionId)
      .limit(1)
      .maybeSingle()
    if (pRow) prefectureId = pRow.id
  }
  if (canton && prefectureId) {
    const { data: cRow } = await supabase
      .from('cantons')
      .select('id')
      .ilike('name', `%${canton}%`)
      .eq('prefecture_id', prefectureId)
      .limit(1)
      .maybeSingle()
    if (cRow) cantonId = cRow.id
  }

  // ── Download photo + signature from KoboToolbox → Supabase Storage ──
  const attachments = (payload._attachments ?? []) as Array<Record<string, string>>

  // xpathKey = Kobo field path (e.g. "S1/photo_membre"), filenameValue = actual filename from payload
  const downloadAttachment = async (
    xpathKey: string | null,
    filenameValue: string | null,
    bucket: string,
    prefix: string,
  ): Promise<string | null> => {
    if (!attachments.length || !apiToken) return null
    // Match by question_xpath (reliable) then fall back to filename contains
    const att =
      (xpathKey ? attachments.find((a) => a.question_xpath === xpathKey) : null) ??
      (filenameValue ? attachments.find((a) => a.filename?.includes(filenameValue)) : null)
    if (!att?.download_url) return null
    if (!isAllowedKoboAttachmentUrl(att.download_url)) {
      log.warn('Rejected non-Kobo attachment URL', { bucket })
      return null
    }
    const field = filenameValue ?? xpathKey ?? 'file'
    try {
      const resp = await fetch(att.download_url, {
        headers: { Authorization: `Token ${apiToken}` },
      })
      if (!resp.ok) return null
      const buf = Buffer.from(await resp.arrayBuffer())
      const ext = field.split('.').pop() ?? 'png'
      const path = `${prefix}/${Date.now()}_${field.split('/').pop()}`
      const { error } = await supabase.storage.from(bucket).upload(path, buf, {
        contentType: `image/${ext}`,
        upsert: true,
      })
      if (error) {
        log.warn(`${bucket} upload failed`, { error: error.message })
        return null
      }
      return supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl ?? null
    } catch (e) {
      log.warn(`${bucket} download failed`, { error: String(e) })
      return null
    }
  }

  // Filename values (what Kobo stores as field value = the filename)
  const photoFilename =
    getPayloadField(payload, 'S1/photo_membre') ??
    getPayloadField(payload, 'photo_membre') ??
    getPayloadField(payload, 'identification/photo')
  const signatureFilename =
    getPayloadField(payload, 'S7/signature_membre') ??
    getPayloadField(payload, 'signature_membre') ??
    getPayloadField(payload, 'signature')

  const [photoUrl, signatureUrl] = await Promise.all([
    downloadAttachment('S1/photo_membre', photoFilename, 'member-photos', 'member-photos'),
    downloadAttachment(
      'S7/signature_membre',
      signatureFilename,
      'member-signatures',
      'member-signatures',
    ),
  ])

  // ── Même personne déjà inscrite ? (renvoi du formulaire, prénom et nom inversés) ──
  const { data: coopMembers } = await supabase
    .from('members')
    .select('id, first_name, last_name, phone, date_of_birth')
    .eq('cooperative_id', targetCooperativeId)
    .is('deleted_at', null)
  const candidate = {
    first_name: firstName,
    last_name: lastName,
    phone: telephone,
    date_of_birth: dateNaissance,
  }
  const existing =
    (
      coopMembers as
        | {
            id: string
            first_name: string | null
            last_name: string | null
            phone: string | null
            date_of_birth: string | null
          }[]
        | null
    )?.find((m) => samePerson(candidate, m).same) ?? null
  if (existing) {
    await reuseExistingMember(supabase, submissionId, existing.id, targetCooperativeId, {
      photo_url: photoUrl,
      signature_url: signatureUrl,
      email,
      date_of_birth: dateNaissance,
      village,
      canton,
      prefecture,
      region,
    })
    return
  }

  // ── Create member ───────────────────────────────────────────
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
      signature_url: signatureUrl,
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

  // Keep the saved member linked even if card issuance or agriculture fails next.
  const { error: linkError } = await supabase
    .from('kobo_submissions')
    .update({
      member_id: newMember.id,
      processed_payload: {
        mode: 'enrollment',
        cooperative_id: targetCooperativeId,
        cooperative_resolution: cooperativeResolution,
      },
    })
    .eq('id', submissionId)
  if (linkError) throw new Error(`Rattachement du membre impossible : ${linkError.message}`)

  // ── Face-crop photo async (non-blocking — update photo_url if successful) ──
  if (photoUrl) {
    processPhotoFaceCrop(photoUrl, newMember.id)
      .then((faceUrl) => {
        if (faceUrl && faceUrl !== photoUrl) {
          supabase
            .from('members')
            .update({
              photo_url: faceUrl,
              // Keep the source. Without it a later change of crop geometry can
              // only re-crop the crop — which is exactly how the 1:1 → 7:9 switch
              // left every existing photo unrepairable.
              photo_original_url: photoUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', newMember.id)
            .then(({ error }) => {
              if (error) log.warn('Face-crop photo_url update failed', { error: error.message })
              else log.info('Face-crop applied', { memberId: newMember.id })
            })
        }
      })
      .catch((e) => log.warn('Face-crop processing error', { error: String(e) }))
  }

  const cardNumber = await finishMemberEnrollment(supabase, submissionId, faitiereId, newMember.id)

  // Queue welcome SMS — fire-and-forget, never blocks enrollment
  if (telephone) {
    const { data: tpl } = await supabase
      .from('notification_templates')
      .select('body_fr')
      .eq('key', 'enrollment_welcome')
      .eq('channel', 'sms')
      .maybeSingle()

    const body = (tpl?.body_fr ?? '')
      .replace('{prenom}', firstName)
      .replace('{card_number}', cardNumber)
      .replace(/{card_number}/g, cardNumber)

    if (body) {
      await supabase
        .from('notification_queue')
        .insert({
          member_id: newMember.id,
          cooperative_id: targetCooperativeId,
          channel: 'sms',
          template_key: 'enrollment_welcome',
          recipient_phone: telephone.trim(),
          variables: { prenom: firstName, card_number: cardNumber },
          body_rendered: body,
          scheduled_at: new Date().toISOString(),
        })
        .then(({ error }) => {
          if (error) log.warn('Welcome SMS queue failed', { error: error.message })
        })
    }
  }

  log.info('New member enrolled via KoboCollect', {
    memberId: newMember.id,
    cardNumber,
    cooperativeId: targetCooperativeId,
    submissionId,
  })
}

// =========================================================
// Create or update a cooperative from a registration form
// =========================================================
/**
 * La soumission concerne une personne déjà inscrite : on complète sa fiche (sans écraser), on
 * garde sa carte, et on ne recrée ni membre, ni carte, ni parcelles. La soumission est marquée
 * rattachée pour garder la trace.
 */
async function reuseExistingMember(
  supabase: ReturnType<typeof createClient>,
  submissionId: string,
  memberId: string,
  cooperativeId: string,
  fill: Record<string, string | null | undefined>,
): Promise<void> {
  const { data: current } = await supabase
    .from('members')
    .select('photo_url, signature_url, email, date_of_birth, village, canton, prefecture, region')
    .eq('id', memberId)
    .single()
  const patch: Record<string, string> = {}
  for (const [key, value] of Object.entries(fill)) {
    if (value && !(current as Record<string, unknown> | null)?.[key]) patch[key] = value
  }
  if (Object.keys(patch).length > 0) {
    await supabase
      .from('members')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', memberId)
  }
  const { error: linkError } = await supabase
    .from('kobo_submissions')
    .update({
      member_id: memberId,
      processed_payload: {
        mode: 'existing_member',
        cooperative_id: cooperativeId,
        filled: Object.keys(patch),
      },
    })
    .eq('id', submissionId)
  if (linkError) throw new Error(linkError.message)
  // The original faîtière remains the submission's access scope.
  const { data: submission, error: readError } = await supabase
    .from('kobo_submissions')
    .select('cooperative_id')
    .eq('id', submissionId)
    .single()
  if (readError || !submission) throw new Error('Soumission introuvable')
  await finishMemberEnrollment(supabase, submissionId, submission.cooperative_id, memberId, true)
  log.info('Submission attached to an existing member (duplicate avoided)', {
    memberId,
    filled: Object.keys(patch),
  })
}

export async function processCooperativeRegistration(
  submissionId: string,
  faitiereId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const supabase = createClient()

  const nom = (
    getPayloadField(payload, 'C1/nom_cooperative') ??
    getPayloadField(payload, 'nom_cooperative') ??
    ''
  ).trim()

  if (!nom) {
    await supabase
      .from('kobo_submissions')
      .update({
        status: 'error' as const,
        error_message: 'nom_cooperative manquant dans la soumission',
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId)
    return
  }

  const niveau = (
    getPayloadField(payload, 'C1/niveau') ??
    getPayloadField(payload, 'niveau') ??
    'cooperative'
  )
    .toLowerCase()
    .trim()

  const nomParent =
    getPayloadField(payload, 'C1/nom_union_parente') ??
    getPayloadField(payload, 'nom_union_parente') ??
    null
  const description =
    getPayloadField(payload, 'C1/description') ?? getPayloadField(payload, 'description') ?? null
  const region = getPayloadField(payload, 'C2/region') ?? getPayloadField(payload, 'region') ?? null

  if (niveau !== 'cooperative' && niveau !== 'union')
    throw new Error('Niveau d’organisation invalide')
  const { data: scope, error: scopeError } = await supabase.rpc('get_cooperative_descendants', {
    p_root_id: faitiereId,
  })
  if (scopeError || !Array.isArray(scope)) throw new Error('Périmètre de la faîtière indisponible')
  const ids = [faitiereId, ...scope.map((r) => r.id)]
  let parentId = faitiereId
  if (niveau === 'cooperative') {
    const { data: unions, error } = await supabase
      .from('cooperatives')
      .select('id, name')
      .in('id', ids)
      .eq('level', 'union')
      .is('deleted_at', null)
    if (error) throw new Error('Unions indisponibles')
    if (nomParent) {
      const parent = decideCooperativeMatch(nomParent, unions ?? [])
      if (parent.kind !== 'match') throw new Error('Union parente à vérifier dans cette faîtière')
      parentId = parent.item.id
    } else if (region) {
      parentId =
        unions?.find((u) => u.name.toLowerCase().includes(region.toLowerCase()))?.id ?? faitiereId
    }
  }

  const parsedNom = cooperativeNameSchema.safeParse(nom)
  if (!parsedNom.success) {
    await supabase
      .from('kobo_submissions')
      .update({
        status: 'error' as const,
        error_message: `nom_cooperative invalide : ${parsedNom.error.issues[0]?.message}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId)
    return
  }

  const resolution = await resolveKoboOrganization(
    supabase,
    faitiereId,
    parsedNom.data,
    parentId,
    niveau,
  )
  const coopId = resolution.id
  if (description) {
    const { error } = await supabase.from('cooperatives').update({ description }).eq('id', coopId)
    if (error) throw new Error(error.message)
  }

  await supabase
    .from('kobo_submissions')
    .update({
      status: 'matched' as const,
      matched_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      processed_payload: {
        mode: 'cooperative_registration',
        cooperative_id: coopId,
        cooperative_name: nom,
        niveau,
      } as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
}
