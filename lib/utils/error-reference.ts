/**
 * Écrans d'erreur (app/error.tsx, app/global-error.tsx, app/admin/error.tsx,
 * app/dashboard/error.tsx) : seule la référence (`digest`, générée par Next
 * pour les erreurs serveur) est montrée, jamais le message technique. Le
 * support la retrouve dans les journaux du serveur.
 *
 * Next ne garantit pas que la valeur reçue soit une `Error` : tout est vérifié.
 */
export function errorReference(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const digest = (error as { digest?: unknown }).digest
  if (typeof digest !== 'string') return null
  const ref = digest.trim()
  return /^[\w-]{1,64}$/.test(ref) ? ref : null
}

/** Texte de l'écran d'erreur : ce qui s'est passé, puis quoi faire. */
export function errorScreenBody(reference: string | null): string {
  return reference
    ? 'Cette page n’a pas pu s’afficher. Réessayez. Si le problème continue, contactez le support en donnant la référence ci-dessous.'
    : 'Cette page n’a pas pu s’afficher. Réessayez. Si le problème continue, contactez le support.'
}
