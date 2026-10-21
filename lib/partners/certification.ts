/**
 * Transitions d'état de la certification Opérateur — domaine, pas
 * poignées de clic React (§10 du plan : « Prefer a reusable server/domain
 * function »).
 *
 * Mécanisme pilote (§ pilot-first) : aujourd'hui ces transitions sont
 * déclenchées à la main par un super_admin, faute de moteur d'examen. Le
 * jour où AgriAcademy porte un vrai quiz, il appellera CES MÊMES fonctions
 * plutôt que de dupliquer la logique d'état — d'où leur isolement ici,
 * hors de toute route ou composant.
 *
 * Chaque fonction prend un client déjà privilégié (service_role) : ce
 * module ne fait aucune autorisation lui-même, exactement comme
 * app/api/account/activate-haroo/route.ts fait le contrôle en amont et
 * n'écrit qu'ensuite. Le contrôle super_admin vit dans la route
 * appelante (app/api/admin/partners/[partnerId]/certification/route.ts),
 * jamais ici — un futur appelant (webhook de moteur d'examen, tâche
 * planifiée) aura sa propre autorisation, différente de celle d'un admin.
 */
import 'server-only'
import { statusAfterCertificationPaid } from '@/lib/partners/stage'
import type { PartnerStatus } from '@/types/domain'
import type { Database } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

type AdminClient = SupabaseClient<Database>

export interface CertificationActionResult {
  ok: boolean
  error?: string
  partner_status?: PartnerStatus
  training_completed_at?: string | null
  exam_score?: number | null
  exam_passed_at?: string | null
}

interface CertificationRow {
  training_completed_at: string | null
  exam_score: number | null
  exam_passed_at: string | null
  certified_at: string | null
}

interface PartnerRow {
  status: PartnerStatus
  operator_kind: 'individual' | 'institutional'
}

/**
 * Un opérateur individuel a un seul dossier ; une institution en a un par agent formé. `userId`
 * désigne alors la personne : sans lui, une institution à plusieurs dossiers n'en trouve aucun
 * (jamais « le premier venu »).
 */
async function loadState(admin: AdminClient, partnerId: string, userId?: string) {
  let query = admin
    .from('partner_certifications')
    .select('user_id, training_completed_at, exam_score, exam_passed_at, certified_at')
    .eq('partner_id', partnerId)
  if (userId) query = query.eq('user_id', userId)
  const { data: certification } = await query.maybeSingle<CertificationRow & { user_id: string }>()

  const { data: partner } = await admin
    .from('partners')
    .select('status, operator_kind')
    .eq('id', partnerId)
    .maybeSingle<PartnerRow>()

  return { certification, partner }
}

/** Le statut d'une institution ne suit pas la formation de ses agents : il reste le sien. */
function followsTraining(partner: PartnerRow) {
  return partner.operator_kind !== 'institutional'
}

async function writeAuditLog(
  admin: AdminClient,
  params: {
    validatorId: string | null
    action: string
    partnerId: string
    previousState: Record<string, unknown>
    newState: Record<string, unknown>
    note?: string | null
  },
) {
  // Réutilise l'infrastructure audit_logs existante (§6 du plan) plutôt
  // qu'un second cadre générique — `cooperative_id` reste NULL, un
  // Partenaire n'en a pas.
  await admin.from('audit_logs').insert({
    user_id: params.validatorId,
    action: params.action,
    resource: 'partner_certifications',
    resource_id: params.partnerId,
    // Les états précédent/nouveau sont des objets JSON-sérialisables simples
    // (chaînes, nombres, null) ; `Json` ne modélise pas Record<string, unknown>
    // structurellement, d'où le passage explicite plutôt qu'un `any` implicite.
    details: {
      previous_state: params.previousState,
      new_state: params.newState,
      note: params.note ?? null,
    } as unknown as Database['public']['Tables']['audit_logs']['Insert']['details'],
  })
}

/**
 * Première leçon ouverte : le dossier passe de 'candidate' à 'training', pour que l'espace
 * Opérateur et la console admin disent « Formation en cours » (ce statut n'était écrit nulle
 * part). Aucun autre statut n'est touché ; idempotent.
 */
export async function markPartnerTrainingStarted(
  admin: AdminClient,
  params: { partnerId: string; learnerId: string },
): Promise<CertificationActionResult> {
  const { partner } = await loadState(admin, params.partnerId, params.learnerId)
  if (!partner) return { ok: false, error: 'Candidature Opérateur introuvable' }
  if (partner.status !== 'candidate' || !followsTraining(partner))
    return { ok: true, partner_status: partner.status }
  const now = new Date().toISOString()
  const { error } = await admin
    .from('partners')
    .update({ status: 'training', updated_at: now })
    .eq('id', params.partnerId)
    .eq('status', 'candidate')
  if (error) return { ok: false, error: 'Écriture impossible' }
  await writeAuditLog(admin, {
    validatorId: params.learnerId,
    action: 'partner_training_started',
    partnerId: params.partnerId,
    previousState: { status: 'candidate' },
    newState: { status: 'training' },
    note: 'Première leçon ouverte par la personne',
  })
  return { ok: true, partner_status: 'training' }
}

/**
 * Marque la formation comme terminée. Idempotent : un second appel ne
 * réécrit pas `training_completed_at` s'il est déjà posé (la date de
 * complétion réelle ne doit pas glisser à chaque re-clic), mais consigne
 * quand même la tentative dans le journal d'audit.
 *
 * Fait avancer `partners.status` de 'candidate'/'training' vers
 * 'exam_pending' — jamais en arrière, jamais au-delà.
 */
export async function markPartnerTrainingCompleted(
  admin: AdminClient,
  params: { partnerId: string; validatorId: string; note?: string; userId?: string },
): Promise<CertificationActionResult> {
  const { certification, partner } = await loadState(admin, params.partnerId, params.userId)
  if (!certification || !partner) {
    return { ok: false, error: 'Candidature Opérateur introuvable' }
  }

  const alreadyCompleted = !!certification.training_completed_at
  const now = new Date().toISOString()

  if (!alreadyCompleted) {
    const { error } = await admin
      .from('partner_certifications')
      .update({ training_completed_at: now, updated_at: now })
      .eq('partner_id', params.partnerId)
      .eq('user_id', certification.user_id)
    if (error) return { ok: false, error: 'Écriture impossible' }
  }

  const nextStatus: PartnerStatus =
    followsTraining(partner) && (partner.status === 'candidate' || partner.status === 'training')
      ? 'exam_pending'
      : partner.status
  if (nextStatus !== partner.status) {
    await admin
      .from('partners')
      .update({ status: nextStatus, updated_at: now })
      .eq('id', params.partnerId)
  }

  await writeAuditLog(admin, {
    validatorId: params.validatorId,
    action: alreadyCompleted ? 'partner_training_reconfirmed' : 'partner_training_completed',
    partnerId: params.partnerId,
    previousState: {
      training_completed_at: certification.training_completed_at,
      status: partner.status,
    },
    newState: {
      training_completed_at: certification.training_completed_at ?? now,
      status: nextStatus,
    },
    note: params.note,
  })

  return {
    ok: true,
    training_completed_at: certification.training_completed_at ?? now,
    partner_status: nextStatus,
  }
}

/**
 * Enregistre un résultat d'examen. PAS idempotent au sens d'un no-op : un
 * candidat peut être réévalué (§5 du plan), la dernière évaluation fait foi.
 * `exam_passed_at` n'est posé QUE si le score atteint le seuil configuré
 * (`platform_settings.partner_exam_passing_score`) — jamais déduit de la
 * seule présence d'un score.
 */
export async function recordPartnerExamResult(
  admin: AdminClient,
  params: {
    partnerId: string
    validatorId: string
    examScore: number
    note?: string
    userId?: string
  },
): Promise<CertificationActionResult> {
  if (!Number.isInteger(params.examScore) || params.examScore < 0 || params.examScore > 100) {
    return { ok: false, error: 'Le score doit être un entier entre 0 et 100' }
  }

  const { certification, partner } = await loadState(admin, params.partnerId, params.userId)
  if (!certification || !partner) {
    return { ok: false, error: 'Candidature Opérateur introuvable' }
  }

  const { data: setting } = await admin
    .from('platform_settings')
    .select('value')
    .eq('key', 'partner_exam_passing_score')
    .maybeSingle<{ value: number }>()
  const threshold = typeof setting?.value === 'number' ? setting.value : 70

  const now = new Date().toISOString()
  const passed = params.examScore >= threshold
  const examPassedAt = passed ? now : null

  const { error } = await admin
    .from('partner_certifications')
    .update({ exam_score: params.examScore, exam_passed_at: examPassedAt, updated_at: now })
    .eq('partner_id', params.partnerId)
    .eq('user_id', certification.user_id)
  if (error) return { ok: false, error: 'Écriture impossible' }

  await writeAuditLog(admin, {
    validatorId: params.validatorId,
    action: passed ? 'partner_exam_passed' : 'partner_exam_failed',
    partnerId: params.partnerId,
    previousState: {
      exam_score: certification.exam_score,
      exam_passed_at: certification.exam_passed_at,
    },
    newState: { exam_score: params.examScore, exam_passed_at: examPassedAt, threshold },
    note: params.note,
  })

  // Formation déjà soldée (PAYG, en une fois ou en tranches) : l'évaluation réussie certifie.
  if (passed && !certification.certified_at) {
    const { data: account } = await admin
      .from('training_fee_accounts')
      .select('status')
      .eq('user_id', certification.user_id)
      .maybeSingle()
    if (account?.status === 'paid' || account?.status === 'waived') {
      await recordCertificationFeePaid(admin, {
        partnerId: params.partnerId,
        userId: certification.user_id,
        validatorId: params.validatorId,
        method: 'training',
        note: 'Formation soldée avant l’évaluation',
      })
    }
  }

  return { ok: true, exam_score: params.examScore, exam_passed_at: examPassedAt }
}

/**
 * Enregistre les frais de certification comme réglés : `certified_at` est posé et le dossier
 * passe en 'certified'. Deux appelants : le paiement FedaPay confirmé
 * (lib/partners/certification-payment.ts) et, en secours, un super_admin qui a constaté un
 * règlement hors ligne. Exige une évaluation réussie ; idempotent (la date de règlement ne
 * glisse pas) ; ne fait jamais reculer un dossier déjà actif, suspendu ou retiré.
 */
export async function recordCertificationFeePaid(
  admin: AdminClient,
  params: {
    partnerId: string
    validatorId: string | null
    /**
     * fedapay : frais réglés d'un coup sur FedaPay ; training : compte de formation soldé
     * (tranches FedaPay). Aucun règlement ne s'enregistre à la main.
     */
    method: 'fedapay' | 'training'
    note?: string
    userId?: string
  },
): Promise<CertificationActionResult> {
  const { certification, partner } = await loadState(admin, params.partnerId, params.userId)
  if (!certification || !partner) {
    return { ok: false, error: 'Candidature Opérateur introuvable' }
  }
  if (!certification.exam_passed_at) {
    return { ok: false, error: 'L’évaluation pratique doit être réussie avant les frais' }
  }
  if (certification.certified_at) return { ok: true, partner_status: partner.status }

  const now = new Date().toISOString()
  const { data: written, error } = await admin
    .from('partner_certifications')
    .update({ certified_at: now, updated_at: now })
    .eq('partner_id', params.partnerId)
    .eq('user_id', certification.user_id)
    .is('certified_at', null)
    .select('partner_id')
  if (error) return { ok: false, error: 'Écriture impossible' }
  // Un appel concurrent a déjà enregistré le règlement : rien d'autre à faire.
  if (!written?.length) return { ok: true, partner_status: partner.status }

  // Le compte de formation PAYG suit : frais réglés d'un coup = compte soldé (sans doublon).
  if (params.method !== 'training') {
    const { data: account } = await admin
      .from('training_fee_accounts')
      .select('id, total_fcfa, paid_fcfa')
      .eq('user_id', certification.user_id)
      .maybeSingle()
    if (account && account.paid_fcfa < account.total_fcfa) {
      await admin.rpc('payg_record_training_payment', {
        p_account_id: account.id,
        p_amount_fcfa: account.total_fcfa - account.paid_fcfa,
        p_method: 'certification',
        p_idempotency_key: `certification:${certification.user_id}`,
        p_actor: params.validatorId as string,
        p_reference: params.note as string,
      })
    }
  }

  const nextStatus = followsTraining(partner)
    ? statusAfterCertificationPaid(partner.status)
    : partner.status
  if (nextStatus !== partner.status) {
    await admin
      .from('partners')
      .update({ status: nextStatus, updated_at: now })
      .eq('id', params.partnerId)
  }

  await writeAuditLog(admin, {
    validatorId: params.validatorId,
    action: 'partner_certification_paid',
    partnerId: params.partnerId,
    previousState: { certified_at: null, status: partner.status },
    newState: { certified_at: now, status: nextStatus, method: params.method },
    note: params.note,
  })

  return { ok: true, partner_status: nextStatus }
}

/**
 * Active un Partenaire déjà certifié (paiement réglé). Volontairement
 * distinct de `certified_at` (§8 du plan) : la certification atteste que
 * les frais sont réglés, l'activation ouvre l'usage réel — un futur produit
 * pourrait vouloir un contrôle supplémentaire entre les deux (vérification
 * d'identité, formation continue…) sans changer ce module.
 */
export async function activatePartnerOperator(
  admin: AdminClient,
  params: { partnerId: string; validatorId: string; note?: string; userId?: string },
): Promise<CertificationActionResult> {
  const { certification, partner } = await loadState(admin, params.partnerId, params.userId)
  if (!certification || !partner) {
    return { ok: false, error: 'Candidature Opérateur introuvable' }
  }
  if (!certification.certified_at) {
    return { ok: false, error: 'La certification (paiement) doit être réglée avant activation' }
  }
  if (partner.status === 'active') {
    return { ok: true, partner_status: 'active' }
  }

  const now = new Date().toISOString()
  const { error } = await admin
    .from('partners')
    .update({ status: 'active', updated_at: now })
    .eq('id', params.partnerId)
  if (error) return { ok: false, error: 'Écriture impossible' }

  await writeAuditLog(admin, {
    validatorId: params.validatorId,
    action: 'partner_activated',
    partnerId: params.partnerId,
    previousState: { status: partner.status },
    newState: { status: 'active' },
    note: params.note,
  })

  // PAYG : 10 crédits offerts à l'ouverture, une seule fois par opérateur.
  await admin.rpc('payg_grant_welcome_credits', {
    p_partner_id: params.partnerId,
    p_actor: params.validatorId,
  })

  return { ok: true, partner_status: 'active' }
}
