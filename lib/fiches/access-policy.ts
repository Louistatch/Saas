/**
 * Par quelles portes un compte d'exploitation s'ouvre, selon son statut et son prix.
 *
 * Une fiche retirée de la vente (archived) n'est plus proposée : ni gratuité, ni carte membre,
 * ni nouvel achat. Mais ceux qui l'ont payée gardent leur fichier : l'achat réglé reste une porte
 * tant que la fiche existe. Un brouillon ne s'ouvre jamais. Pur.
 */
export interface FicheForAccess {
  status: string | null
  price_non_member: number | null
  is_free_for_members: boolean | null
}

export function ficheAccessRoutes(f: FicheForAccess) {
  const onSale = f.status === 'published'
  return {
    /** Prix nul : accès libre, sans carte ni achat. */
    free: onSale && (f.price_non_member ?? 0) <= 0,
    /** Carte membre (compte connecté ou session de carte) : fiches de coopérative gratuites pour leurs membres. */
    member: onSale && (f.price_non_member ?? 0) > 0 && f.is_free_for_members === true,
    /** Achat réglé : la fiche en vente ou retirée de la vente. */
    purchase: onSale || f.status === 'archived',
  }
}
