import type { PartnerStatus } from '@/types/domain'

/**
 * Où en est un dossier Opérateur, tel qu'on l'affiche. Pur.
 *
 * Le statut seul ne suffit pas : l'évaluation réussie laisse le dossier en `exam_pending`
 * (seule la date exam_passed_at le dit), et `certified` veut dire « frais réglés », en attente
 * d'activation. Sans ces nuances, la page annonçait encore l'évaluation à venir à qui l'avait
 * réussie, et demandait les frais à qui les avait déjà payés.
 */
export type OperatorStage = PartnerStatus | 'exam_passed'

export function operatorStage(s: {
  status: PartnerStatus
  exam_passed_at?: string | null
  certified_at?: string | null
}): OperatorStage {
  if (s.status === 'exam_pending' && s.exam_passed_at && !s.certified_at) return 'exam_passed'
  return s.status
}

/** Étape en cours dans le parcours (1 Candidature … 5 Opérateur actif). */
export const STAGE_STEP: Record<OperatorStage, number> = {
  candidate: 2,
  training: 2,
  exam_pending: 3,
  exam_passed: 4,
  certified: 5,
  active: 5,
  suspended: 4,
  expired: 4,
  revoked: 0,
}

/** Où en est le dossier, en une phrase, et ce qu'il y a à faire maintenant. */
export const STAGE_COPY: Record<OperatorStage, { state: string; next: string }> = {
  candidate: {
    state: 'Candidature enregistrée',
    next: 'Suivez la formation en ligne, gratuite, à votre rythme.',
  },
  training: {
    state: 'Formation en cours',
    next: 'Terminez les leçons pour passer à l’évaluation pratique.',
  },
  exam_pending: {
    state: 'Formation terminée',
    next: 'Un opérateur de l’équipe vous contacte pour l’évaluation sur le terrain.',
  },
  exam_passed: {
    state: 'Évaluation réussie',
    next: 'Réglez les frais de certification (15 000 XOF) pour devenir opérateur actif.',
  },
  certified: {
    state: 'Frais de certification réglés',
    next: 'L’équipe FaîtiereHub active votre compte d’opérateur ; vous recevez un e-mail.',
  },
  active: {
    state: 'Opérateur actif',
    next: 'Validez les dossiers de votre zone et imprimez les cartes commandées.',
  },
  suspended: {
    state: 'Compte suspendu',
    next: 'Écrivez à l’équipe FaîtiereHub pour connaître la suite.',
  },
  expired: {
    state: 'Certification expirée',
    next: 'Écrivez à l’équipe FaîtiereHub pour la renouveler.',
  },
  revoked: {
    state: 'Certification retirée',
    next: 'Écrivez à l’équipe FaîtiereHub pour plus d’informations.',
  },
}

/**
 * Retour de la page de paiement FedaPay (/operator?certification=…&ref=…). Le serveur a déjà relu
 * la transaction auprès de FedaPay ; ce mot ne fait que choisir le message. Pur.
 */
export type CertificationResult = 'success' | 'pending' | 'failed' | 'unknown'

export function parseCertificationResult(
  search: string,
): { result: CertificationResult; ref: string | null } | null {
  const params = new URLSearchParams(search)
  const raw = params.get('certification')
  if (!raw) return null
  const result: CertificationResult =
    raw === 'success' || raw === 'pending' || raw === 'failed' ? raw : 'unknown'
  const ref = params.get('ref')
  return { result, ref: ref && /^[0-9a-f-]{36}$/i.test(ref) ? ref : null }
}

export const CERTIFICATION_RESULT_COPY: Record<
  CertificationResult,
  { title: string; body: string; tone: 'ok' | 'wait' | 'error' }
> = {
  success: {
    title: 'Paiement reçu',
    body: 'FedaPay a confirmé votre paiement : vos frais de certification sont réglés.',
    tone: 'ok',
  },
  pending: {
    title: 'Paiement en attente de confirmation',
    body: 'FedaPay n’a pas encore confirmé votre paiement. Validez-le sur votre téléphone si on vous le demande, puis vérifiez à nouveau.',
    tone: 'wait',
  },
  failed: {
    title: 'Le paiement n’a pas abouti',
    body: 'Vos frais ne sont pas réglés. Vous pouvez réessayer ci-dessous.',
    tone: 'error',
  },
  unknown: {
    title: 'Paiement introuvable',
    body: 'Si votre compte Mobile Money a été débité, écrivez à l’équipe FaîtiereHub avec le reçu.',
    tone: 'error',
  },
}

/**
 * Statut après le règlement des frais de certification : 'certified' pour un dossier encore en
 * formation ou en évaluation ; un dossier actif, suspendu, expiré ou retiré garde le sien. Pur.
 */
export function statusAfterCertificationPaid(status: PartnerStatus): PartnerStatus {
  return status === 'candidate' || status === 'training' || status === 'exam_pending'
    ? 'certified'
    : status
}
