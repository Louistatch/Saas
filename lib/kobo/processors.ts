/**
 * Traitement d'une soumission Kobo selon le type de formulaire (config.form_type).
 *
 * UN SEUL répartiteur, appelé par le webhook, le pull manuel ET la relance : avant,
 * seul le webhook savait traiter récoltes / parcelles / prix de marché, et le pull
 * envoyait tout dans l'inscription de membres (faux membres, prix jamais insérés).
 *
 * Contrat : la fonction LÈVE une erreur quand le traitement échoue (l'appelant
 * enregistre status='error' + error_message sur la ligne) et renvoie
 * { status: 'matched' | 'unmatched' } sinon. supabase-js RÉSOUT avec { error } au
 * lieu de lever : chaque appel lit donc son résultat.
 */
import 'server-only'

import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import { escapeIlike } from '@/lib/validators/kobo'
import { scrubSecrets } from './api-client'
import { CLAIMABLE_STATUSES, CLAIM_STALE_MS } from './claim'
import {
  attachSubmissionToExistingMember,
  enrollNewMemberFromSubmission,
  processCooperativeRegistration,
} from './enrollment'
import {
  deriveMemberId,
  extractMemberKey,
  normalizeCardNumber,
  resolveSubmittedName,
} from './identity'
import { CARD_NOT_FOUND, listScopeCooperativeIds, resolveMemberLink } from './linkage'
import { loadFieldMappings } from './mappings'
import { getPayloadField } from './payload'
import type { KoboFieldMappingRow } from './types'

const log = createLogger('kobo:processors')

type AdminClient = ReturnType<typeof createAdminClient>

export interface DispatchInput {
  submissionId: string
  cooperativeId: string
  payload: Record<string, unknown>
  formType?: string | null
  /** Numéro de carte déjà connu de la ligne (indice : le payload et les correspondances priment). */
  memberCardNumber?: string | null
  /** Token Kobo en clair (téléchargement de la photo / signature). */
  apiToken?: string | null
  /** Origine du serveur Kobo, pour restreindre les hôtes de pièces jointes autorisés. */
  serverUrl?: string
  /** Relance (indicatif) : le succès efface de toute façon l'ancien message d'erreur de la ligne. */
  clearError?: boolean
  /** Correspondances de champs déjà lues (sinon lues ici, par coopérative et formulaire). */
  mappings?: KoboFieldMappingRow[]
}

export interface DispatchOutcome {
  /**
   * 'skipped' : la ligne est déjà prise en charge par un autre traitement (webhook, synchronisation
   * ou « Retenter » concurrent) ou déjà traitée : RIEN n'a été fait ici.
   */
  status: 'matched' | 'unmatched' | 'skipped'
  detail?: string
}

// ---------------------------------------------------------------------------
// Lecture de champs du payload (chemins « groupe/champ » aplatis par Kobo)
// ---------------------------------------------------------------------------

function asRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
}

// ---------------------------------------------------------------------------
// Prise en charge exclusive d'une ligne (claim)
// ---------------------------------------------------------------------------

interface ClaimedRow {
  id: string
  member_id: string | null
  raw_payload: Record<string, unknown> | null
  kobo_form_id: string | null
}

const CLAIM_COLUMNS = 'id, member_id, raw_payload, kobo_form_id'

/**
 * UPDATE conditionnel atomique : une seule requête concurrente obtient la ligne, les autres
 * reçoivent 0 ligne. 'pending' veut dire « en file », 'processing' « en cours » — avant, les deux
 * se confondaient et le webhook, la synchronisation et « Retenter » enrôlaient la même soumission
 * en parallèle (membres en double).
 */
async function claimSubmission(
  admin: AdminClient,
  submissionId: string,
): Promise<{ row: ClaimedRow } | { row: null; currentStatus: string | null }> {
  const now = Date.now()
  const stamp = { status: 'processing' as const, updated_at: new Date(now).toISOString() }

  const fresh = await admin
    .from('kobo_submissions')
    .update(stamp)
    .eq('id', submissionId)
    .in('status', [...CLAIMABLE_STATUSES])
    .select(CLAIM_COLUMNS)
  if (fresh.error)
    throw new Error(`Prise en charge de la soumission impossible : ${fresh.error.message}`)
  if ((fresh.data ?? []).length > 0) return { row: fresh.data[0] as ClaimedRow }

  const stale = await admin
    .from('kobo_submissions')
    .update(stamp)
    .eq('id', submissionId)
    .eq('status', 'processing')
    .lt('updated_at', new Date(now - CLAIM_STALE_MS).toISOString())
    .select(CLAIM_COLUMNS)
  if (stale.error)
    throw new Error(`Prise en charge de la soumission impossible : ${stale.error.message}`)
  if ((stale.data ?? []).length > 0) return { row: stale.data[0] as ClaimedRow }

  const { data: current } = await admin
    .from('kobo_submissions')
    .select('status')
    .eq('id', submissionId)
    .maybeSingle()
  return { row: null, currentStatus: (current?.status as string | undefined) ?? null }
}

// ---------------------------------------------------------------------------
// Statut final de la ligne
// ---------------------------------------------------------------------------

async function markMatched(
  admin: AdminClient,
  submissionId: string,
  patch: { memberId?: string | null; processed: Record<string, unknown> },
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await admin
    .from('kobo_submissions')
    .update({
      status: 'matched' as const,
      ...(patch.memberId ? { member_id: patch.memberId } : {}),
      matched_at: now,
      processed_at: now,
      processed_payload: patch.processed,
      error_message: null,
      updated_at: now,
    })
    .eq('id', submissionId)
  if (error) throw new Error(`Mise à jour du statut impossible : ${error.message}`)
}

async function markUnmatched(
  admin: AdminClient,
  submissionId: string,
  reason: string,
): Promise<void> {
  const { error } = await admin
    .from('kobo_submissions')
    .update({
      status: 'unmatched' as const,
      error_message: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
  if (error) throw new Error(`Mise à jour du statut impossible : ${error.message}`)
}

/** Contexte partagé par les traitements d'une ligne prise en charge. */
interface RunContext {
  payload: Record<string, unknown>
  mappings: KoboFieldMappingRow[]
  claimed: ClaimedRow
}

/**
 * Membre visé par une soumission de suivi (récolte, parcelles) : même résolution que
 * l'inscription — champ clé configuré (carte ou téléphone), arbre de l'organisation de
 * l'intégration, téléphone normalisé. Les données du membre vont dans SA coopérative.
 */
async function resolveFormMember(
  admin: AdminClient,
  input: DispatchInput,
  run: RunContext,
): Promise<{ ok: true; memberId: string; cooperativeId: string } | { ok: false; reason: string }> {
  const key = extractMemberKey(run.payload, run.mappings)
  if (!key.card && !key.invalid) key.card = normalizeCardNumber(input.memberCardNumber)
  const scope = await listScopeCooperativeIds(admin, input.cooperativeId)
  const link = await resolveMemberLink({
    db: admin,
    rootCooperativeId: input.cooperativeId,
    scope,
    key,
    name: resolveSubmittedName(run.payload),
    submissionMemberId: run.claimed.member_id,
  })
  if (link.kind === 'unmatched') return { ok: false, reason: link.reason }
  if (link.kind === 'none') {
    return {
      ok: false,
      reason: key.phone ? 'Membre introuvable pour ce numéro de téléphone' : CARD_NOT_FOUND,
    }
  }
  return { ok: true, memberId: link.memberId, cooperativeId: link.cooperativeId }
}

// ---------------------------------------------------------------------------
// Prix de marché
// ---------------------------------------------------------------------------
// Champs attendus : S1/date_releve, S1/marche, S1/region, S2/produits (répétition :
// nom_produit, prix_kg). market_prices.region_id est NOT NULL et price est un entier.
async function processMarketPrice(
  admin: AdminClient,
  input: DispatchInput,
): Promise<DispatchOutcome> {
  const { payload, submissionId } = input
  const dateReleve =
    getPayloadField(payload, 'S1/date_releve') ?? new Date().toISOString().slice(0, 10)
  const marche = getPayloadField(payload, 'S1/marche') ?? 'Lomé'
  const produits = asRows(payload['S2/produits'] ?? payload.produits)

  if (produits.length === 0) {
    await markMatched(admin, submissionId, {
      processed: { mode: 'market_price', inserted: 0, note: 'Aucun produit' },
    })
    return { status: 'matched', detail: 'Aucun produit dans la soumission' }
  }

  const regionName = getPayloadField(payload, 'S1/region') ?? getPayloadField(payload, 'region')
  if (!regionName) {
    throw new Error(
      'Région manquante dans la soumission (champ S1/region) : les prix de marché exigent une région.',
    )
  }
  const { data: region, error: regionError } = await admin
    .from('regions')
    .select('id')
    .ilike('name', `%${escapeIlike(regionName)}%`)
    .limit(1)
    .maybeSingle()
  if (regionError) throw new Error(`Recherche de la région impossible : ${regionError.message}`)
  if (!region) throw new Error(`Région « ${regionName} » introuvable.`)

  const { data: cultures, error: culturesError } = await admin.from('cultures').select('id, name')
  if (culturesError) throw new Error(`Lecture des cultures impossible : ${culturesError.message}`)
  const cultureMap = new Map(
    (cultures ?? []).map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id]),
  )

  const rows: Array<Record<string, unknown>> = []
  let skipped = 0
  for (const p of produits) {
    const nom = String(p['S2/produits/nom_produit'] ?? p.nom_produit ?? '')
      .trim()
      .toLowerCase()
    const prix = Math.round(Number(p['S2/produits/prix_kg'] ?? p.prix_kg ?? 0))
    if (!nom || !(prix > 0)) {
      skipped++
      continue
    }
    let cultureId = cultureMap.get(nom)
    if (!cultureId) {
      for (const [name, id] of cultureMap) {
        if (name.includes(nom) || nom.includes(name)) {
          cultureId = id
          break
        }
      }
    }
    if (!cultureId) {
      skipped++
      continue
    }
    rows.push({
      culture_id: cultureId,
      region_id: region.id,
      market_name: marche,
      price: prix,
      source: 'kobo',
      created_at: dateReleve,
    })
  }

  // Un seul INSERT : tout ou rien, donc une relance ne duplique jamais des prix déjà insérés.
  if (rows.length > 0) {
    const { error } = await admin.from('market_prices').insert(rows)
    if (error) throw new Error(`Insertion des prix impossible : ${error.message}`)
  }
  log.info('Market prices inserted', { submissionId, count: rows.length, skipped })
  await markMatched(admin, submissionId, {
    processed: { mode: 'market_price', inserted: rows.length, skipped, market: marche },
  })
  return { status: 'matched' }
}

// ---------------------------------------------------------------------------
// Récoltes
// ---------------------------------------------------------------------------
// Champs attendus : S1/carte_membre (ou le champ clé configuré), S1/campagne, S2/recoltes
// (répétition : culture, quantite_kg). Les productions vont dans la coopérative du MEMBRE.
async function processHarvest(
  admin: AdminClient,
  input: DispatchInput,
  run: RunContext,
): Promise<DispatchOutcome> {
  const { submissionId } = input
  const campagne =
    getPayloadField(run.payload, 'S1/campagne') ?? new Date().getFullYear().toString()

  const member = await resolveFormMember(admin, input, run)
  if (!member.ok) return { status: 'unmatched', detail: member.reason }

  const rows: Array<Record<string, unknown>> = []
  for (const r of asRows(run.payload['S2/recoltes'] ?? run.payload.recoltes)) {
    const culture = String(r['S2/recoltes/culture'] ?? r.culture ?? '')
    const quantite = Number(r['S2/recoltes/quantite_kg'] ?? r.quantite_kg ?? 0)
    if (!culture || !(quantite > 0)) continue
    rows.push({
      member_id: member.memberId,
      culture_name: culture,
      quantity_kg: quantite,
      campaign_year: campagne,
      cooperative_id: member.cooperativeId,
      source: 'kobo',
    })
  }
  if (rows.length > 0) {
    const { error } = await admin.from('productions').insert(rows)
    if (error) throw new Error(`Insertion des productions impossible : ${error.message}`)
  }
  log.info('Harvest recorded', { submissionId, count: rows.length })
  await markMatched(admin, submissionId, {
    memberId: member.memberId,
    processed: { mode: 'harvest', inserted: rows.length },
  })
  return { status: 'matched' }
}

// ---------------------------------------------------------------------------
// Relevé de parcelles
// ---------------------------------------------------------------------------
// Champs attendus : S1/carte_membre (ou le champ clé configuré), S1/campagne, S2/parcelles
// (répétition : culture, surface_ha, gps). Les parcelles vont dans la coopérative du MEMBRE.
async function processPlotSurvey(
  admin: AdminClient,
  input: DispatchInput,
  run: RunContext,
): Promise<DispatchOutcome> {
  const { submissionId } = input
  const campagne =
    getPayloadField(run.payload, 'S1/campagne') ?? new Date().getFullYear().toString()

  const member = await resolveFormMember(admin, input, run)
  if (!member.ok) return { status: 'unmatched', detail: member.reason }

  const rows: Array<Record<string, unknown>> = []
  for (const p of asRows(run.payload['S2/parcelles'] ?? run.payload.parcelles)) {
    const culture = String(p['S2/parcelles/culture'] ?? p.culture ?? '')
    const surface = Number(p['S2/parcelles/surface_ha'] ?? p.surface_ha ?? 0)
    const gps = String(p['S2/parcelles/gps'] ?? p.gps ?? '')
    if (!culture || !(surface > 0)) continue
    rows.push({
      member_id: member.memberId,
      culture_principale: culture,
      superficie_ha: surface,
      gps_coordinates: gps || null,
      campaign_year: campagne,
      cooperative_id: member.cooperativeId,
      source: 'kobo',
    })
  }
  if (rows.length > 0) {
    const { error } = await admin.from('parcelles').insert(rows)
    if (error) throw new Error(`Insertion des parcelles impossible : ${error.message}`)
  }
  log.info('Plots recorded', { submissionId, count: rows.length })
  await markMatched(admin, submissionId, {
    memberId: member.memberId,
    processed: { mode: 'plot_survey', inserted: rows.length },
  })
  return { status: 'matched' }
}

// ---------------------------------------------------------------------------
// Inscription / mise à jour de membre (comportement par défaut)
// ---------------------------------------------------------------------------
// Ordre de rapprochement (lib/kobo/linkage.ts) : membre déjà lié à la ligne, champ clé configuré
// (carte OU téléphone), puis champs usuels. Un membre trouvé n'est JAMAIS recréé : la soumission
// lui est rattachée (carte et téléphone se cherchent dans tout l'arbre de l'organisation). Une
// carte renseignée mais introuvable, un champ clé invalide ou un téléphone ambigu donnent
// « unmatched » + motif, pas une inscription.
async function processMember(
  admin: AdminClient,
  input: DispatchInput,
  run: RunContext,
): Promise<DispatchOutcome> {
  const { submissionId, cooperativeId, apiToken, serverUrl } = input
  const key = extractMemberKey(run.payload, run.mappings)
  if (!key.card && !key.invalid) key.card = normalizeCardNumber(input.memberCardNumber)

  const scope = await listScopeCooperativeIds(admin, cooperativeId)
  const link = await resolveMemberLink({
    db: admin,
    rootCooperativeId: cooperativeId,
    scope,
    key,
    name: resolveSubmittedName(run.payload),
    submissionMemberId: run.claimed.member_id,
  })
  if (link.kind === 'unmatched') return { status: 'unmatched', detail: link.reason }

  const context = { mappings: run.mappings, scope }
  const options = { serverUrl }
  // Membre créé par CETTE soumission (reprise, modification) ou personne inconnue : inscription rejouable.
  // Membre déjà connu d'ailleurs (carte, téléphone, autre soumission) : rattachement, sans nouvelle carte.
  const result =
    link.kind === 'member' && link.memberId !== deriveMemberId(submissionId)
      ? await attachSubmissionToExistingMember(
          submissionId,
          link.memberId,
          run.payload,
          apiToken,
          options,
          context,
        )
      : await enrollNewMemberFromSubmission(
          submissionId,
          cooperativeId,
          run.payload,
          apiToken,
          options,
          context,
        )
  if (result && result.status === 'unmatched') return { status: 'unmatched', detail: result.reason }
  return { status: 'matched' }
}

async function runClaimed(
  admin: AdminClient,
  input: DispatchInput,
  claimed: ClaimedRow,
): Promise<DispatchOutcome> {
  // La ligne en base fait foi (elle a pu être mise à jour par une version modifiée de la soumission).
  const payload = claimed.raw_payload ?? input.payload
  const mappings =
    input.mappings ??
    (claimed.kobo_form_id
      ? await loadFieldMappings(admin, input.cooperativeId, claimed.kobo_form_id)
      : [])
  const run: RunContext = { payload, mappings, claimed }

  switch (input.formType) {
    case 'cooperative_registration': {
      await processCooperativeRegistration(input.submissionId, input.cooperativeId, payload)
      // Cette fonction note l'échec sur la ligne : on le relit pour ne pas le compter en succès.
      const { data: row } = await admin
        .from('kobo_submissions')
        .select('status, error_message')
        .eq('id', input.submissionId)
        .maybeSingle()
      if (row?.status === 'error')
        throw new Error(row.error_message ?? "Échec de l'inscription de la coopérative")
      return { status: 'matched' }
    }
    case 'market_price':
      return processMarketPrice(admin, { ...input, payload })
    case 'harvest':
      return processHarvest(admin, input, run)
    case 'plot_survey':
      return processPlotSurvey(admin, input, run)
    default:
      // 'member_enrollment' ou non renseigné : inscription / mise à jour d'un membre.
      return processMember(admin, input, run)
  }
}

/**
 * Traite une soumission déjà enregistrée dans kobo_submissions.
 *
 * Prend d'abord la ligne EN EXCLUSIVITÉ (pending/error/unmatched → processing, ou processing
 * périmé) : si une autre exécution la tient, rien n'est fait et le résultat est 'skipped'.
 * Lève une erreur en cas d'échec — la ligne passe alors en 'error' (relançable) avant que
 * l'erreur ne remonte à l'appelant.
 */
export async function dispatchSubmission(input: DispatchInput): Promise<DispatchOutcome> {
  const admin = createAdminClient()

  const claim = await claimSubmission(admin, input.submissionId)
  if (claim.row === null) {
    const detail =
      claim.currentStatus === 'processing'
        ? 'Soumission déjà en cours de traitement'
        : 'Soumission déjà traitée ou introuvable'
    return { status: 'skipped', detail }
  }

  let outcome: DispatchOutcome
  try {
    outcome = await runClaimed(admin, input, claim.row)
    // Un succès efface lui-même l'ancien message d'erreur (markMatched / markSubmissionMatched) ;
    // on n'y touche pas ici pour ne pas effacer un avertissement (média non stocké).
    if (outcome.status === 'unmatched') {
      await markUnmatched(admin, input.submissionId, outcome.detail ?? CARD_NOT_FOUND)
    }
  } catch (err: unknown) {
    // Sans cela la ligne resterait « processing » jusqu'à la péremption du verrou.
    const message = scrubSecrets(err instanceof Error ? err.message : 'Processing error', [
      input.apiToken,
    ])
    await admin
      .from('kobo_submissions')
      .update({ status: 'error', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', input.submissionId)
    throw err
  }
  return outcome
}
