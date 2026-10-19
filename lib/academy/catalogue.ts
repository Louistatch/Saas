/**
 * Le catalogue AgriAcademy des coopératives. Pur, utilisable côté client.
 *
 * Un module sans leçon n'est pas une formation : les membres ne le voient pas (le bouton
 * « Commencer » ouvrirait une fenêtre vide). Les administrateurs le voient comme un brouillon, pour
 * pouvoir y ajouter des leçons. La formation Opérateur certifié a son propre parcours
 * (/operator/training), avec quiz, cas pratiques et suivi : le catalogue y renvoie.
 */
export const OPERATOR_COURSE_ID = '2482e523-500e-4178-8102-1018af290c82'

export interface CatalogueModule {
  id: string
  academy_lessons?: unknown[] | null
}

export const lessonCount = (m: CatalogueModule) => m.academy_lessons?.length ?? 0

export function catalogueModules<T extends CatalogueModule>(modules: T[], canEdit: boolean): T[] {
  return modules.filter((m) => canEdit || lessonCount(m) > 0)
}
