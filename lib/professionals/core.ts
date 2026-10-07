/**
 * Cartes professionnelles — logique PURE (sans Supabase, sans Next).
 *
 * Tout ce qui décide (statut public d'une carte, droit de valider, charge
 * utile publique, orchestration décision → émission) vit ici, derrière des
 * interfaces injectées, pour être testable sans base (tests/professional-cards.test.ts).
 * Les adaptateurs Supabase sont dans lib/professionals/server.ts.
 *
 * Imports relatifs uniquement : ce fichier est chargé tel quel par node:test.
 */

export type ProfessionalType = 'OUVRIER' | 'ACHETEUR' | 'AGRONOME'
export type ValidationDecision = 'VALIDE' | 'REJETE'
export type ValidationStatus = 'EN_ATTENTE' | 'VALIDE' | 'REJETE'
/** Statut public d'une carte, calculé côté serveur. */
export type CardPublicStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED'

export const CARD_PREFIX: Record<ProfessionalType, string> = {
  OUVRIER: 'OUV',
  ACHETEUR: 'ACH',
  AGRONOME: 'AGR',
}

export const PROFESSION_LABEL: Record<ProfessionalType, string> = {
  OUVRIER: 'Ouvrier agricole',
  ACHETEUR: 'Acheteur agricole',
  AGRONOME: 'Ingénieur agronome',
}

/** 2 ans, comme les cartes FAITIERE par défaut. */
export const CARD_VALIDITY_DAYS = 730

/** Date du jour au format AAAA-MM-JJ (UTC), comparable aux colonnes `date`. */
export function isoDay(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function expiryFrom(now: Date, days = CARD_VALIDITY_DAYS): string {
  const expiry = new Date(now.getTime())
  expiry.setUTCDate(expiry.getUTCDate() + days)
  return isoDay(expiry)
}

// ── Statut de carte ──────────────────────────────────────────────────────────

export interface CardStatusInput {
  status: string
  expiry_date: string | null
  revoked_at?: string | null
  suspended_at?: string | null
}

/**
 * Priorité : révoquée > suspendue > expirée > active. Une révocation est
 * définitive ; une carte suspendue n'est pas « réactivée » par l'expiration.
 * 'pending' (jamais utilisé pour les cartes professionnelles) n'est pas
 * utilisable : traité comme suspendu.
 */
export function computeCardStatus(
  card: CardStatusInput,
  today: Date = new Date(),
): CardPublicStatus {
  if (card.status === 'revoked' || card.revoked_at) return 'REVOKED'
  if (card.status === 'suspended' || card.status === 'pending') return 'SUSPENDED'
  if (card.status === 'expired') return 'EXPIRED'
  if (card.expiry_date && card.expiry_date < isoDay(today)) return 'EXPIRED'
  return 'ACTIVE'
}

export const CARD_STATUS_MESSAGE: Record<CardPublicStatus, string> = {
  ACTIVE: 'Carte valide',
  SUSPENDED: 'Carte suspendue — elle ne doit pas être acceptée pour le moment.',
  REVOKED: 'Carte révoquée — elle n’est plus valable.',
  EXPIRED: 'Carte expirée — son titulaire doit la renouveler.',
}

// ── Profil vérifié ───────────────────────────────────────────────────────────

export function isProfessionalVerified(p: {
  badge_valide: boolean | null
  statut_validation: string | null
}): boolean {
  return p.badge_valide === true && p.statut_validation === 'VALIDE'
}

// ── Charge utile publique ────────────────────────────────────────────────────

export interface PublicPayloadInput {
  cardType: ProfessionalType
  card: CardStatusInput & { card_number: string; created_at: string | null }
  profile: {
    first_name: string | null
    last_name: string | null
    photo_url: string | null
    badge_valide: boolean | null
    statut_validation: string | null
  }
  faitiereName: string | null
}

export interface ProfessionalPublic {
  first_name: string | null
  last_name: string | null
  photo_url: string | null
  profession_label: string
  /** « Agronome certifié » uniquement si vérifié, sinon null. */
  qualification: string | null
  verified: boolean
  /** Conservés pour l'affichage du badge existant. */
  badge_valide: boolean
  statut_validation: string
  faitiere_name: string | null
  card_number: string
  card_status: CardPublicStatus
  valid_from: string | null
  valid_until: string | null
}

export interface ProfessionalPublicPayload {
  valid: boolean
  source: 'haroo'
  card_type: ProfessionalType
  card: {
    card_number: string
    status: string
    public_status: CardPublicStatus
    status_message: string
    expiry_date: string | null
    created_at: string | null
  }
  agronome?: ProfessionalPublic
  professional: ProfessionalPublic
}

/**
 * Projection PUBLIQUE d'une carte professionnelle : liste blanche stricte.
 * Jamais : téléphone, adresse, missions, notes, documents.
 */
export function buildProfessionalPublicPayload(
  input: PublicPayloadInput,
  today: Date = new Date(),
): ProfessionalPublicPayload {
  const status = computeCardStatus(input.card, today)
  const verified = isProfessionalVerified(input.profile)
  const pro: ProfessionalPublic = {
    first_name: input.profile.first_name,
    last_name: input.profile.last_name,
    photo_url: input.profile.photo_url,
    profession_label: PROFESSION_LABEL[input.cardType],
    qualification: verified && input.cardType === 'AGRONOME' ? 'Agronome certifié' : null,
    verified,
    badge_valide: input.profile.badge_valide === true,
    statut_validation: input.profile.statut_validation ?? 'EN_ATTENTE',
    faitiere_name: input.faitiereName,
    card_number: input.card.card_number,
    card_status: status,
    valid_from: input.card.created_at ? input.card.created_at.split('T')[0] : null,
    valid_until: input.card.expiry_date,
  }
  return {
    valid: status === 'ACTIVE',
    source: 'haroo',
    card_type: input.cardType,
    card: {
      card_number: input.card.card_number,
      status: status.toLowerCase(),
      public_status: status,
      status_message: CARD_STATUS_MESSAGE[status],
      expiry_date: input.card.expiry_date,
      created_at: input.card.created_at,
    },
    ...(input.cardType === 'AGRONOME' ? { agronome: pro } : {}),
    professional: pro,
  }
}

// ── Droit de valider ─────────────────────────────────────────────────────────

/**
 * Matrice de décision : super_admin toujours ; sinon il faut une faîtière
 * de rattachement ET un mandat actif portant 'professionals.validate' sur
 * cette faîtière. Pas de hiérarchie : has_partner_org_access() compare
 * strictement la coopérative du mandat.
 */
export function decideCanValidate(params: {
  role: string | null
  faitiereId: string | null
  mandatedFaitiereIds: readonly string[]
}): boolean {
  if (params.role === 'super_admin') return true
  if (!params.faitiereId) return false
  return params.mandatedFaitiereIds.includes(params.faitiereId)
}

// ── Émission de carte (idempotente) ──────────────────────────────────────────

export interface IssueStoreProfile {
  id: string
  user_id: string | null
  first_name: string | null
  card_number: string | null
  statut_validation?: string | null
}

/** Accès aux données nécessaires à l'émission — implémenté sur Supabase ou en mémoire. */
export interface CardIssueStore {
  getProfile(type: ProfessionalType, profileId: string): Promise<IssueStoreProfile | null>
  newCardNumber(prefix: string): Promise<string>
  newVerifyToken(): string
  insertCard(row: {
    card_number: string
    card_type: ProfessionalType
    expiry_date: string
    verify_token: string
  }): Promise<{ id: string } | { error: string }>
  linkProfile(
    type: ProfessionalType,
    profileId: string,
    link: { card_number: string; member_card_id: string },
  ): Promise<{ error?: string }>
  deleteCard(cardId: string): Promise<void>
}

export type IssueResult =
  | {
      ok: true
      created: boolean
      card_number: string
      expiry_date: string | null
      user_id: string | null
      first_name: string | null
    }
  | { ok: false; reason: 'not_found' | 'not_validated' | 'error'; error: string }

export async function issueCardWith(
  store: CardIssueStore,
  type: ProfessionalType,
  profileId: string,
  now: Date = new Date(),
): Promise<IssueResult> {
  const profile = await store.getProfile(type, profileId)
  if (!profile) return { ok: false, reason: 'not_found', error: 'Profil introuvable' }
  if (profile.card_number) {
    // Idempotent : la carte existe déjà, on ne la recrée pas.
    return {
      ok: true,
      created: false,
      card_number: profile.card_number,
      expiry_date: null,
      user_id: profile.user_id,
      first_name: profile.first_name,
    }
  }
  if (type === 'AGRONOME' && profile.statut_validation !== 'VALIDE') {
    return {
      ok: false,
      reason: 'not_validated',
      error: "Le profil agronome doit être validé avant l'émission de la carte",
    }
  }

  const cardNumber = await store.newCardNumber(CARD_PREFIX[type])
  const expiry = expiryFrom(now)
  const inserted = await store.insertCard({
    card_number: cardNumber,
    card_type: type,
    expiry_date: expiry,
    verify_token: store.newVerifyToken(),
  })
  if ('error' in inserted) return { ok: false, reason: 'error', error: inserted.error }

  const linked = await store.linkProfile(type, profileId, {
    card_number: cardNumber,
    member_card_id: inserted.id,
  })
  if (linked.error) {
    // Ne pas laisser une carte orpheline si le report sur le profil échoue.
    await store.deleteCard(inserted.id)
    return { ok: false, reason: 'error', error: linked.error }
  }
  return {
    ok: true,
    created: true,
    card_number: cardNumber,
    expiry_date: expiry,
    user_id: profile.user_id,
    first_name: profile.first_name,
  }
}

// ── Décision de validation ───────────────────────────────────────────────────

export interface DecisionProfile {
  id: string
  user_id: string | null
  faitiere_id: string | null
  statut_validation: string
}

export interface DecisionDeps {
  loadProfile(profileId: string): Promise<DecisionProfile | null>
  canValidate(faitiereId: string | null): Promise<boolean>
  updateProfile(
    profileId: string,
    patch: {
      statut_validation: ValidationDecision
      badge_valide: boolean
      validated_by: string
      validated_at: string
      rejection_reason: string | null
      updated_at: string
    },
  ): Promise<{ error?: string }>
  issueCard(profileId: string): Promise<IssueResult>
  notifyDecision(userId: string | null, decision: ValidationDecision, reason: string | null): void
  notifyCardIssued(result: Extract<IssueResult, { ok: true }>): void
}

export type DecisionResult =
  | {
      ok: true
      decision: ValidationDecision
      card_number: string | null
      card_created: boolean
      card_error?: string
    }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string }

export async function resolveProfessionalDecision(
  deps: DecisionDeps,
  input: {
    profileId: string
    decision: ValidationDecision
    reason?: string | null
    actorId: string
    now?: Date
  },
): Promise<DecisionResult> {
  const reason = input.reason?.trim() || null
  if (input.decision === 'REJETE' && !reason) {
    return { ok: false, status: 400, error: 'Un motif de rejet est requis' }
  }

  const profile = await deps.loadProfile(input.profileId)
  if (!profile) return { ok: false, status: 404, error: 'Dossier introuvable' }

  if (!(await deps.canValidate(profile.faitiere_id))) {
    return { ok: false, status: 403, error: 'Vous n’avez pas de mandat pour valider ce dossier' }
  }

  const now = (input.now ?? new Date()).toISOString()
  const validated = input.decision === 'VALIDE'
  const updated = await deps.updateProfile(profile.id, {
    statut_validation: input.decision,
    badge_valide: validated,
    validated_by: input.actorId,
    validated_at: now,
    rejection_reason: validated ? null : reason,
    updated_at: now,
  })
  if (updated.error) return { ok: false, status: 500, error: updated.error }

  deps.notifyDecision(profile.user_id, input.decision, validated ? null : reason)

  if (!validated) {
    return { ok: true, decision: input.decision, card_number: null, card_created: false }
  }

  // Émission automatique de la carte à la validation (idempotente).
  const issued = await deps.issueCard(profile.id)
  if (!issued.ok) {
    // La validation reste acquise ; l'émission peut être relancée depuis /admin/haroo.
    return {
      ok: true,
      decision: input.decision,
      card_number: null,
      card_created: false,
      card_error: issued.error,
    }
  }
  if (issued.created) deps.notifyCardIssued(issued)
  return {
    ok: true,
    decision: input.decision,
    card_number: issued.card_number,
    card_created: issued.created,
  }
}
