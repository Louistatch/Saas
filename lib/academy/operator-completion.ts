import 'server-only'
/**
 * Lien entre la formation (AgriAcademy) et le dossier Opérateur (certification) — C1 et C2 de
 * l'audit du parcours opérateur.
 *
 *   première leçon ouverte            → partners.status 'candidate' → 'training'
 *   toutes les leçons validées        → partner_certifications.training_completed_at posé,
 *                                       partners.status → 'exam_pending' (fonction de
 *                                       certification existante, journal d'audit), puis
 *                                       e-mails à la personne et aux super_admins.
 *
 * Tout est dérivé de la base, jamais d'un état envoyé par le client ; chaque fonction est
 * rejouable : un second appel ne change rien et ne renvoie pas d'e-mail (la transition n'est
 * signalée que lorsque `training_completed_at` passe de NULL à une date). L'évaluation pratique
 * et le paiement restent des étapes distinctes : rien ici ne certifie personne.
 */
import { countCompletedLessons } from '@/lib/academy/operator-training'
import {
  markPartnerTrainingCompleted,
  markPartnerTrainingStarted,
} from '@/lib/partners/certification'
import type { Database } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isModuleCompleted } from './completion-policy'

type AdminClient = SupabaseClient<Database>

interface Dossier {
  partnerId: string
  partnerCode: string
  displayName: string
  trainingCompletedAt: string | null
}

async function loadDossier(admin: AdminClient, profileId: string): Promise<Dossier | null> {
  const { data } = await admin
    .from('partner_certifications')
    .select('partner_id, training_completed_at, partners(partner_code, display_name)')
    .eq('user_id', profileId)
    .not('partner_id', 'is', null)
    .maybeSingle<{
      partner_id: string
      training_completed_at: string | null
      partners: { partner_code: string; display_name: string } | null
    }>()
  if (!data?.partner_id) return null
  return {
    partnerId: data.partner_id,
    partnerCode: data.partners?.partner_code ?? '',
    displayName: data.partners?.display_name ?? '',
    trainingCompletedAt: data.training_completed_at,
  }
}

/** À l'ouverture d'une leçon : un dossier encore 'candidate' passe en 'training'. */
export async function noteOperatorLearningStarted(admin: AdminClient, profileId: string) {
  const dossier = await loadDossier(admin, profileId)
  if (!dossier) return
  await markPartnerTrainingStarted(admin, { partnerId: dossier.partnerId, learnerId: profileId })
}

export interface TrainingSettlement {
  lessonsCompleted: number
  lessonsTotal: number
  trainingCompleted: boolean
  /** Vrai seulement la fois où la date de fin de formation vient d'être posée. */
  newlyCompleted: boolean
  dossier: Dossier | null
}

/**
 * Après une preuve nouvelle (quiz réussi, devoir déposé) : si toutes les leçons sont validées,
 * enregistre la fin de formation sur le dossier. Ne renvoie `newlyCompleted` qu'une seule fois.
 */
export async function settleOperatorTraining(
  admin: AdminClient,
  profileId: string,
  moduleId: string,
): Promise<TrainingSettlement> {
  const { completed, total } = await countCompletedLessons(admin, profileId, moduleId)
  const dossier = await loadDossier(admin, profileId)
  const base = { lessonsCompleted: completed, lessonsTotal: total, dossier }
  if (!isModuleCompleted(completed, total) || !dossier) {
    return {
      ...base,
      trainingCompleted: Boolean(dossier?.trainingCompletedAt),
      newlyCompleted: false,
    }
  }
  if (dossier.trainingCompletedAt)
    return { ...base, trainingCompleted: true, newlyCompleted: false }
  const result = await markPartnerTrainingCompleted(admin, {
    partnerId: dossier.partnerId,
    validatorId: profileId,
    note: `Automatique : ${completed} leçons sur ${total} validées en ligne`,
  })
  return { ...base, trainingCompleted: result.ok, newlyCompleted: result.ok }
}
