import 'server-only'
/** E-mails envoyés une seule fois, quand la fin de formation vient d'être enregistrée. */
import type { TrainingSettlement } from '@/lib/academy/operator-completion'
import { clip, emailSuperAdmins, emailUser } from '@/lib/email/resend'

export async function notifyTrainingCompleted(profileId: string, settlement: TrainingSettlement) {
  if (!settlement.newlyCompleted || !settlement.dossier) return
  const { displayName, partnerCode } = settlement.dossier
  await Promise.all([
    emailUser(profileId, 'Formation opérateur terminée', {
      title: 'Votre formation en ligne est validée',
      lines: [
        'Bonjour,',
        `Les ${settlement.lessonsTotal} leçons de la formation opérateur sont validées (dossier ${partnerCode}).`,
        'Prochaine étape : l’évaluation pratique sur le terrain. Un opérateur de l’équipe FaîtiereHub vous contacte pour la planifier.',
      ],
      cta: { label: 'Voir mon parcours', path: '/operator' },
    }),
    emailSuperAdmins('Candidat opérateur prêt pour l’évaluation pratique', {
      title: 'Formation en ligne terminée',
      lines: [
        `Candidat : ${clip(displayName)}`,
        `Code : ${partnerCode}`,
        `${settlement.lessonsCompleted} leçons sur ${settlement.lessonsTotal} validées (quiz réussis, cas pratiques déposés).`,
        'À faire : planifier l’évaluation pratique, puis enregistrer le résultat.',
      ],
      cta: { label: 'Ouvrir les candidats', path: '/admin/partners' },
    }),
  ])
}
