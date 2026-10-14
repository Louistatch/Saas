/**
 * Captures du produit pour la démonstration de chaque leçon (J4). Produites par Playwright sur
 * le produit construit depuis ce dépôt, avec des données d'exemple (mock) : ce sont les vrais
 * écrans de FaîtiereHub, pas des maquettes, mais pas des données de production. Chaque capture
 * est étiquetée comme telle à l'affichage. Quand `academy_media_assets.storage_path` sera
 * renseigné avec une capture de production, il prime sur ce catalogue.
 */

export interface LessonCapture {
  lesson: number
  route: string
  desktop: string
  mobile: string
  alt: string
}

const BASE = '/academy/captures'
const file = (n: number, profile: 'desktop' | 'mobile') =>
  `${BASE}/lesson-${String(n).padStart(2, '0')}-${profile}.webp`

const ROUTES: Record<number, { route: string; alt: string }> = {
  1: {
    route: '/operator',
    alt: 'Espace Opérateur : statut du dossier et parcours de certification',
  },
  2: {
    route: '/dashboard',
    alt: 'Tableau de bord d’une organisation avec le sélecteur d’organisation',
  },
  3: { route: '/admin/cooperatives', alt: 'Gestion des organisations : nom, niveau, rattachement' },
  4: { route: '/dashboard/members', alt: 'Page Membres : recherche, filtres, création, import' },
  5: { route: '/dashboard/cards', alt: 'Page Cartes : génération, statut et aperçu' },
  6: {
    route: '/dashboard/integrations',
    alt: 'Intégrations : KoboToolbox parmi les outils disponibles, avant connexion et import',
  },
  7: { route: '/dashboard/analytics', alt: 'Statistiques et rapports : indicateurs disponibles' },
  8: { route: '/operator', alt: 'Espace Opérateur certifié : portefeuille PAYG' },
  9: { route: '/operator', alt: 'Espace connecté : identité, partenaire actif, navigation' },
  10: { route: '/operator', alt: 'Espace Opérateur : organisations suivies et statut' },
  11: { route: '/dashboard/members', alt: 'Page Membres, point de départ de la mise en situation' },
  12: {
    route: '/operator',
    alt: 'Espace Opérateur : étapes formation, évaluation, paiement, certification',
  },
}

export function captureFor(orderIndex: number | null): LessonCapture | null {
  if (orderIndex == null) return null
  const r = ROUTES[orderIndex]
  if (!r) return null
  return {
    lesson: orderIndex,
    route: r.route,
    desktop: file(orderIndex, 'desktop'),
    mobile: file(orderIndex, 'mobile'),
    alt: r.alt,
  }
}

export const CAPTURE_LABEL = 'Capture du produit, données d’exemple'
