import 'server-only'

import { cardPrefix, generateUniqueCardNumber } from '@/lib/utils/card-number'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeKoboPayload } from './normalize'
import type { KoboFieldMappingRow } from './types'

/** Refresh normalization on retry, so fixing a mapping can recover the original collection. */
export async function normalizeSavedSubmission(supabase: SupabaseClient, submissionId: string) {
  const { data: row, error } = await supabase
    .from('kobo_submissions')
    .select('raw_payload, processed_payload, cooperative_id, kobo_form_id')
    .eq('id', submissionId)
    .single()
  if (error || !row) throw new Error('Soumission Kobo introuvable')
  const { data: mappings, error: mappingError } = await supabase
    .from('kobo_field_mappings')
    .select('*')
    .eq('cooperative_id', row.cooperative_id)
    .eq('form_id', row.kobo_form_id)
  if (mappingError) throw new Error(`Correspondances indisponibles : ${mappingError.message}`)
  const normalized = normalizeKoboPayload(
    row.raw_payload,
    (mappings ?? []) as KoboFieldMappingRow[],
  )
  const { error: saveError } = await supabase
    .from('kobo_submissions')
    .update({
      processed_payload: { ...row.processed_payload, normalized_payload: normalized },
    })
    .eq('id', submissionId)
  if (saveError) throw new Error(saveError.message)
  return normalized
}

/** Supabase resolves database failures; it does not throw them. */
export async function processAgronomicSubmission(supabase: SupabaseClient, submissionId: string) {
  await normalizeSavedSubmission(supabase, submissionId)
  const { data, error } = await supabase.rpc('process_kobo_submission', {
    p_submission_id: submissionId,
  })
  if (error) throw new Error(`Import agricole impossible : ${error.message}`)
  if (!data || data.success !== true) {
    throw new Error(`Import agricole impossible : ${data?.error ?? 'réponse serveur invalide'}`)
  }
}

/** The webhook and pull must both match AND process an existing card. */
export async function processCardSubmission(supabase: SupabaseClient, submissionId: string) {
  const { error } = await supabase.rpc('match_kobo_submission_to_member', {
    p_submission_id: submissionId,
  })
  if (error) throw new Error(`Rapprochement impossible : ${error.message}`)
  const { data: row, error: readError } = await supabase
    .from('kobo_submissions')
    .select('member_id, status')
    .eq('id', submissionId)
    .single()
  if (readError) throw new Error(readError.message)
  if (row?.status !== 'matched' || !row.member_id) {
    throw new Error('Carte membre introuvable dans cette faîtière')
  }
  await processAgronomicSubmission(supabase, submissionId)
}

/**
 * Resume after the member has been saved. A quota failure keeps that member linked,
 * creates no fictitious card, and never spends PAYG credits automatically.
 * Agriculture is applied by one transactional, replay-safe RPC.
 */
export async function finishMemberEnrollment(
  supabase: SupabaseClient,
  submissionId: string,
  rootCooperativeId: string,
  memberId: string,
  skipAgriculture = false,
): Promise<string> {
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('cooperative_id')
    .eq('id', memberId)
    .is('deleted_at', null)
    .single()
  if (memberError || !member) throw new Error('Membre enregistré introuvable')
  const targetId = member.cooperative_id as string
  if (targetId !== rootCooperativeId) {
    const { data: descendants, error } = await supabase.rpc('get_cooperative_descendants', {
      p_root_id: rootCooperativeId,
    })
    if (error || !Array.isArray(descendants) || !descendants.some((c) => c.id === targetId)) {
      throw new Error('Le membre n’appartient pas à cette faîtière')
    }
  }

  const { data: existing, error: cardError } = await supabase
    .from('member_cards')
    .select('card_number')
    .eq('member_id', memberId)
    .eq('cooperative_id', targetId)
    .eq('status', 'active')
    .maybeSingle()
  if (cardError) throw new Error(`Lecture de la carte impossible : ${cardError.message}`)
  let cardNumber = existing?.card_number as string | undefined
  if (!cardNumber) {
    const { data: coop, error } = await supabase
      .from('cooperatives')
      .select('name, faitiere_name')
      .eq('id', targetId)
      .single()
    if (error || !coop) throw new Error('Coopérative de la carte introuvable')
    cardNumber = await generateUniqueCardNumber(
      supabase,
      cardPrefix(coop.faitiere_name ?? coop.name),
    )
    const expiry = new Date()
    expiry.setFullYear(expiry.getFullYear() + 1)
    const { error: issueError } = await supabase.from('member_cards').insert({
      cooperative_id: targetId,
      member_id: memberId,
      card_number: cardNumber,
      status: 'active',
      expiry_date: expiry.toISOString().slice(0, 10),
      qr_data: `https://www.faitierehub.com/verify/${cardNumber}`,
    })
    if (issueError) {
      throw new Error(`Membre enregistré, carte non émise : ${issueError.message}`)
    }
  }

  if (!skipAgriculture) await processAgronomicSubmission(supabase, submissionId)
  const { error: finishError } = await supabase
    .from('kobo_submissions')
    .update({
      status: 'matched',
      member_card_number: cardNumber,
      error_message: null,
      matched_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
  if (finishError) throw new Error(`Fin de l’import non enregistrée : ${finishError.message}`)
  return cardNumber
}
