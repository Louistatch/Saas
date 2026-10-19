// Messages d'assistance envoyés depuis les tableaux de bord.
export const SUPPORT_CATEGORIES = {
  reclamation: 'Réclamation',
  suggestion: 'Suggestion',
  assistance: 'Demande d’aide',
  autre: 'Autre',
} as const
export type SupportCategory = keyof typeof SUPPORT_CATEGORIES

/** « support:reclamation » → « Réclamation » ; autres catégories inchangées. */
export function messageCategoryLabel(category: string | null): string | null {
  if (!category) return null
  if (category === 'cooperative') return 'Demande d’accès'
  const key = category.startsWith('support:') ? category.slice(8) : ''
  return (SUPPORT_CATEGORIES as Record<string, string>)[key] ?? category
}
