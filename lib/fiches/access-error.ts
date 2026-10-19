/**
 * Réponse refusée de POST /api/fiches/[id]/access → phrase affichée dans la
 * fenêtre d'achat (components/marketplace/fiche-access-dialog.tsx). Fonction PURE.
 *
 * Un 402 porte la décision du serveur pour CETTE carte (`reason` :
 * card_inactive, not_holder, other_tree, card_outdated, broken_chain…) et son
 * `message`, écrit pour l'acheteur, qui dit pourquoi et quoi faire : il est
 * affiché tel quel. Les autres refus ne portent qu'un texte technique
 * (`error`), jamais affiché : chacun reçoit ici une phrase qui dit quoi faire.
 */

export interface AccessReply {
  error?: unknown
  message?: unknown
  reason?: unknown
}

/** Repli si un 402 arrive sans message (ne devrait pas arriver). */
export const CARD_NOT_FREE_FALLBACK =
  'Votre carte ne donne pas accès gratuitement à ce compte. Achetez-le pour le télécharger.'

/**
 * Panne du serveur (5xx), pour toutes les routes des comptes d'exploitation :
 * fenêtre d'achat ici, formulaires et catalogue via apiErrorText
 * (lib/fiches/upload-client.ts).
 */
export const SERVICE_DOWN_TEXT =
  'Service indisponible pour le moment. Réessayez dans quelques minutes.'

/** 400 `not_free` : la boutique (en cache) montrait 0 FCFA, le serveur lit un prix. */
export const NO_LONGER_FREE_TEXT =
  'Ce compte n’est plus gratuit. Fermez la fenêtre et rechargez la page pour voir son prix.'

/** 403 : achat pas (encore) réglé. */
export const PAYMENT_PENDING_TEXT =
  'Paiement pas encore confirmé. Réessayez dans quelques minutes, ou ouvrez le lien de votre achat.'

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function accessErrorText(status: number, json: AccessReply | null | undefined): string {
  const reply = json ?? {}
  if (status === 404) return 'Ce compte d’exploitation n’est plus disponible.'
  if (status === 429) return 'Trop de tentatives. Patientez une minute puis réessayez.'
  if (status === 402) return text(reply.message) ?? CARD_NOT_FREE_FALLBACK
  if (status === 403) return PAYMENT_PENDING_TEXT
  if (status === 400)
    return reply.reason === 'not_free'
      ? NO_LONGER_FREE_TEXT
      : 'Demande refusée. Fermez la fenêtre, rechargez la page puis réessayez.'
  if (status >= 500) return SERVICE_DOWN_TEXT
  return 'Accès refusé. Rechargez la page puis réessayez.'
}
