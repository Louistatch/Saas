/**
 * Adresse de vérification imprimée (QR) sur toutes les cartes FaîtiereHub.
 *
 * Une seule source de vérité pour la carte de membre et les cartes
 * professionnelles Haroo : le lien que scanne un tiers ne doit pas dépendre du
 * rendu qui l'a produit. Aucune donnée personnelle dans l'adresse.
 */

/** Origine publique des liens de vérification imprimés sur les cartes. */
export const CARD_VERIFY_ORIGIN = 'https://www.faitierehub.com'

export function cardVerifyUrl(data: {
  cardNumber: string
  /** Jeton opaque (member_cards.verify_token). Absent : /verify/<numéro>. */
  verifyToken?: string | null
}): string {
  return data.verifyToken
    ? `${CARD_VERIFY_ORIGIN}/verify/t/${encodeURIComponent(data.verifyToken)}`
    : `${CARD_VERIFY_ORIGIN}/verify/${encodeURIComponent(data.cardNumber)}`
}

/** Hôte et chemin de saisie manuelle, imprimés sous le QR (sans protocole). */
export const CARD_VERIFY_HOST_LABEL = CARD_VERIFY_ORIGIN.replace(/^https?:\/\/(www\.)?/, '')
