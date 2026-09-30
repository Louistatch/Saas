/**
 * Vocabulaire des systèmes de production.
 *
 * La colonne `fiches_techniques.type_agriculture` est un simple `text` sans
 * contrainte CHECK, et aucune valeur n'existait encore en base : le vocabulaire
 * est donc fixé ici, du côté qui écrit, pour que le filtre de l'acheteur ait
 * quelque chose de stable à interroger. Trois orthographes libres
 * (« agroécologique », « Agro-écologique », « agroeco ») rendraient le filtre
 * inutilisable sans que rien ne casse visiblement.
 *
 * Les clés sont sans accent ni espace — elles voyagent dans des URL de filtre.
 */
export const TYPES_AGRICULTURE = {
  agroecologique: 'Agroécologique',
  conventionnel: 'Intensive (conventionnel)',
  integre: 'Intégré',
} as const

export type TypeAgriculture = keyof typeof TYPES_AGRICULTURE

export const TYPE_AGRICULTURE_KEYS = Object.keys(TYPES_AGRICULTURE) as TypeAgriculture[]

export function labelTypeAgriculture(value: string | null | undefined): string {
  if (!value) return '—'
  return TYPES_AGRICULTURE[value as TypeAgriculture] ?? value
}

/** Un fichier attaché à une fiche, tel que stocké dans la colonne jsonb `files`. */
export interface FicheFile {
  name: string
  /** Chemin dans le bucket privé `fiches-techniques`, pas une URL publique. */
  url: string
  type: string
  size?: number
}
