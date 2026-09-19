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
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { PartnerStatus } from '@/types/domain'

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
}

async function loadState(admin: AdminClient, partnerId: string) {
  const { data: certification } = await admin
    .from('partner_certifications')
    .select('training_completed_at, exam_score, exam_passed_at, certified_at')
    .eq('partner_id', partnerId)
    .maybeSingle<CertificationRow>()

  const { data: partner } = await admin
    .from('partners')
    .select('status')
    .eq('id', partnerId)
    .maybeSingle<PartnerRow>()

  return { certification, partner }
}

async function writeAuditLog(
  admin: AdminClient,
  params: {
    validatorId: string
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
  params: { partnerId: string; validatorId: string; note?: string },
): Promise<CertificationActionResult> {
  const { certification, partner } = await loadState(admin, params.partnerId)
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
    if (error) return { ok: false, error: 'Écriture impossible' }
  }

  const nextStatus: PartnerStatus =
    partner.status === 'candidate' || partner.status === 'training'
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
  params: { partnerId: string; validatorId: string; examScore: number; note?: string },
): Promise<CertificationActionResult> {
  if (!Number.isInteger(params.examScore) || params.examScore < 0 || params.examScore > 100) {
    return { ok: false, error: 'Le score doit être un entier entre 0 et 100' }
  }

  const { certification, partner } = await loadState(admin, params.partnerId)
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

  return { ok: true, exam_score: params.examScore, exam_passed_at: examPassedAt }
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
  params: { partnerId: string; validatorId: string; note?: string },
): Promise<CertificationActionResult> {
  const { certification, partner } = await loadState(admin, params.partnerId)
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

  return { ok: true, partner_status: 'active' }
}
