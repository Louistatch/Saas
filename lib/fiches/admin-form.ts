/**
 * Formulaire d'un compte d'exploitation (components/marketplace/fiche-admin-form.tsx) :
 * règles PURES d'affichage, testées sans navigateur.
 *   - quel champ recevoir le focus quand des erreurs arrivent ;
 *   - quelles erreurs n'ont pas de champ à l'écran (affichées sous le formulaire) ;
 *   - décalage qui garde l'aperçu visible pendant la saisie (grand écran) ;
 *   - message de confirmation après enregistrement ;
 *   - champs manquants de la fenêtre « Nouvelle fiche » de la faîtière.
 */
import { FICHE_LIMITS } from './schema'

/** Champs de l'API dans l'ordre d'affichage → suffixe de l'id de l'élément (`<mode>-<suffixe>`). */
export const FICHE_FIELD_TARGETS = [
  ['title', 'title'],
  ['culture', 'culture'],
  ['type_agriculture', 'type'],
  ['campaign', 'campaign'],
  ['price_non_member', 'price'],
  ['description', 'desc'],
  ['region_id', 'region'],
  ['prefecture_id', 'prefecture'],
  ['canton_id', 'canton'],
  ['cover_url', 'cover'],
  ['files', 'files'],
] as const

const TARGET_OF: ReadonlyMap<string, string> = new Map(FICHE_FIELD_TARGETS)

/**
 * Premier champ en erreur, dans l'ordre de la page : id de l'élément à
 * focaliser, ou null si aucune erreur ne vise un champ affiché.
 */
export function firstInvalidTarget(
  errors: Readonly<Record<string, string | undefined>>,
  mode: string,
): string | null {
  for (const [field, suffix] of FICHE_FIELD_TARGETS) if (errors[field]) return `${mode}-${suffix}`
  return null
}

/** Erreurs du serveur sans champ à l'écran (ex. `status`) : à montrer près du bouton. */
export function unplacedErrors(errors: Readonly<Record<string, string | undefined>>): string[] {
  return Object.entries(errors).flatMap(([field, text]) =>
    text && !TARGET_OF.has(field) ? [text] : [],
  )
}

/**
 * Décalage vertical (px) de l'aperçu pour qu'il reste à `gap` du haut de
 * l'écran tant que la colonne du formulaire défile, sans jamais dépasser
 * le bas du formulaire.
 */
export function followOffset(o: {
  /** Haut du formulaire, relatif au haut de l'écran (négatif une fois défilé). */
  trackTop: number
  trackHeight: number
  boxHeight: number
  gap: number
}): number {
  const max = Math.max(0, o.trackHeight - o.boxHeight)
  return Math.round(Math.min(max, Math.max(0, o.gap - o.trackTop)))
}

/** Confirmation affichée au-dessus du formulaire vidé, après un enregistrement réussi. */
export function createdNotice(c: { title: string; status: 'draft' | 'published' }): {
  title: string
  body: string
} {
  if (c.status === 'published')
    return {
      title: `« ${c.title} » est en vente.`,
      body: 'Il apparaît en tête du catalogue ci-dessous et dans la boutique publique. Le formulaire est vide, prêt pour le compte suivant.',
    }
  return {
    title: `« ${c.title} » est enregistré en brouillon.`,
    body: 'Il n’est pas visible dans la boutique. Pour le vendre, cliquez sur « Mettre en vente » dans le catalogue. Le formulaire est vide, prêt pour le compte suivant.',
  }
}

/** Champs contrôlés avant envoi dans la fenêtre « Nouvelle fiche » de la faîtière. */
export type FaitiereDraftField = 'title' | 'culture' | 'files'

/** Ordre de la fenêtre : le premier champ fautif reçoit le focus. */
export const FAITIERE_DRAFT_FIELDS: readonly FaitiereDraftField[] = ['title', 'culture', 'files']

/**
 * Fenêtre « Nouvelle fiche » de la faîtière (app/dashboard/marketplace) : ce
 * qui manque, champ par champ. Le bouton d'enregistrement reste actif ; un
 * clic affiche ces messages sous les champs au lieu d'un bouton grisé muet.
 * Un brouillon s'enregistre sans fichier ; la mise en vente en exige un.
 */
export function faitiereDraftErrors(v: {
  title: string
  culture: string
  publish: boolean
  fileCount: number
}): Partial<Record<FaitiereDraftField, string>> {
  // Mêmes messages que le schéma du serveur (lib/fiches/schema) et que le
  // formulaire admin.
  const out: Partial<Record<FaitiereDraftField, string>> = {}
  if (v.title.trim().length < FICHE_LIMITS.titleMin)
    out.title = `Le titre doit compter au moins ${FICHE_LIMITS.titleMin} caractères`
  if (!v.culture.trim()) out.culture = 'Indiquez la culture'
  if (v.publish && v.fileCount === 0)
    out.files =
      'Ajoutez au moins un fichier pour mettre en vente, ou décochez « Mettre en vente tout de suite »'
  return out
}
