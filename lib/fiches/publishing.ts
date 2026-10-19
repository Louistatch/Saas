/**
 * Qui publie les comptes d'exploitation : création, fichiers, mise en vente, retrait,
 * suppression. Pur (aucun accès réseau ni base).
 *
 * Depuis le 11/10/2026 (commit 40c06ee, « comptes d'exploitation émis par l'opérateur, pas la
 * coopérative »), seul le super_admin publie : la RLS appliquée en production
 * (20261011_200000_operator_only_issuance) ne laisse aux coopératives que la lecture. Les routes
 * écrivent avec le client de service ; ces fonctions les empêchent de contourner cette décision.
 *
 * Le parcours « faîtière » (dépôt dans son propre dossier, gestion de ses seules fiches) reste
 * écrit et testé derrière FAITIERE_PUBLISHING. Le rouvrir est une décision du propriétaire :
 * passer le drapeau à true ET rouvrir l'écriture de fiches_techniques aux faîtières dans la RLS.
 */
export const FAITIERE_PUBLISHING: boolean = false

export interface PublisherContext {
  role: string | null
  cooperativeId: string | null
  cooperativeLevel: string | null
}

interface PublishingOptions {
  /** Publication par les faîtières ouverte (défaut : FAITIERE_PUBLISHING). */
  faitiere?: boolean
}

/** Peut déposer un compte d'exploitation (POST /api/fiches). */
export function canPublishFiches(ctx: PublisherContext, opts: PublishingOptions = {}): boolean {
  if (ctx.role === 'super_admin') return true
  const faitiere = opts.faitiere ?? FAITIERE_PUBLISHING
  return faitiere && ctx.role === 'cooperative_admin' && ctx.cooperativeLevel === 'faitiere'
}

/**
 * Peut gérer CETTE fiche (PATCH, DELETE) : le super_admin (toutes, dont celles de la
 * plateforme) ; si la publication des faîtières est ouverte, l'admin de la faîtière
 * PROPRIÉTAIRE, jamais une fiche de la plateforme ni celle d'une autre faîtière.
 */
export function canManageFiche(
  ctx: PublisherContext,
  fiche: { cooperative_id: string | null },
  opts: PublishingOptions = {},
): boolean {
  if (ctx.role === 'super_admin') return true
  return (
    canPublishFiches(ctx, opts) &&
    fiche.cooperative_id !== null &&
    ctx.cooperativeId === fiche.cooperative_id
  )
}
