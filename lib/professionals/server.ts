/**
 * Cartes professionnelles — adaptateurs serveur (Supabase, e-mails).
 *
 * La logique de décision est dans ./core (pure, testée) ; ce fichier ne fait
 * que la brancher sur la base. Toute écriture passe par le client
 * service_role APRÈS la garde applicative (canValidateProfessional /
 * assertRole('super_admin')).
 */
import 'server-only'
import { emailUser } from '@/lib/email/resend'
import type { AccessContext } from '@/lib/security/assert-access'
import { getPartnerContext } from '@/lib/security/assert-partner-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { generateUniqueCardNumber } from '@/lib/utils/card-number'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type CardIssueStore,
  DOCUMENT_BUCKET,
  DOCUMENT_SIGNED_URL_TTL,
  type DecisionResult,
  type IssueResult,
  type ProfessionalType,
  type ValidationDecision,
  buildProfessionalPublicPayload,
  decideCanValidate,
  isValidFaitiere,
  issueCardWith,
  resolveProfessionalDecision,
} from './core'
import { generateVerifyToken } from './verify-token'

export { generateVerifyToken } from './verify-token'

type AdminClient = ReturnType<typeof createAdminClient>

const PROFILE_TABLE: Record<ProfessionalType, string> = {
  OUVRIER: 'haroo_ouvrier_profiles',
  ACHETEUR: 'haroo_acheteur_profiles',
  AGRONOME: 'haroo_agronome_profiles',
}

const VALIDATE_SCOPE = 'professionals.validate'

// ── Droit de valider ─────────────────────────────────────────────────────────

/**
 * Faîtières sur lesquelles le compte courant détient un mandat actif portant
 * 'professionals.validate'. Candidates lues via les adhésions Partenaire,
 * puis confirmées une à une par has_partner_org_access() — la même fonction
 * que la RLS (certification, statut Partenaire, dates du mandat).
 */
export async function getMandatedFaitiereIds(): Promise<string[]> {
  const partner = await getPartnerContext()
  if (!partner) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('partner_organization_assignments')
    .select('cooperative_id, partner_assignment_scopes!inner(scope)')
    .in('partner_id', partner.partnerIds)
    .eq('status', 'active')
    .eq('partner_assignment_scopes.scope', VALIDATE_SCOPE)
    .returns<{ cooperative_id: string }[]>()
  const candidates = [...new Set((data ?? []).map((r) => r.cooperative_id))]
  const confirmed: string[] = []
  for (const coop of candidates) {
    const { data: ok } = await partner.supabase.rpc('has_partner_org_access', {
      target_coop: coop,
      required_scope: VALIDATE_SCOPE,
    })
    if (ok === true) confirmed.push(coop)
  }
  return confirmed
}

/**
 * super_admin : toujours. Opérateur officier : mandat actif + périmètre
 * 'professionals.validate' sur la faîtière du dossier. Dossier sans faîtière :
 * super_admin uniquement. Pas de hiérarchie union/coopérative (non gérée par
 * has_partner_org_access).
 */
export async function canValidateProfessional(
  ctx: Pick<AccessContext, 'role'> | null,
  faitiereId: string | null,
): Promise<boolean> {
  if (ctx?.role === 'super_admin') return true
  if (!faitiereId) return false
  const mandated = await getMandatedFaitiereIds()
  return decideCanValidate({ role: ctx?.role ?? null, faitiereId, mandatedFaitiereIds: mandated })
}

// ── Faîtières ────────────────────────────────────────────────────────────────

export interface FaitiereOption {
  id: string
  name: string
}

/**
 * Faîtières proposées au rattachement : level='faitiere', non supprimées,
 * hors comptes de démonstration. Pas de colonne de statut sur cooperatives :
 * deleted_at en tient lieu.
 */
export async function listFaitieres(admin: AdminClient): Promise<FaitiereOption[]> {
  const { data } = await admin
    .from('cooperatives')
    .select('id, name')
    .eq('level', 'faitiere')
    .is('deleted_at', null)
    .eq('is_demo', false)
    .order('name')
    .returns<FaitiereOption[]>()
  return data ?? []
}

/** Vrai si l'identifiant désigne une faîtière existante et active. */
export async function isExistingFaitiere(admin: AdminClient, id: string): Promise<boolean> {
  const { data } = await admin
    .from('cooperatives')
    .select('id, level, deleted_at')
    .eq('id', id)
    .maybeSingle<{ id: string; level: string | null; deleted_at: string | null }>()
  return isValidFaitiere(data)
}

// ── Émission ─────────────────────────────────────────────────────────────────

function supabaseIssueStore(admin: AdminClient): CardIssueStore {
  return {
    async getProfile(type, profileId) {
      const cols =
        type === 'AGRONOME'
          ? 'id, user_id, first_name, card_number, statut_validation, profession'
          : 'id, user_id, first_name, card_number'
      const { data } = await admin
        .from(PROFILE_TABLE[type])
        .select(cols)
        .eq('id', profileId)
        .maybeSingle()
      return (data as Awaited<ReturnType<CardIssueStore['getProfile']>>) ?? null
    },
    newCardNumber: (prefix) => generateUniqueCardNumber(admin as SupabaseClient, prefix),
    newVerifyToken: generateVerifyToken,
    async insertCard(row) {
      const { data, error } = await admin
        .from('member_cards')
        .insert({ ...row, status: 'active', cooperative_id: null, member_id: null })
        .select('id')
        .single<{ id: string }>()
      if (error || !data) return { error: error?.message ?? 'Insertion de la carte impossible' }
      return { id: data.id }
    },
    async linkProfile(type, profileId, link) {
      const { error } = await admin
        .from(PROFILE_TABLE[type])
        .update({ ...link, updated_at: new Date().toISOString() })
        .eq('id', profileId)
      return error ? { error: error.message } : {}
    },
    async deleteCard(cardId) {
      await admin.from('member_cards').delete().eq('id', cardId)
    },
  }
}

/**
 * Émet la carte d'un profil professionnel — idempotent : si le profil porte
 * déjà un numéro, rien n'est recréé (`created: false`). Annule la carte si le
 * report sur le profil échoue.
 */
export function issueProfessionalCard(
  admin: AdminClient,
  profileId: string,
  type: ProfessionalType = 'AGRONOME',
): Promise<IssueResult> {
  return issueCardWith(supabaseIssueStore(admin), type, profileId)
}

// ── Notifications (reprises de /api/admin/haroo-cards) ──────────────────────

export function notifyAgronomeDecision(
  userId: string | null,
  decision: ValidationDecision,
  reason: string | null,
): Promise<void> {
  const validated = decision === 'VALIDE'
  return emailUser(
    userId,
    validated ? 'Votre profil agronome est validé' : 'Votre profil agronome n’a pas été validé',
    validated
      ? {
          title: 'Votre profil agronome est validé',
          lines: [
            'Félicitations : FaîtiereHub a validé votre profil d’agronome.',
            'Votre carte professionnelle va être émise. Elle vous permettra de recevoir et d’accepter des missions avec votre code PIN.',
          ],
          cta: { label: 'Ouvrir mon espace', path: '/haroo' },
        }
      : {
          title: 'Votre profil agronome n’a pas été validé',
          lines: [
            'Votre profil d’agronome n’a pas pu être validé pour le moment.',
            ...(reason ? [`Motif : ${reason}`] : []),
            'Complétez votre profil (spécialisations, zone) puis contactez-nous pour une nouvelle vérification.',
          ],
          cta: { label: 'Compléter mon profil', path: '/compte' },
        },
  )
}

export function notifyCardIssued(issued: {
  user_id: string | null
  first_name: string | null
  expiry_date: string | null
}): Promise<void> {
  const until = issued.expiry_date
    ? new Date(`${issued.expiry_date}T00:00:00Z`).toLocaleDateString('fr-FR')
    : null
  return emailUser(issued.user_id, 'Votre carte professionnelle Haroo est prête', {
    title: 'Votre carte professionnelle Haroo est prête',
    lines: [
      `Bonjour ${issued.first_name ?? ''}, votre carte professionnelle a été émise.`,
      ...(until ? [`Elle est valable jusqu’au ${until}.`] : []),
      'Elle est personnelle : ne la confiez à personne.',
    ],
    cta: { label: 'Voir ma carte', path: '/haroo' },
  })
}

// ── Décision ─────────────────────────────────────────────────────────────────

/**
 * Décision VALIDE / REJETE sur un dossier agronome, partagée par
 * /api/professionals/[id]/decision et /api/admin/haroo-cards. `defer` reçoit
 * les envois d'e-mails (typiquement `after` de next/server).
 */
export function decideProfessional(params: {
  ctx: Pick<AccessContext, 'role' | 'userId'>
  profileId: string
  decision: ValidationDecision
  reason?: string | null
  defer: (task: () => Promise<void>) => void
}): Promise<DecisionResult> {
  const admin = createAdminClient()
  return resolveProfessionalDecision(
    {
      async loadProfile(id) {
        const { data } = await admin
          .from('haroo_agronome_profiles')
          .select('id, user_id, faitiere_id, statut_validation')
          .eq('id', id)
          .maybeSingle()
        return data ?? null
      },
      canValidate: (faitiereId) => canValidateProfessional(params.ctx, faitiereId),
      async updateProfile(id, patch) {
        const { error } = await admin.from('haroo_agronome_profiles').update(patch).eq('id', id)
        return error ? { error: error.message } : {}
      },
      issueCard: (id) => issueProfessionalCard(admin, id, 'AGRONOME'),
      notifyDecision: (userId, decision, reason) =>
        params.defer(() => notifyAgronomeDecision(userId, decision, reason)),
      notifyCardIssued: (issued) => params.defer(() => notifyCardIssued(issued)),
    },
    {
      profileId: params.profileId,
      decision: params.decision,
      reason: params.reason,
      actorId: params.ctx.userId,
    },
  )
}

// ── Vérification publique ────────────────────────────────────────────────────

export interface CardRow {
  id: string
  card_number: string
  card_type: string
  status: string
  expiry_date: string | null
  created_at: string | null
  revoked_at: string | null
  suspended_at: string | null
}

export const CARD_PUBLIC_COLUMNS =
  'id, card_number, card_type, status, expiry_date, created_at, revoked_at, suspended_at'

/**
 * Charge utile publique d'une carte AGRONOME (même forme pour /verify/<numéro>
 * et /verify/t/<jeton>). `null` si aucun profil n'est rattaché à la carte.
 */
export async function buildAgronomePublicResponse(admin: AdminClient, card: CardRow) {
  const { data: profile } = await admin
    .from('haroo_agronome_profiles')
    .select(
      'first_name, last_name, photo_url, badge_valide, statut_validation, faitiere_id, profession',
    )
    .eq('card_number', card.card_number)
    .maybeSingle<{
      profession: string | null
      first_name: string | null
      last_name: string | null
      photo_url: string | null
      badge_valide: boolean | null
      statut_validation: string | null
      faitiere_id: string | null
    }>()
  if (!profile) return null

  let faitiereName: string | null = null
  if (profile.faitiere_id) {
    const { data: coop } = await admin
      .from('cooperatives')
      .select('name')
      .eq('id', profile.faitiere_id)
      .maybeSingle<{ name: string | null }>()
    faitiereName = coop?.name ?? null
  }

  return buildProfessionalPublicPayload({
    cardType: 'AGRONOME',
    card,
    profile,
    faitiereName,
  })
}

/**
 * Profil Haroo enrichi servi par AgriTogo (ouvrier / acheteur). `null` si le
 * service est absent, indisponible ou répond autre chose qu'un succès.
 */
export async function fetchAgritogoHarooVerify(cardNumber: string): Promise<unknown | null> {
  const agritogoUrl = process.env.AGRITOGO_API_URL
  if (!agritogoUrl) return null
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(
      `${agritogoUrl}/api/v1/haroo/verify/${encodeURIComponent(cardNumber)}`,
      { signal: controller.signal, headers: { Accept: 'application/json' } },
    )
    return res.ok ? ((await res.json()) as unknown) : null
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

// ── Justificatifs ────────────────────────────────────────────────────────────

export interface ProfessionalDocumentOut {
  id: string
  kind: string
  original_name: string | null
  created_at: string
  /** URL signée courte (DOCUMENT_SIGNED_URL_TTL) — jamais d'URL publique. */
  url: string | null
}

/** Justificatifs d'un titulaire, avec URL de lecture signées (10 min). */
export async function listDocumentsWithSignedUrls(
  admin: AdminClient,
  userId: string,
): Promise<ProfessionalDocumentOut[]> {
  const { data } = await admin
    .from('professional_documents')
    .select('id, kind, storage_path, original_name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .returns<
      {
        id: string
        kind: string
        storage_path: string
        original_name: string | null
        created_at: string
      }[]
    >()
  const rows = data ?? []
  if (rows.length === 0) return []
  const { data: signed } = await admin.storage.from(DOCUMENT_BUCKET).createSignedUrls(
    rows.map((r) => r.storage_path),
    DOCUMENT_SIGNED_URL_TTL,
  )
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    original_name: r.original_name,
    created_at: r.created_at,
    url: byPath.get(r.storage_path) ?? null,
  }))
}
