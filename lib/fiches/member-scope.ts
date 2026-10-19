/**
 * Gratuité « membres » d'un compte d'exploitation — décision du propriétaire :
 *
 * - Fiche d'une FAÎTIÈRE (`cooperative_id` = la faîtière) : gratuite seulement
 *   pour une carte de coopérative ACTIVE rattachée à SON arbre (la faîtière,
 *   ses unions, leurs coopératives). Tous les autres paient `price_non_member`.
 * - Fiche de la PLATEFORME (`cooperative_id` NULL, « Vendu par FaîtiereHub ») :
 *   gratuite pour toute carte active.
 * - « Membre » = carte ACTIVE : statut `active`, non supprimée, non expirée, ni
 *   suspendue ni révoquée, et titulaire lui-même actif (`members.status`),
 *   toujours dans la coopérative de sa carte.
 * - Gratuit pour le TITULAIRE seulement : session de carte (code SMS), ou compte
 *   qui possède le membre (mêmes conditions que `private.owns_member`). Pouvoir
 *   LIRE une carte (administrateur, partenaire) ne donne pas sa gratuité.
 * - Carte professionnelle Haroo (OUVRIER / ACHETEUR / AGRONOME) : son titulaire
 *   n'est pas membre d'une coopérative, jamais gratuit sur une fiche de faîtière.
 *
 * Tout est relu par le client de service, jamais d'après le client. Une lecture
 * en erreur, une chaîne de coopératives qui boucle, trop longue ou rompue
 * (coopérative absente ou supprimée) vaut REFUS.
 */
import 'server-only'
import { computeCardStatus } from '@/lib/professionals/core'
import { normalizedCardNumber } from '@/lib/security/card-number'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'

const log = createLogger('fiches:member-scope')

type Db = ReturnType<typeof createAdminClient>

/** Faîtière → union → coopérative = 3 niveaux ; au-delà de 6, la donnée est fausse. */
export const MAX_COOPERATIVE_DEPTH = 6

/** Seul type de carte qui fait de son titulaire le membre d'une coopérative. */
export const COOPERATIVE_CARD_TYPE = 'FAITIERE'

/** Profil du titulaire d'une carte professionnelle Haroo (lié par `member_card_id`). */
const HAROO_PROFILE_TABLE: Record<string, string> = {
  OUVRIER: 'haroo_ouvrier_profiles',
  ACHETEUR: 'haroo_acheteur_profiles',
  AGRONOME: 'haroo_agronome_profiles',
}

/**
 * Qui présente la carte, d'après requirePrivateCard. `card` : session de carte
 * (code SMS), déjà liée au titulaire `card.member_id`. `account` : compte
 * connecté qui peut LIRE la carte — titulaire, mais aussi administrateur ou
 * partenaire ; il faut donc vérifier qu'il possède le membre.
 */
export type CardCaller =
  | { via: 'card' }
  | { via: 'account'; userId: string; email: string | null; emailConfirmed: boolean }

/** Le CardCaller d'un résultat de requirePrivateCard ; null = inconnu (refus). */
export function cardCallerOf(access: {
  via?: 'account' | 'card'
  user?: { id: string; email: string | null; emailConfirmed: boolean } | null
}): CardCaller | null {
  if (access.via === 'card') return { via: 'card' }
  if (access.via === 'account' && access.user) {
    return {
      via: 'account',
      userId: access.user.id,
      email: access.user.email,
      emailConfirmed: access.user.emailConfirmed,
    }
  }
  return null
}

export interface MemberFreeFiche {
  is_free_for_members: boolean
  /** NULL = fiche de la plateforme. */
  cooperative_id: string | null
}

export type CardScope =
  | { ok: true; cardType: string; cooperativeId: string | null }
  | { ok: false; reason: 'card_inactive' | 'card_outdated' | 'not_holder' | 'lookup_failed' }

export type ChainResult =
  | { ok: true; ids: string[] }
  | { ok: false; reason: 'broken' | 'lookup_failed' }

export interface MemberScope {
  card: CardScope
  /** Coopérative de la carte et ses ancêtres ; null = non lue (inutile ou impossible). */
  chain: ChainResult | null
}

export type DenialReason =
  | 'not_member_free'
  | 'card_inactive'
  | 'card_outdated'
  | 'not_holder'
  | 'pro_card'
  | 'other_tree'
  | 'broken_chain'
  | 'lookup_failed'

export type MemberFreeVerdict = { free: true } | { free: false; reason: DenialReason }

export type MemberFreeDecision =
  | { free: true }
  | { free: false; reason: DenialReason; message: string }

interface CoopLink {
  id: string
  parent_id: string | null
  deleted_at: string | null
}

interface CardRow {
  id: string
  card_type: string
  member_id: string | null
  cooperative_id: string | null
  status: string
  expiry_date: string | null
  revoked_at: string | null
  suspended_at: string | null
}

/**
 * La coopérative et ses ancêtres par `parent_id`, jusqu'à la racine. Refus
 * (`broken`) si un maillon manque ou est supprimé, si la chaîne boucle ou
 * dépasse MAX_COOPERATIVE_DEPTH ; `lookup_failed` sur une erreur de lecture.
 */
export async function cooperativeChain(db: Db, cooperativeId: string): Promise<ChainResult> {
  const ids: string[] = []
  let cursor: string | null = cooperativeId
  while (cursor) {
    if (ids.includes(cursor) || ids.length >= MAX_COOPERATIVE_DEPTH) {
      return { ok: false, reason: 'broken' }
    }
    const { data, error }: { data: CoopLink | null; error: unknown } = await db
      .from('cooperatives')
      .select('id, parent_id, deleted_at')
      .eq('id', cursor)
      .maybeSingle<CoopLink>()
    if (error) return { ok: false, reason: 'lookup_failed' }
    if (!data || data.deleted_at) return { ok: false, reason: 'broken' }
    ids.push(data.id)
    cursor = data.parent_id
  }
  return { ok: true, ids }
}

interface MemberRow {
  status: string
  deleted_at: string | null
  cooperative_id: string | null
  email: string | null
}

const sameEmail = (a: string | null, b: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Le compte possède-t-il ce membre ? Mêmes conditions que `private.owns_member`
 * (RLS) : e-mail confirmé égal à celui du membre, profil `member` non supprimé
 * de la même coopérative. Lu par le client de service.
 */
async function accountOwnsMember(
  db: Db,
  caller: Extract<CardCaller, { via: 'account' }>,
  member: MemberRow,
): Promise<boolean | 'lookup_failed'> {
  if (!caller.emailConfirmed || !sameEmail(caller.email, member.email)) return false
  const { data: profile, error } = await db
    .from('profiles')
    .select('role, cooperative_id, deleted_at')
    .eq('id', caller.userId)
    .maybeSingle<{
      role: string | null
      cooperative_id: string | null
      deleted_at: string | null
    }>()
  if (error) return 'lookup_failed'
  return (
    !!profile &&
    !profile.deleted_at &&
    profile.role === 'member' &&
    !!member.cooperative_id &&
    profile.cooperative_id === member.cooperative_id
  )
}

/** Le compte est-il le professionnel à qui la carte Haroo a été émise ? */
async function accountHoldsProCard(
  db: Db,
  caller: Extract<CardCaller, { via: 'account' }>,
  card: CardRow,
): Promise<boolean | 'lookup_failed'> {
  const table = HAROO_PROFILE_TABLE[card.card_type]
  if (!table) return false
  const { data, error } = await db
    .from(table)
    .select('user_id')
    .eq('user_id', caller.userId)
    .eq('member_card_id', card.id)
    .maybeSingle<{ user_id: string }>()
  if (error) return 'lookup_failed'
  return !!data
}

/**
 * Relit la carte ET son titulaire. `memberId` est celui que le contrôle d'accès
 * (requirePrivateCard) vient d'autoriser : une carte qui a changé de titulaire
 * entre-temps est refusée. `caller` : seul le titulaire passe (voir CardCaller).
 */
export async function loadCardScope(
  db: Db,
  cardNumber: string,
  memberId: string | null,
  caller: CardCaller | null,
): Promise<CardScope> {
  const number = normalizedCardNumber(cardNumber)
  if (!number) return { ok: false, reason: 'card_inactive' }

  const { data: card, error } = await db
    .from('member_cards')
    .select(
      'id, card_type, member_id, cooperative_id, status, expiry_date, revoked_at, suspended_at',
    )
    .eq('card_number', number)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle<CardRow>()
  if (error) return { ok: false, reason: 'lookup_failed' }
  if (
    !card ||
    card.status !== 'active' ||
    card.suspended_at ||
    computeCardStatus(card) !== 'ACTIVE' ||
    (card.member_id ?? null) !== (memberId ?? null)
  ) {
    return { ok: false, reason: 'card_inactive' }
  }

  let holder: boolean | 'lookup_failed'
  if (card.member_id) {
    const { data: member, error: memberError } = await db
      .from('members')
      .select('status, deleted_at, cooperative_id, email')
      .eq('id', card.member_id)
      .maybeSingle<MemberRow>()
    if (memberError) return { ok: false, reason: 'lookup_failed' }
    if (!member || member.deleted_at || member.status !== 'active') {
      return { ok: false, reason: 'card_inactive' }
    }
    // Membre changé de coopérative sans nouvelle carte : la carte ne dit plus
    // à quel arbre il appartient. Pas de gratuité avant sa réémission.
    if ((member.cooperative_id ?? null) !== (card.cooperative_id ?? null)) {
      return { ok: false, reason: 'card_outdated' }
    }
    holder =
      caller?.via === 'card'
        ? true
        : caller?.via === 'account'
          ? await accountOwnsMember(db, caller, member)
          : false
  } else if (card.card_type === COOPERATIVE_CARD_TYPE) {
    // Carte de coopérative sans titulaire : interdit par la base, refusé ici aussi.
    return { ok: false, reason: 'card_inactive' }
  } else {
    // Carte Haroo : pas de session de carte possible ; un compte doit être son titulaire.
    holder = caller?.via === 'account' ? await accountHoldsProCard(db, caller, card) : false
  }
  if (holder === 'lookup_failed') return { ok: false, reason: 'lookup_failed' }
  if (!holder) return { ok: false, reason: 'not_holder' }

  return { ok: true, cardType: card.card_type, cooperativeId: card.cooperative_id }
}

/**
 * Carte connue mais plus active (suspendue, révoquée, expirée) : vrai. Inconnue,
 * active, ou lecture impossible : faux. Sert à répondre « achetez-le » plutôt
 * que d'envoyer vers une connexion par carte vouée à l'échec. N'apprend rien de
 * plus que la page publique de scan, qui affiche déjà l'état de la carte.
 */
export async function isKnownInactiveCard(cardNumber: string): Promise<boolean> {
  const number = normalizedCardNumber(cardNumber)
  if (!number) return false
  try {
    const { data, error } = await createAdminClient()
      .from('member_cards')
      .select('status, expiry_date, revoked_at, suspended_at')
      .eq('card_number', number)
      .is('deleted_at', null)
      .maybeSingle<Pick<CardRow, 'status' | 'expiry_date' | 'revoked_at' | 'suspended_at'>>()
    if (error || !data) return false
    return !!data.suspended_at || computeCardStatus(data) !== 'ACTIVE'
  } catch {
    return false
  }
}

/**
 * Carte + chaîne de coopératives, par le client de service. `withChain` : la
 * chaîne ne sert qu'aux fiches de faîtière (inutile pour la plateforme).
 */
export async function loadMemberScope(
  cardNumber: string,
  opts: { memberId: string | null; withChain: boolean; caller: CardCaller | null },
): Promise<MemberScope> {
  try {
    const db = createAdminClient()
    const card = await loadCardScope(db, cardNumber, opts.memberId, opts.caller)
    const chain =
      card.ok && opts.withChain && card.cardType === COOPERATIVE_CARD_TYPE && card.cooperativeId
        ? await cooperativeChain(db, card.cooperativeId)
        : null
    if (card.ok && chain && !chain.ok && chain.reason === 'broken') {
      // Donnée à corriger par un administrateur : un maillon manque, est
      // supprimé, ou la chaîne boucle / est trop longue.
      log.error('Cooperative chain broken, member-free refused', {
        cooperativeId: card.cooperativeId,
      })
    }
    return { card, chain }
  } catch {
    return { card: { ok: false, reason: 'lookup_failed' }, chain: null }
  }
}

/** La règle, sans accès à la base. Tout cas non prévu est un refus. */
export function memberFreeVerdict(fiche: MemberFreeFiche, scope: MemberScope): MemberFreeVerdict {
  if (!fiche.is_free_for_members) return { free: false, reason: 'not_member_free' }
  if (!scope.card.ok) return { free: false, reason: scope.card.reason }
  // Fiche de la plateforme : toute carte active.
  if (!fiche.cooperative_id) return { free: true }
  // Fiche d'une faîtière : carte de coopérative de SON arbre uniquement.
  if (scope.card.cardType !== COOPERATIVE_CARD_TYPE) return { free: false, reason: 'pro_card' }
  if (!scope.chain) return { free: false, reason: 'other_tree' }
  if (!scope.chain.ok) {
    return {
      free: false,
      reason: scope.chain.reason === 'lookup_failed' ? 'lookup_failed' : 'broken_chain',
    }
  }
  return scope.chain.ids.includes(fiche.cooperative_id)
    ? { free: true }
    : { free: false, reason: 'other_tree' }
}

/** Message de la réponse 402 : dit pourquoi, et renvoie vers l'achat. */
export function memberFreeDenialMessage(reason: DenialReason, sellerName: string | null): string {
  switch (reason) {
    case 'not_member_free':
      return 'Cette fiche n’est pas gratuite pour les membres : achetez-la ci-dessus.'
    case 'card_inactive':
      return 'Votre carte ou votre adhésion n’est pas active : ce compte n’est pas gratuit pour vous. Achetez-le pour le télécharger.'
    case 'card_outdated':
      return 'Votre carte ne correspond plus à votre coopérative : demandez une nouvelle carte, ou achetez ce compte.'
    case 'not_holder':
      return 'Ce compte est gratuit pour le titulaire de la carte uniquement. Achetez-le pour le télécharger.'
    case 'lookup_failed':
      return 'Vérification de votre carte impossible pour le moment. Réessayez dans un instant, ou achetez ce compte.'
    case 'broken_chain':
      return `Rattachement de votre coopérative incomplet : impossible de vérifier que vous êtes membre de ${sellerName ?? 'sa faîtière'}. Contactez votre coopérative, ou achetez ce compte.`
    case 'pro_card':
    case 'other_tree':
      return `Ce compte est gratuit pour les membres de ${sellerName ?? 'sa faîtière'} uniquement. Achetez-le pour le télécharger.`
  }
}

async function sellerName(cooperativeId: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient()
      .from('cooperatives')
      .select('name')
      .eq('id', cooperativeId)
      .maybeSingle<{ name: string | null }>()
    return data?.name ?? null
  } catch {
    return null
  }
}

/** Refus dont le message nomme la faîtière vendeuse. */
const NAMES_SELLER: ReadonlySet<DenialReason> = new Set(['other_tree', 'pro_card', 'broken_chain'])

/**
 * Décision complète pour UNE fiche et UNE carte déjà contrôlée par
 * requirePrivateCard (`memberId` = son `card.member_id`, `caller` = qui la présente).
 */
export async function decideMemberFree(
  fiche: MemberFreeFiche,
  cardNumber: string,
  memberId: string | null,
  caller: CardCaller | null,
): Promise<MemberFreeDecision> {
  const scope: MemberScope = fiche.is_free_for_members
    ? await loadMemberScope(cardNumber, { memberId, withChain: !!fiche.cooperative_id, caller })
    : { card: { ok: false, reason: 'card_inactive' }, chain: null }
  const verdict = memberFreeVerdict(fiche, scope)
  if (verdict.free) return verdict
  const named =
    NAMES_SELLER.has(verdict.reason) && fiche.cooperative_id
      ? await sellerName(fiche.cooperative_id)
      : null
  return {
    free: false,
    reason: verdict.reason,
    message: memberFreeDenialMessage(verdict.reason, named),
  }
}
