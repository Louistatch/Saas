/**
 * Libellés de la gratuité « membres », côté interface. La règle elle-même est
 * appliquée par le serveur (lib/fiches/member-scope.ts) : fiche d'une faîtière
 * → membres de SA faîtière avec une carte active ; fiche de la plateforme →
 * toute carte active.
 */
import { formatFcfa } from './types'

/** Case à cocher du formulaire, selon qui vend. */
export const MEMBER_FREE_CHECKBOX_LABEL = {
  faitiere: 'Gratuit pour les membres de ma faîtière (carte active)',
  platform: 'Gratuit pour toute carte active',
} as const

/** Mention publique sous le prix d'une fiche marquée « gratuite pour les membres ». */
export function memberFreeLabel(fiche: {
  cooperative_id: string | null
  cooperatives?: { name: string | null } | null
}): string {
  if (!fiche.cooperative_id) return 'Gratuit pour toute carte active'
  const seller = fiche.cooperatives?.name?.trim()
  return seller
    ? `Gratuit pour les membres de ${seller} (carte active)`
    : 'Gratuit pour les membres de la faîtière (carte active)'
}

/** Badge du tableau de bord : seulement pour une fiche PAYANTE (gratuite sinon pour tous). */
export function memberFreeBadge(fiche: {
  is_free_for_members: boolean
  price_non_member: number | null
}): string | null {
  return fiche.is_free_for_members && (fiche.price_non_member ?? 0) > 0
    ? 'Gratuit pour vos membres (carte active)'
    : null
}

/** Prix affiché au tableau de bord, à côté du badge membres. */
export function dashboardPriceLabel(price: number | null): string {
  return (price ?? 0) > 0 ? formatFcfa(price) : 'Gratuit pour tous'
}

/** Invitation à saisir sa carte, dans la fenêtre d'achat, selon qui vend. */
export function memberFreeDialogHint(fiche: {
  cooperative_id: string | null
  cooperatives?: { name: string | null } | null
}): { lead: string; rest: string } {
  if (!fiche.cooperative_id) {
    return {
      lead: 'Titulaire d’une carte active ?',
      rest: 'Elle donne accès gratuitement à ce compte.',
    }
  }
  const seller = fiche.cooperatives?.name?.trim() || 'la faîtière'
  return {
    lead: `Membre de ${seller} ?`,
    rest: 'Votre carte active donne accès gratuitement à ce compte.',
  }
}

/**
 * Page de scan (vue Exploitation) : que proposer pour une fiche, d'après ce que
 * le serveur a décidé pour CETTE carte (`free_for_you`, `not_free_reason`).
 * Une panne de vérification n'est jamais présentée comme « payez ».
 */
export type FicheAction =
  | { kind: 'download'; badge: string }
  | { kind: 'buy'; badge: string; href: string }
  | { kind: 'retry'; badge: string; message: string }

/**
 * Lien vers UNE fiche de la boutique : /marketplace?fiche=<id> l'affiche seule
 * et ouvre sa fenêtre d'achat. Jamais une recherche par titre : la recherche
 * retire virgules et parenthèses et plafonne à 100 caractères, et un titre
 * comme « Compte Maïs, 1 hectare, Kara » ne s'y retrouvait pas.
 */
export function marketplaceFicheHref(fiche: { id: string }): string {
  return `/marketplace?fiche=${encodeURIComponent(fiche.id)}`
}

export function ficheAction(fiche: {
  id: string
  title: string
  price_non_member: number | null
  free_for_you?: boolean
  not_free_reason?: string | null
}): FicheAction {
  const price = fiche.price_non_member ?? 0
  if (price <= 0) return { kind: 'download', badge: 'Gratuit' }
  if (fiche.free_for_you === true) return { kind: 'download', badge: 'Gratuit pour vous' }
  const badge = formatFcfa(price)
  if (fiche.not_free_reason === 'lookup_failed') {
    return { kind: 'retry', badge, message: 'Vérification impossible pour le moment, réessayez.' }
  }
  return { kind: 'buy', badge, href: marketplaceFicheHref(fiche) }
}
