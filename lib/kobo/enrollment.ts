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

import { createClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import {
  cooperativeNameSchema,
  escapeIlike,
} from '@/lib/validators/kobo'
import { cardPrefix, generateUniqueCardNumber } from '@/lib/utils/card-number'

const log = createLogger('kobo:enrollment')

// =========================================================
// Internal helpers
// =========================================================

function getPayloadField(
  payload: Record<string, unknown>,
  path: string,
): string | null {
  if (path in payload && typeof payload[path] === 'string') {
    return (payload[path] as string).trim()
  }
  for (const [key, value] of Object.entries(payload)) {
    if (key === path && typeof value === 'string') return value.trim()
    if (
      key.endsWith(`/${path.split('/').pop()}`) &&
      typeof value === 'string'
    )
      return value.trim()
  }
  return null
}

// =========================================================
// Enroll a new member from a KoboCollect submission
// =========================================================
export async function enrollNewMemberFromSubmission(
  submissionId: string,
  faitiereId: string,
  payload: Record<string, unknown>,
  /** KoboToolbox API token — required to download photo attachments */
  apiToken?: string | null,
): Promise<void> {
  const supabase = createClient()

  const prenomField =
    getPayloadField(payload, 'S1/prenom') ??
    getPayloadField(payload, 'prenom') ??
    ''
  const nomField =
    getPayloadField(payload, 'S1/nom') ??
    getPayloadField(payload, 'nom') ??
    ''
  const nomCompletField =
    getPayloadField(payload, 'S1/nom_complet') ??
    getPayloadField(payload, 'nom_complet') ??
    ''
  const telephone =
    getPayloadField(payload, 'S1/telephone') ??
    getPayloadField(payload, 'telephone') ??
    ''
  const email =
    getPayloadField(payload, 'S1/email') ??
    getPayloadField(payload, 'email') ??
    null
  const region =
    getPayloadField(payload, 'S3/region') ??
    getPayloadField(payload, 'region') ??
    null
  const prefecture =
    getPayloadField(payload, 'S3/prefecture') ??
    getPayloadField(payload, 'prefecture') ??
    null
  const canton =
    getPayloadField(payload, 'S3/canton') ??
    getPayloadField(payload, 'canton') ??
    null
  const village =
    getPayloadField(payload, 'S3/village') ??
    getPayloadField(payload, 'village') ??
    null
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

  // ── Resolve cooperative ─────────────────────────────────────
  let targetCooperativeId = faitiereId
  if (nomCooperative) {
    const parsedName = cooperativeNameSchema.safeParse(nomCooperative)
    if (parsedName.success) {
      const safeName = escapeIlike(parsedName.data)

      const { data: accessible } = await supabase.rpc(
        'get_cooperative_descendants',
        { p_root_id: faitiereId },
      )
      const allowedIds: string[] = Array.isArray(accessible)
        ? (accessible as { id: string }[]).map((r) => r.id)
        : [faitiereId]

      // Try exact ILIKE match first, then fall back to unaccented/normalized comparison
      let coop: { id: string } | null = null
      const { data: ilikeCoop } = await supabase
        .from('cooperatives')
        .select('id')
        .ilike('name', `%${safeName}%`)
        .in('id', allowedIds)
        .limit(1)
        .maybeSingle()
      coop = ilikeCoop

      if (!coop) {
        // Normalize: strip accents, lowercase, keep only alphanum
        const normalize = (s: string) =>
          s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
        const normalizedInput = normalize(parsedName.data)

        const { data: allCoops } = await supabase
          .from('cooperatives')
          .select('id, name')
          .in('id', allowedIds)

        coop = (allCoops as { id: string; name: string }[] | null)?.find((c) =>
          normalize(c.name).includes(normalizedInput) || normalizedInput.includes(normalize(c.name)),
        ) ?? null
      }

      if (coop) {
        targetCooperativeId = coop.id
      } else {
        // Auto-create cooperative
        const { data: faitiereData } = await supabase
          .from('cooperatives')
          .select('faitiere_name, name')
          .eq('id', faitiereId)
          .maybeSingle()

        // Use the faitière's own name as label if faitiere_name column is empty
        const faitiereName = faitiereData?.faitiere_name ?? faitiereData?.name ?? null

        let parentUnionId: string | null = faitiereId
        if (region) {
          // Query unions by parent_id (generic — works for any faîtière)
          const { data: unions } = await supabase
            .from('cooperatives')
            .select('id, name')
            .eq('level', 'union')
            .eq('parent_id', faitiereId)
          if (unions) {
            const match = (unions as { id: string; name: string }[]).find(
              (u) => u.name.toLowerCase().includes(region.toLowerCase()),
            )
            if (match) parentUnionId = match.id
          }
        }

        const { data: newCoop } = await supabase
          .from('cooperatives')
          .insert({
            name: parsedName.data,
            level: 'cooperative',
            parent_id: parentUnionId,
            faitiere_name: faitiereName,
          })
          .select('id')
          .single()

        if (newCoop) {
          targetCooperativeId = newCoop.id
          log.info('New cooperative auto-created', {
            name: parsedName.data,
            parentId: parentUnionId,
          })
        }
      }
    } else {
      log.warn('Invalid cooperative name — defaulting to faitiere', { faitiereId })
    }
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
      if (error) { log.warn(`${bucket} upload failed`, { error: error.message }); return null }
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
    downloadAttachment('S7/signature_membre', signatureFilename, 'member-signatures', 'member-signatures'),
  ])

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
    throw new Error(
      `Failed to create member: ${memberError?.message ?? 'Unknown'}`,
    )
  }

  // ── Generate card ───────────────────────────────────────────
  const { data: coopData } = await supabase
    .from('cooperatives')
    .select('name, faitiere_name')
    .eq('id', targetCooperativeId)
    .single()

  const prefix = cardPrefix(coopData?.faitiere_name ?? coopData?.name ?? 'FEN')
  const cardNumber = await generateUniqueCardNumber(supabase, prefix)

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

  // ── Insert parcelles (S5 repeat group) ─────────────────────
  const parcelles = (payload.S5 ?? []) as Array<Record<string, unknown>>
  for (const p of parcelles) {
    const culture = String(
      p['S5/culture_principale'] ?? p['culture_principale'] ?? '',
    )
    const surface = parseFloat(
      String(p['S5/superficie_ha'] ?? p['superficie_ha'] ?? '0'),
    )
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
      } catch (e) {
        log.warn('Parcelle insert failed', { error: String(e) })
      }
    }
  }

  // ── Insert productions (S6 repeat group) ───────────────────
  const productions = (payload.S6 ?? []) as Array<Record<string, unknown>>
  for (const p of productions) {
    const culture = String(
      p['S6/culture_produite'] ?? p['culture_produite'] ?? '',
    )
    const quantity = parseFloat(
      String(p['S6/rendement_kg'] ?? p['rendement_kg'] ?? '0'),
    )
    const campagne = String(
      p['S6/campagne_annee'] ?? p['campagne_annee'] ?? '',
    )
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
      } catch (e) {
        log.warn('Production insert failed', { error: String(e) })
      }
    }
  }

  // ── Mark submission as matched ──────────────────────────────
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
// Create or update a cooperative from a registration form
// =========================================================
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
    getPayloadField(payload, 'C1/description') ??
    getPayloadField(payload, 'description') ??
    null
  const region =
    getPayloadField(payload, 'C2/region') ??
    getPayloadField(payload, 'region') ??
    null

  const { data: faitiereData } = await supabase
    .from('cooperatives')
    .select('name, faitiere_name')
    .eq('id', faitiereId)
    .maybeSingle()

  const faitiereName =
    faitiereData?.faitiere_name ?? faitiereData?.name ?? ''

  let parentId: string | null = null
  if (niveau === 'union') {
    parentId = faitiereId
  } else if (niveau === 'cooperative') {
    if (nomParent) {
      const { data: parentUnion } = await supabase
        .from('cooperatives')
        .select('id')
        .ilike('name', `%${escapeIlike(nomParent)}%`)
        .eq('level', 'union')
        .eq('faitiere_name', faitiereName)
        .limit(1)
        .maybeSingle()
      parentId = parentUnion?.id ?? faitiereId
    } else if (region) {
      const { data: unions } = await supabase
        .from('cooperatives')
        .select('id, name')
        .eq('level', 'union')
        .eq('faitiere_name', faitiereName)
      const typedUnions = (unions ?? []) as { id: string; name: string }[]
      const match = typedUnions.find((u) =>
        u.name.toLowerCase().includes(region.toLowerCase()),
      )
      parentId = match?.id ?? faitiereId
    } else {
      parentId = faitiereId
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

  const { data: existing } = await supabase
    .from('cooperatives')
    .select('id')
    .ilike('name', escapeIlike(parsedNom.data))
    .eq('faitiere_name', faitiereName)
    .limit(1)
    .maybeSingle()

  let coopId: string
  if (existing) {
    await supabase
      .from('cooperatives')
      .update({
        level: niveau,
        parent_id: parentId,
        ...(description ? { description } : {}),
      })
      .eq('id', existing.id)
    coopId = existing.id
    log.info('Cooperative updated via KoboCollect', { id: coopId, name: nom })
  } else {
    const { data: newCoop, error: coopError } = await supabase
      .from('cooperatives')
      .insert({
        name: parsedNom.data,
        level: niveau,
        parent_id: parentId,
        faitiere_name: faitiereName,
        description: description ?? null,
      })
      .select('id')
      .single()

    if (coopError || !newCoop) {
      throw new Error(
        `Échec création coopérative : ${coopError?.message ?? 'Inconnu'}`,
      )
    }
    coopId = newCoop.id
    log.info('Nouvelle coopérative créée via KoboCollect', {
      id: coopId,
      name: nom,
      niveau,
    })
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
