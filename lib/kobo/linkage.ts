/**
 * Rapprochement d'une soumission Kobo avec un membre EXISTANT.
 *
 * Périmètre = l'arbre de l'organisation de l'intégration (sémantique de
 * get_accessible_cooperative_ids : un formulaire lié à une faîtière / une union retrouve les
 * membres de toutes ses coopératives filles — avant, la recherche exigeait l'égalité stricte
 * avec la coopérative de l'intégration, donc aucune carte émise dans une coopérative fille
 * n'était retrouvable). Un membre HORS de l'arbre n'est jamais retourné : à un autre tenant,
 * la carte est simplement « introuvable ».
 *
 * Fonctionne avec n'importe quel client Supabase (service_role côté serveur) et reste valable
 * AVANT toute migration : seules des tables et une fonction SQL déjà en production sont lues.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '../security/phone'
import { type MemberKey, type SubmittedName, namesCompatible } from './identity'

type Db = SupabaseClient

/** Taille des lots pour `.in('cooperative_id', …)` (longueur d'URL PostgREST). */
const IN_CHUNK = 100

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Identifiants de la racine ET de tous ses descendants (get_cooperative_descendants). */
export async function listScopeCooperativeIds(db: Db, rootId: string): Promise<string[]> {
  const { data, error } = await db.rpc('get_cooperative_descendants', { p_root_id: rootId })
  if (error) {
    throw new Error(`Lecture de l'arborescence de l'organisation impossible : ${error.message}`)
  }
  const ids = new Set<string>([rootId])
  if (Array.isArray(data)) {
    for (const row of data as Array<string | { id?: unknown }>) {
      const id = typeof row === 'string' ? row : row?.id
      if (typeof id === 'string') ids.add(id)
    }
  }
  return [...ids]
}

export type MemberLink =
  | {
      kind: 'member'
      memberId: string
      /** Coopérative DU MEMBRE (pas celle de l'intégration) : c'est là que vont ses données. */
      cooperativeId: string
      via: 'submission' | 'card' | 'phone'
    }
  /** Aucune personne connue : l'inscription d'un nouveau membre est permise. */
  | { kind: 'none' }
  /** Rapprochement impossible ou ambigu : un humain doit trancher (statut « unmatched » + motif). */
  | { kind: 'unmatched'; reason: string }

export const CARD_NOT_FOUND = 'Carte membre introuvable'

// ---------------------------------------------------------------------------
// Par numéro de carte
// ---------------------------------------------------------------------------

export async function findMemberByCard(
  db: Db,
  scope: ReadonlySet<string>,
  card: string,
): Promise<MemberLink> {
  const { data, error } = await db
    .from('member_cards')
    .select('member_id, cooperative_id, status, card_type')
    .eq('card_number', card)
    .limit(10)
  if (error) throw new Error(`Recherche de la carte impossible : ${error.message}`)

  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter(
    // Seules les cartes de membre (FAITIERE) de l'arbre comptent ; une carte d'un autre tenant est « introuvable ».
    (r) =>
      scope.has(String(r.cooperative_id)) &&
      (r.card_type === undefined || r.card_type === null || r.card_type === 'FAITIERE') &&
      typeof r.member_id === 'string',
  )
  if (rows.length === 0) return { kind: 'unmatched', reason: CARD_NOT_FOUND }

  const members = new Set(rows.map((r) => String(r.member_id)))
  if (members.size > 1) {
    return {
      kind: 'unmatched',
      reason: `Le numéro de carte ${card} est porté par plusieurs membres`,
    }
  }
  const row = rows[0] as Record<string, unknown>
  if (row.status !== 'active') {
    return {
      kind: 'unmatched',
      reason: `La carte ${card} n'est pas active (statut « ${String(row.status)} »)`,
    }
  }
  return {
    kind: 'member',
    memberId: String(row.member_id),
    cooperativeId: String(row.cooperative_id),
    via: 'card',
  }
}

// ---------------------------------------------------------------------------
// Par téléphone (formats mélangés en base : « 92548838 », « +228 92 54 88 38 », « +22892548838 »)
// ---------------------------------------------------------------------------

interface PhoneCandidate {
  id: string
  cooperative_id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
}

export async function findMembersByPhone(
  db: Db,
  scopeIds: readonly string[],
  e164: string,
): Promise<PhoneCandidate[]> {
  const digits = e164.replace(/\D/g, '')
  // Filtre SQL large (les 8 derniers chiffres dans l'ordre, séparateurs quelconques), puis
  // comparaison EXACTE après normalisation côté serveur.
  const tail = digits.slice(-8)
  const pattern = `%${tail.split('').join('%')}%`
  const found = new Map<string, PhoneCandidate>()
  for (const ids of chunk(scopeIds, IN_CHUNK)) {
    const { data, error } = await db
      .from('members')
      .select('id, cooperative_id, first_name, last_name, phone')
      .in('cooperative_id', ids)
      .ilike('phone', pattern)
      .limit(50)
    if (error) throw new Error(`Recherche par téléphone impossible : ${error.message}`)
    for (const row of (data ?? []) as PhoneCandidate[]) {
      if (normalizePhone(row.phone) === e164) found.set(row.id, row)
    }
  }
  return [...found.values()]
}

async function findMemberByPhone(
  db: Db,
  scopeIds: readonly string[],
  e164: string,
  name: SubmittedName,
): Promise<MemberLink> {
  const matches = await findMembersByPhone(db, scopeIds, e164)
  if (matches.length === 0) return { kind: 'none' }
  if (matches.length > 1) {
    return {
      kind: 'unmatched',
      reason: 'Plusieurs membres portent ce numéro de téléphone : rapprochement manuel nécessaire',
    }
  }
  const member = matches[0] as PhoneCandidate
  if (!namesCompatible(name, member)) {
    return {
      kind: 'unmatched',
      reason:
        'Ce numéro de téléphone appartient déjà à un membre portant un autre nom : vérifiez avant de fusionner',
    }
  }
  return { kind: 'member', memberId: member.id, cooperativeId: member.cooperative_id, via: 'phone' }
}

// ---------------------------------------------------------------------------
// Résolution complète
// ---------------------------------------------------------------------------

export interface ResolveInput {
  db: Db
  /** Racine de l'arbre = coopérative de l'intégration. */
  rootCooperativeId: string
  scope: readonly string[]
  key: MemberKey
  name: SubmittedName
  /** member_id déjà porté par la ligne (tentative précédente, ou soumission modifiée). */
  submissionMemberId: string | null
}

function describeInvalid(key: NonNullable<MemberKey['invalid']>): string {
  const raw = key.raw.length > 40 ? `${key.raw.slice(0, 40)}…` : key.raw
  return key.kind === 'card'
    ? `Numéro de carte invalide dans le champ clé (« ${raw} ») : format attendu FEN-123456`
    : `Numéro de téléphone invalide dans le champ clé (« ${raw} »)`
}

/**
 * Ordre : membre déjà lié à la ligne → champ clé invalide (jamais d'inscription) → carte →
 * téléphone → aucun. Une carte renseignée mais introuvable n'inscrit PAS de nouveau membre.
 */
export async function resolveMemberLink(input: ResolveInput): Promise<MemberLink> {
  const { db, scope, key, name } = input
  const scopeSet = new Set(scope)

  if (input.submissionMemberId) {
    const { data, error } = await db
      .from('members')
      .select('id, cooperative_id')
      .eq('id', input.submissionMemberId)
      .maybeSingle()
    if (error) throw new Error(`Lecture du membre impossible : ${error.message}`)
    const row = data as { id: string; cooperative_id: string } | null
    if (row && scopeSet.has(row.cooperative_id)) {
      return {
        kind: 'member',
        memberId: row.id,
        cooperativeId: row.cooperative_id,
        via: 'submission',
      }
    }
  }

  if (key.invalid) return { kind: 'unmatched', reason: describeInvalid(key.invalid) }
  if (key.card) return findMemberByCard(db, scopeSet, key.card)
  if (key.phone) return findMemberByPhone(db, scope, key.phone, name)
  return { kind: 'none' }
}
