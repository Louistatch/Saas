/**
 * Inscription KoboCollect d'un membre et d'une coopérative.
 *
 * Appelé par le répartiteur commun (lib/kobo/processors.ts : webhook, pull ET relance) APRÈS
 * qu'il a pris la ligne en charge (claim) et rapproché la soumission d'un membre existant.
 * Utilise toujours le client admin (écritures members, member_cards, parcelles, productions…) :
 * à n'appeler qu'après les contrôles d'accès du tenant.
 *
 * Contrat : LÈVE une erreur quand l'inscription échoue (la ligne passe en 'error' et sera
 * relancée) ; renvoie `{ status: 'unmatched', reason }` quand un humain doit trancher.
 * supabase-js RÉSOUT avec { error } au lieu de lever : chaque appel lit donc son résultat.
 *
 * Rejouable : le membre créé par une soumission a un identifiant DÉTERMINISTE
 * (deriveMemberId). Une inscription interrompue — au milieu de la création, de l'émission de la
 * carte ou de l'ingestion des parcelles — retrouve SON membre à la relance au lieu d'en créer un
 * second ; la carte, les parcelles et les productions ne sont créées que si elles manquent.
 *
 * Cotisations (bloc S4 du formulaire) : NON prises en charge. Le formulaire ne déclare qu'un
 * nombre de cotisations sur 12 mois et le montant de la dernière, sans date ni attestation de
 * paiement : en tirer des lignes `cotisations` « payées » reviendrait à inventer des données,
 * et la correspondance historique `S4/nb_cotisations_12mois → cotisations.amount` confond un
 * compteur et un montant. Les correspondances vers `cotisations` sont refusées à la configuration
 * (lib/validators/kobo.ts).
 */
import 'server-only'

import {
  type MappingLike,
  buildMemberProfile,
  deriveMemberId,
  normalizeName,
} from '@/lib/kobo/identity'
import { chunk, listScopeCooperativeIds } from '@/lib/kobo/linkage'
import { storeKoboMedia } from '@/lib/kobo/media'
import { getPayloadField } from '@/lib/kobo/payload'
import { processPhotoFaceCrop } from '@/lib/photos/process-photo'
import { createClient } from '@/lib/supabase/admin'
import { cardPrefix, generateUniqueCardNumber } from '@/lib/utils/card-number'
import { createLogger } from '@/lib/utils/logger'
import { cooperativeNameSchema, escapeIlike } from '@/lib/validators/kobo'

const log = createLogger('kobo:enrollment')

type AdminClient = ReturnType<typeof createClient>
type Row = Record<string, unknown>

export interface EnrollmentContext {
  /** Correspondances de champs du formulaire (déjà lues par le répartiteur). */
  mappings?: readonly MappingLike[]
  /** Identifiants de l'arbre de l'organisation (racine comprise). */
  scope?: readonly string[]
}

export type EnrollmentResult = { status: 'matched' } | { status: 'unmatched'; reason: string }

/** Échec d'émission de la carte (quota, numéro indisponible…) : le membre existe, la ligne est relançable. */
export class KoboCardIssuanceError extends Error {
  constructor(
    readonly reason: 'quota' | 'other',
    detail: string,
  ) {
    super(detail)
    this.name = 'KoboCardIssuanceError'
  }
}

// =========================================================
// Coopérative du membre : arbre de l'organisation, correspondance EXACTE
// =========================================================

interface CoopRow {
  id: string
  name: string
  level: string | null
  faitiere_name: string | null
}

async function fetchCooperatives(db: AdminClient, ids: readonly string[]): Promise<CoopRow[]> {
  const out: CoopRow[] = []
  for (const part of chunk(ids, 100)) {
    const { data, error } = await db
      .from('cooperatives')
      .select('id, name, level, faitiere_name')
      .in('id', part)
    if (error) throw new Error(`Lecture des coopératives impossible : ${error.message}`)
    out.push(...((data ?? []) as CoopRow[]))
  }
  return out
}

export type CooperativeResolution =
  | { ok: true; cooperativeId: string }
  | { ok: false; reason: string }

/**
 * Coopérative d'un NOUVEAU membre d'après S2/nom_cooperative : correspondance EXACTE (accents,
 * casse et ponctuation ignorés) parmi les coopératives de niveau « cooperative » de l'arbre de
 * l'intégration. Jamais de correspondance partielle ni entre niveaux, jamais de création
 * automatique d'une coopérative à partir d'un texte libre : si le nom ne désigne pas exactement
 * UNE coopérative, la soumission est signalée à un humain (« unmatched » + motif) et le membre
 * n'est pas inscrit au mauvais endroit.
 */
export async function resolveMemberCooperative(
  db: AdminClient,
  rootCooperativeId: string,
  scope: readonly string[],
  rawName: string,
): Promise<CooperativeResolution> {
  const name = rawName.trim()
  if (!name) return { ok: true, cooperativeId: rootCooperativeId }

  const coops = await fetchCooperatives(db, scope)
  // Intégration au niveau d'une coopérative : le membre lui appartient, la saisie ne peut pas le déplacer.
  if (coops.find((c) => c.id === rootCooperativeId)?.level === 'cooperative') {
    return { ok: true, cooperativeId: rootCooperativeId }
  }

  const parsed = cooperativeNameSchema.safeParse(name)
  if (!parsed.success) {
    return {
      ok: false,
      reason: `Nom de coopérative invalide dans la soumission (« ${name.slice(0, 60)} »)`,
    }
  }
  const wanted = normalizeName(parsed.data)
  const matches = coops.filter((c) => c.level === 'cooperative' && normalizeName(c.name) === wanted)
  if (matches.length === 1) return { ok: true, cooperativeId: (matches[0] as CoopRow).id }
  if (matches.length === 0) {
    return {
      ok: false,
      reason: `Coopérative « ${parsed.data} » introuvable dans l'organisation (nom exact requis) : créez-la ou corrigez la saisie, puis Retenter`,
    }
  }
  return {
    ok: false,
    reason: `Plusieurs coopératives portent le nom « ${parsed.data} » dans l'organisation : précisez-la, puis Retenter`,
  }
}

// =========================================================
// Carte de membre
// =========================================================

const CARD_ISSUE_ATTEMPTS = 3

/**
 * Carte FAITIERE du membre : celle qui existe, sinon une nouvelle. Le résultat de l'insertion est
 * LU — un refus (quota de 10 cartes par coopérative, trigger P0010) était ignoré, ce qui laissait
 * un membre sans carte, une soumission « matched » avec un numéro inexistant et un SMS qui
 * l'annonçait.
 */
export async function ensureMemberCard(
  db: AdminClient,
  memberId: string,
  cooperativeId: string,
): Promise<{ cardNumber: string; issued: boolean }> {
  const { data: cards, error: readError } = await db
    .from('member_cards')
    .select('card_number, card_type, status')
    .eq('member_id', memberId)
    .limit(10)
  if (readError) {
    throw new Error(`Lecture des cartes du membre impossible : ${readError.message}`)
  }
  const own = ((cards ?? []) as Row[]).filter(
    (c) => c.card_type === undefined || c.card_type === null || c.card_type === 'FAITIERE',
  )
  const current = own.find((c) => c.status === 'active') ?? own[0]
  if (current) return { cardNumber: String(current.card_number), issued: false }

  const { data: coop } = await db
    .from('cooperatives')
    .select('name, faitiere_name')
    .eq('id', cooperativeId)
    .maybeSingle()
  const prefix = cardPrefix(coop?.faitiere_name ?? coop?.name ?? 'FEN')
  const expiry = new Date()
  expiry.setFullYear(expiry.getFullYear() + 1)

  let lastMessage = 'échec inconnu'
  for (let attempt = 0; attempt < CARD_ISSUE_ATTEMPTS; attempt++) {
    const cardNumber = await generateUniqueCardNumber(db, prefix)
    const { error } = await db.from('member_cards').insert({
      cooperative_id: cooperativeId,
      member_id: memberId,
      card_number: cardNumber,
      status: 'active',
      expiry_date: expiry.toISOString().split('T')[0],
      qr_data: `https://www.faitierehub.com/verify/${cardNumber}`,
    })
    if (!error) return { cardNumber, issued: true }
    if (error.code === '23505') {
      lastMessage = error.message
      continue // numéro pris entre la vérification et l'insertion : on en tire un autre
    }
    if (error.code === 'P0010' || /quota de cartes/i.test(error.message)) {
      throw new KoboCardIssuanceError(
        'quota',
        'Carte non émise : quota de cartes atteint pour la coopérative. Le membre est créé ; augmentez le quota puis cliquez sur « Retenter ».',
      )
    }
    throw new KoboCardIssuanceError('other', `Carte non émise : ${error.message}`)
  }
  throw new KoboCardIssuanceError('other', `Carte non émise : numéro indisponible (${lastMessage})`)
}

// =========================================================
// Parcelles (S5) et productions (S6) : idempotent, jamais de doublon à la relance
// =========================================================

function toNumber(value: unknown): number {
  return Number.parseFloat(String(value ?? '0').replace(',', '.'))
}

function samePart(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' || typeof b === 'number') {
    return Math.abs(Number(a) - Number(b)) < 1e-9
  }
  return (a ?? null) === (b ?? null)
}

/**
 * Rapproche les lignes voulues des lignes `source='kobo'` déjà présentes du membre, par clé
 * naturelle : insère ce qui manque (en UN lot), met à jour ce qui a changé (soumission modifiée),
 * ne supprime jamais. Rejouable après une interruption.
 */
async function reconcileRows(
  db: AdminClient,
  table: 'parcelles' | 'productions',
  memberId: string,
  desired: Row[],
  keyOf: (r: Row) => string,
  valueColumns: string[],
): Promise<{ inserted: number; updated: number }> {
  if (desired.length === 0) return { inserted: 0, updated: 0 }
  const { data, error } = await db
    .from(table)
    .select('*')
    .eq('member_id', memberId)
    .eq('source', 'kobo')
  if (error) throw new Error(`Lecture des ${table} impossible : ${error.message}`)

  const buckets = new Map<string, Row[]>()
  for (const row of (data ?? []) as Row[]) {
    const k = keyOf(row)
    buckets.set(k, [...(buckets.get(k) ?? []), row])
  }

  const toInsert: Row[] = []
  const updates: Array<{ id: string; patch: Row }> = []
  for (const want of desired) {
    const existing = buckets.get(keyOf(want))?.shift()
    if (!existing) {
      toInsert.push(want)
      continue
    }
    const patch: Row = {}
    for (const col of valueColumns) {
      if (!samePart(existing[col], want[col])) patch[col] = want[col]
    }
    if (Object.keys(patch).length > 0) updates.push({ id: String(existing.id), patch })
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await db.from(table).insert(toInsert)
    if (insertError) throw new Error(`Insertion des ${table} impossible : ${insertError.message}`)
  }
  for (const u of updates) {
    const { error: updateError } = await db.from(table).update(u.patch).eq('id', u.id)
    if (updateError) throw new Error(`Mise à jour des ${table} impossible : ${updateError.message}`)
  }
  return { inserted: toInsert.length, updated: updates.length }
}

async function ingestMemberData(
  db: AdminClient,
  args: { memberId: string; cooperativeId: string; payload: Row },
): Promise<{ parcelles: number; productions: number }> {
  const { memberId, cooperativeId, payload } = args
  const rowsOf = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : [])

  const parcelles: Row[] = []
  for (const p of rowsOf(payload.S5)) {
    const culture = String(p['S5/culture_principale'] ?? p.culture_principale ?? '')
    const surface = toNumber(p['S5/superficie_ha'] ?? p.superficie_ha)
    if (!culture || !(surface > 0)) continue
    parcelles.push({
      member_id: memberId,
      cooperative_id: cooperativeId,
      name: `Parcelle ${culture}`,
      culture_principale: culture,
      superficie_ha: surface,
      soil_type: String(p['S5/type_sol'] ?? p.type_sol ?? '') || null,
      irrigation_type: String(p['S5/irrigation'] ?? p.irrigation ?? '') || null,
      source: 'kobo',
    })
  }

  const productions: Row[] = []
  for (const p of rowsOf(payload.S6)) {
    const culture = String(p['S6/culture_produite'] ?? p.culture_produite ?? '')
    const quantity = toNumber(p['S6/rendement_kg'] ?? p.rendement_kg)
    if (!culture || !(quantity > 0)) continue
    productions.push({
      member_id: memberId,
      cooperative_id: cooperativeId,
      culture_name: culture,
      quantity_kg: quantity,
      campaign_year:
        String(p['S6/campagne_annee'] ?? p.campagne_annee ?? '') ||
        new Date().getFullYear().toString(),
      source: 'kobo',
    })
  }

  const a = await reconcileRows(db, 'parcelles', memberId, parcelles, (r) => String(r.name), [
    'superficie_ha',
    'soil_type',
    'irrigation_type',
  ])
  const b = await reconcileRows(
    db,
    'productions',
    memberId,
    productions,
    (r) => `${String(r.culture_name)}|${String(r.campaign_year)}`,
    ['quantity_kg'],
  )
  return { parcelles: a.inserted + a.updated, productions: b.inserted + b.updated }
}

// =========================================================
// Écritures communes
// =========================================================

async function linkSubmissionToMember(
  db: AdminClient,
  submissionId: string,
  memberId: string,
): Promise<void> {
  const { error } = await db
    .from('kobo_submissions')
    .update({ member_id: memberId, updated_at: new Date().toISOString() })
    .eq('id', submissionId)
  if (error) throw new Error(`Liaison de la soumission au membre impossible : ${error.message}`)
}

/** Avertissement visible dans la liste (la ligne reste « matched ») quand un média annoncé n'a pas pu être stocké. */
function mediaWarning(errors: ReadonlyArray<{ field: string }>): string | null {
  if (errors.length === 0) return null
  const fields = errors.map((e) => (e.field === 'photo' ? 'photo' : 'signature'))
  return `Média non stocké (${[...new Set(fields)].join(', ')}) : voir le détail de la soumission`
}

async function markSubmissionMatched(
  db: AdminClient,
  submissionId: string,
  patch: { memberId: string; cardNumber: string | null; processed: Row; warning?: string | null },
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db
    .from('kobo_submissions')
    .update({
      status: 'matched' as const,
      member_id: patch.memberId,
      ...(patch.cardNumber ? { member_card_number: patch.cardNumber } : {}),
      matched_at: now,
      processed_at: now,
      processed_payload: patch.processed,
      error_message: patch.warning ?? null,
      updated_at: now,
    })
    .eq('id', submissionId)
  if (error) throw new Error(`Mise à jour du statut impossible : ${error.message}`)
}

/** Écrit la fiche ; si le téléphone viole l'unicité (cooperative_id, phone), réessaie sans lui. */
async function updateMemberRow(db: AdminClient, memberId: string, patch: Row): Promise<void> {
  if (Object.keys(patch).length === 0) return
  const payload = { ...patch, updated_at: new Date().toISOString() }
  const { error } = await db.from('members').update(payload).eq('id', memberId)
  if (!error) return
  if (error.code === '23505' && 'phone' in payload) {
    log.warn('Member phone not updated: already used in this cooperative', { memberId })
    const { phone: _skip, ...withoutPhone } = payload
    const retry = await db.from('members').update(withoutPhone).eq('id', memberId)
    if (!retry.error) return
    throw new Error(`Mise à jour du membre impossible : ${retry.error.message}`)
  }
  throw new Error(`Mise à jour du membre impossible : ${error.message}`)
}

async function readMember(db: AdminClient, memberId: string): Promise<Row | null> {
  const { data, error } = await db.from('members').select('*').eq('id', memberId).maybeSingle()
  if (error) throw new Error(`Lecture du membre impossible : ${error.message}`)
  return (data as Row | null) ?? null
}

const isBlank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** SMS de bienvenue : une seule fois par membre, jamais pour une carte qui n'existe pas. */
async function queueWelcomeSms(
  db: AdminClient,
  args: {
    memberId: string
    cooperativeId: string
    phone: string | null
    firstName: string
    cardNumber: string
  },
): Promise<void> {
  if (!args.phone) return
  const { data: already, error: lookupError } = await db
    .from('notification_queue')
    .select('id')
    .eq('member_id', args.memberId)
    .eq('template_key', 'enrollment_welcome')
    .limit(1)
  if (lookupError) {
    log.warn('Welcome SMS lookup failed', { error: lookupError.message })
    return
  }
  if ((already ?? []).length > 0) return

  const { data: tpl } = await db
    .from('notification_templates')
    .select('body_fr')
    .eq('key', 'enrollment_welcome')
    .eq('channel', 'sms')
    .maybeSingle()
  const body = String(tpl?.body_fr ?? '')
    .replace(/{prenom}/g, args.firstName)
    .replace(/{card_number}/g, args.cardNumber)
  if (!body) return

  const { error } = await db.from('notification_queue').insert({
    member_id: args.memberId,
    cooperative_id: args.cooperativeId,
    channel: 'sms',
    template_key: 'enrollment_welcome',
    recipient_phone: args.phone,
    variables: { prenom: args.firstName, card_number: args.cardNumber },
    body_rendered: body,
    scheduled_at: new Date().toISOString(),
  })
  if (error) log.warn('Welcome SMS queue failed', { error: error.message })
}

// =========================================================
// Inscription d'un nouveau membre (rejouable)
// =========================================================
export async function enrollNewMemberFromSubmission(
  submissionId: string,
  faitiereId: string,
  payload: Record<string, unknown>,
  /** Token API KoboToolbox — requis pour télécharger la photo et la signature. */
  apiToken?: string | null,
  /** Serveur Kobo de l'intégration : seuls ses hôtes sont autorisés pour les pièces jointes. */
  options?: { serverUrl?: string },
  ctx?: EnrollmentContext,
): Promise<EnrollmentResult> {
  const db = createClient()
  const profile = buildMemberProfile(payload, ctx?.mappings ?? [])
  if (!profile.first_name) throw new Error('Prénom manquant dans la soumission Kobo')

  // Identifiant déterministe : si une tentative précédente a déjà créé le membre, on le reprend.
  const memberId = deriveMemberId(submissionId)
  const existing = await readMember(db, memberId)

  let targetCooperativeId: string
  if (existing) {
    targetCooperativeId = String(existing.cooperative_id)
  } else {
    const scope = ctx?.scope ?? (await listScopeCooperativeIds(db, faitiereId))
    const nomCooperative =
      getPayloadField(payload, 'S2/nom_cooperative') ??
      getPayloadField(payload, 'nom_cooperative') ??
      getPayloadField(payload, 'cooperative_info/cooperative_name') ??
      ''
    const resolved = await resolveMemberCooperative(db, faitiereId, scope, nomCooperative)
    if (!resolved.ok) return { status: 'unmatched', reason: resolved.reason }
    targetCooperativeId = resolved.cooperativeId
  }

  // ── Identifiants géographiques ──────────────────────────────
  let regionId: string | null = null
  let prefectureId: string | null = null
  let cantonId: string | null = null
  if (!existing) {
    if (profile.region) {
      const { data } = await db
        .from('regions')
        .select('id')
        .ilike('name', `%${escapeIlike(profile.region)}%`)
        .limit(1)
        .maybeSingle()
      if (data) regionId = data.id
    }
    if (profile.prefecture && regionId) {
      const { data } = await db
        .from('prefectures')
        .select('id')
        .ilike('name', `%${escapeIlike(profile.prefecture)}%`)
        .eq('region_id', regionId)
        .limit(1)
        .maybeSingle()
      if (data) prefectureId = data.id
    }
    if (profile.canton && prefectureId) {
      const { data } = await db
        .from('cantons')
        .select('id')
        .ilike('name', `%${escapeIlike(profile.canton)}%`)
        .eq('prefecture_id', prefectureId)
        .limit(1)
        .maybeSingle()
      if (data) cantonId = data.id
    }
  }

  // ── Photo + signature (dans le dossier de la coopérative du membre) ──
  const media = await storeKoboMedia(db, {
    payload,
    apiToken,
    serverUrl: options?.serverUrl,
    cooperativeId: targetCooperativeId,
    memberId,
    want: { photo: isBlank(existing?.photo_url), signature: isBlank(existing?.signature_url) },
  })

  // ── Membre ──────────────────────────────────────────────────
  if (!existing) {
    const { error } = await db.from('members').insert({
      id: memberId,
      cooperative_id: targetCooperativeId,
      first_name: profile.first_name,
      last_name: profile.last_name,
      phone: profile.phone,
      email: profile.email,
      region: profile.region,
      prefecture: profile.prefecture,
      canton: profile.canton,
      village: profile.village,
      photo_url: media.photoUrl,
      signature_url: media.signatureUrl,
      faitiere: profile.faitiere,
      region_id: regionId,
      prefecture_id: prefectureId,
      canton_id: cantonId,
      date_of_birth: profile.date_of_birth,
      status: 'active',
    })
    if (error) {
      // 23505 : une autre tentative l'a créé entre-temps (même identifiant) ou le téléphone est déjà pris.
      const raced = error.code === '23505' ? await readMember(db, memberId) : null
      if (!raced) {
        throw new Error(
          error.code === '23505'
            ? 'Un membre portant ce numéro de téléphone existe déjà dans cette coopérative'
            : `Failed to create member: ${error.message}`,
        )
      }
    }
  } else {
    // Reprise ou soumission modifiée : cette soumission est l'auteur du membre, ses valeurs font foi.
    const patch: Row = {}
    for (const [col, value] of Object.entries(profile)) {
      if (!isBlank(value)) patch[col] = value
    }
    if (media.photoUrl) patch.photo_url = media.photoUrl
    if (media.signatureUrl) patch.signature_url = media.signatureUrl
    await updateMemberRow(db, memberId, patch)
  }

  // Lien ligne → membre aussitôt (la relance le retrouverait de toute façon par l'identifiant).
  await linkSubmissionToMember(db, submissionId, memberId)

  // Recadrage du portrait : non bloquant, seulement pour une photo qui vient d'être déposée.
  const photoUrl = media.photoUrl
  if (photoUrl) {
    processPhotoFaceCrop(photoUrl, memberId)
      .then((faceUrl) => {
        if (faceUrl && faceUrl !== photoUrl) {
          db.from('members')
            .update({
              photo_url: faceUrl,
              // Garde la source : sans elle, un changement de géométrie ne peut que recadrer le recadrage.
              photo_original_url: photoUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', memberId)
            .then(({ error }) => {
              if (error) log.warn('Face-crop photo_url update failed', { error: error.message })
            })
        }
      })
      .catch((e) => log.warn('Face-crop processing error', { error: String(e) }))
  }

  // ── Carte : son échec est une erreur de la ligne (relançable), jamais un succès ──
  const card = await ensureMemberCard(db, memberId, targetCooperativeId)

  // ── Parcelles (S5) et productions (S6) ──────────────────────
  const ingested = await ingestMemberData(db, {
    memberId,
    cooperativeId: targetCooperativeId,
    payload,
  })

  const { data: coopData } = await db
    .from('cooperatives')
    .select('name')
    .eq('id', targetCooperativeId)
    .maybeSingle()

  await markSubmissionMatched(db, submissionId, {
    memberId,
    cardNumber: card.cardNumber,
    processed: {
      mode: 'enrollment',
      member_id: memberId,
      card_number: card.cardNumber,
      cooperative_id: targetCooperativeId,
      cooperative_name: coopData?.name ?? null,
      parcelles_written: ingested.parcelles,
      productions_written: ingested.productions,
      ...(media.errors.length > 0 ? { media_errors: media.errors } : {}),
    },
    warning: mediaWarning(media.errors),
  })

  await queueWelcomeSms(db, {
    memberId,
    cooperativeId: targetCooperativeId,
    phone: profile.phone,
    firstName: profile.first_name,
    cardNumber: card.cardNumber,
  })

  log.info('Member enrolled via KoboCollect', {
    memberId,
    cooperativeId: targetCooperativeId,
    submissionId,
    resumed: existing !== null,
    cardIssued: card.issued,
    mediaErrors: media.errors.length,
  })
  return { status: 'matched' }
}

// =========================================================
// Soumission rattachée à un membre EXISTANT (carte ou téléphone)
// =========================================================
export async function attachSubmissionToExistingMember(
  submissionId: string,
  memberId: string,
  payload: Record<string, unknown>,
  apiToken?: string | null,
  options?: { serverUrl?: string },
  ctx?: EnrollmentContext,
): Promise<EnrollmentResult> {
  const db = createClient()
  const member = await readMember(db, memberId)
  if (!member) throw new Error('Membre rapproché introuvable')
  const cooperativeId = String(member.cooperative_id)

  // La fiche d'un membre existant n'est jamais écrasée : on ne complète que ce qui est vide.
  const profile = buildMemberProfile(payload, ctx?.mappings ?? [])
  const patch: Row = {}
  for (const [col, value] of Object.entries(profile)) {
    if (!isBlank(value) && isBlank(member[col])) patch[col] = value
  }

  const media = await storeKoboMedia(db, {
    payload,
    apiToken,
    serverUrl: options?.serverUrl,
    cooperativeId,
    memberId,
    want: { photo: isBlank(member.photo_url), signature: isBlank(member.signature_url) },
  })
  if (media.photoUrl) patch.photo_url = media.photoUrl
  if (media.signatureUrl) patch.signature_url = media.signatureUrl
  await updateMemberRow(db, memberId, patch)

  await linkSubmissionToMember(db, submissionId, memberId)
  const ingested = await ingestMemberData(db, { memberId, cooperativeId, payload })

  const { data: cards } = await db
    .from('member_cards')
    .select('card_number, card_type, status')
    .eq('member_id', memberId)
    .limit(10)
  const card = ((cards ?? []) as Row[]).find(
    (c) => (c.card_type == null || c.card_type === 'FAITIERE') && c.status === 'active',
  )

  await markSubmissionMatched(db, submissionId, {
    memberId,
    cardNumber: card ? String(card.card_number) : null,
    processed: {
      mode: 'member_update',
      member_id: memberId,
      cooperative_id: cooperativeId,
      parcelles_written: ingested.parcelles,
      productions_written: ingested.productions,
      ...(media.errors.length > 0 ? { media_errors: media.errors } : {}),
    },
    warning: mediaWarning(media.errors),
  })
  log.info('Submission attached to existing member', { memberId, submissionId })
  return { status: 'matched' }
}

// =========================================================
// Création / mise à jour d'une coopérative depuis un formulaire d'inscription
// =========================================================

const REGISTRATION_LEVELS = ['union', 'cooperative']

/**
 * Le périmètre est l'ARBRE de l'organisation de l'intégration (get_cooperative_descendants),
 * pas le libellé `faitiere_name` : deux organisations de même libellé ne peuvent plus se
 * toucher. Aucune coopérative hors de l'arbre n'est lue ni modifiée ; la racine n'est jamais
 * modifiée ; un niveau autre qu'union / coopérative est refusé (pas de nouvelle organisation racine).
 */
export async function processCooperativeRegistration(
  submissionId: string,
  faitiereId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = createClient()

  const nom = (
    getPayloadField(payload, 'C1/nom_cooperative') ??
    getPayloadField(payload, 'nom_cooperative') ??
    ''
  ).trim()
  if (!nom) throw new Error('nom_cooperative manquant dans la soumission')

  const niveau = (
    getPayloadField(payload, 'C1/niveau') ??
    getPayloadField(payload, 'niveau') ??
    'cooperative'
  )
    .toLowerCase()
    .trim()
  if (!REGISTRATION_LEVELS.includes(niveau)) {
    throw new Error(`Niveau « ${niveau} » non pris en charge (union ou cooperative attendus)`)
  }

  const nomParent =
    getPayloadField(payload, 'C1/nom_union_parente') ??
    getPayloadField(payload, 'nom_union_parente') ??
    null
  const description =
    getPayloadField(payload, 'C1/description') ?? getPayloadField(payload, 'description') ?? null
  const region = getPayloadField(payload, 'C2/region') ?? getPayloadField(payload, 'region') ?? null

  const parsedNom = cooperativeNameSchema.safeParse(nom)
  if (!parsedNom.success) {
    throw new Error(`nom_cooperative invalide : ${parsedNom.error.issues[0]?.message}`)
  }

  const scope = await listScopeCooperativeIds(db, faitiereId)
  const coops = await fetchCooperatives(db, scope)
  const root = coops.find((c) => c.id === faitiereId)
  const faitiereName = root?.faitiere_name ?? root?.name ?? ''

  // ── Parent ──────────────────────────────────────────────────
  let parentId: string = faitiereId
  if (niveau === 'cooperative') {
    const unions = coops.filter((c) => c.level === 'union')
    if (nomParent) {
      const wanted = normalizeName(nomParent)
      const matches = unions.filter((u) => normalizeName(u.name) === wanted)
      if (matches.length !== 1) {
        throw new Error(
          matches.length === 0
            ? `Union parente « ${nomParent} » introuvable dans l'organisation (nom exact requis)`
            : `Plusieurs unions portent le nom « ${nomParent} » dans l'organisation`,
        )
      }
      parentId = (matches[0] as CoopRow).id
    } else if (region) {
      const wanted = normalizeName(region)
      const matches = unions.filter((u) => normalizeName(u.name).includes(wanted))
      if (matches.length === 1) parentId = (matches[0] as CoopRow).id
    }
  }

  // ── Coopérative existante (même nom, dans l'arbre) ──────────
  const wantedName = normalizeName(parsedNom.data)
  const sameName = coops.filter((c) => normalizeName(c.name) === wantedName)
  if (sameName.length > 1) {
    throw new Error(
      `Plusieurs coopératives portent le nom « ${parsedNom.data} » dans l'organisation`,
    )
  }
  const existing = sameName[0] ?? null

  let coopId: string
  if (existing) {
    if (existing.id === faitiereId) {
      throw new Error("L'organisation racine ne peut pas être modifiée par un formulaire")
    }
    if (existing.level !== niveau) {
      throw new Error(
        `« ${existing.name} » existe déjà avec le niveau « ${existing.level} » : le niveau n'est pas modifié par un formulaire`,
      )
    }
    const patch: Row = {}
    if (description) patch.description = description
    const { data: current } = await db
      .from('cooperatives')
      .select('parent_id')
      .eq('id', existing.id)
      .maybeSingle()
    if ((current?.parent_id ?? null) !== parentId) {
      // Jamais de cycle : le nouveau parent ne peut pas être la coopérative elle-même ni l'un de ses descendants.
      const below = await listScopeCooperativeIds(db, existing.id)
      if (below.includes(parentId)) {
        throw new Error(
          'Rattachement impossible : la coopérative deviendrait son propre descendant',
        )
      }
      patch.parent_id = parentId
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await db.from('cooperatives').update(patch).eq('id', existing.id)
      if (error) throw new Error(`Échec mise à jour coopérative : ${error.message}`)
    }
    coopId = existing.id
    log.info('Cooperative updated via KoboCollect', { id: coopId })
  } else {
    const { data: newCoop, error: coopError } = await db
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
      throw new Error(`Échec création coopérative : ${coopError?.message ?? 'Inconnu'}`)
    }
    coopId = newCoop.id
    log.info('Cooperative created via KoboCollect', { id: coopId, niveau })
  }

  const now = new Date().toISOString()
  const { error } = await db
    .from('kobo_submissions')
    .update({
      status: 'matched' as const,
      matched_at: now,
      processed_at: now,
      processed_payload: {
        mode: 'cooperative_registration',
        cooperative_id: coopId,
        cooperative_name: nom,
        niveau,
      } as unknown as Record<string, unknown>,
      error_message: null,
      updated_at: now,
    })
    .eq('id', submissionId)
  if (error) throw new Error(`Mise à jour du statut impossible : ${error.message}`)
}
