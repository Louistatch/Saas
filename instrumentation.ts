export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side Sentry initialization
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime Sentry initialization
    await import('./sentry.edge.config')
  }
}

// Erreurs serveur : enregistrées pour le suivi dans l'administration (/admin/erreurs),
// en plus de Sentry. Ne lève jamais.
export async function onRequestError(err: unknown, request: { path: string }): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { recordAppError } = await import('./lib/errors/record')
  await recordAppError({
    source: 'serveur',
    route: request.path,
    message: err instanceof Error ? err.message : String(err),
    digest: typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : null,
  })
}
