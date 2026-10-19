/**
 * Constantes du verrou de traitement d'une ligne kobo_submissions — logique PURE.
 *
 * 'pending' = en file, 'processing' = prise en charge par UNE exécution (webhook, synchronisation
 * ou « Retenter »). Le passage pending/error/unmatched → processing est un UPDATE conditionnel
 * atomique (voir processors.ts) : une seule exécution concurrente l'obtient.
 */

/**
 * Au-delà de ce délai, une ligne « processing » est considérée comme abandonnée (fonction coupée,
 * crash) : elle redevient reprenable. Même délai que la grâce d'une ligne « pending » récente.
 */
export const CLAIM_STALE_MS = 5 * 60_000

/** Statuts que l'on peut prendre en charge. */
export const CLAIMABLE_STATUSES = ['pending', 'error', 'unmatched'] as const

/** Statuts dans lesquels une version modifiée peut remplacer le contenu de la ligne. */
export const EDITABLE_STATUSES = ['pending', 'matched', 'unmatched', 'error'] as const
