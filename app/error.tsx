'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Error boundary applicatif (toutes les routes sous le layout racine).
 *
 * Contrairement à global-error (écran opaque), celui-ci AFFICHE le message
 * d'erreur réel : indispensable pour diagnostiquer les crashs côté client
 * que les logs serveur ne voient jamais.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-lg">
        <h2 className="text-2xl font-bold text-foreground">Une erreur est survenue</h2>
        <p className="text-muted-foreground text-sm">
          L&apos;équipe a été notifiée. Si le problème persiste, transmettez le détail ci-dessous au support.
        </p>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-left">
          <p className="text-sm font-mono text-destructive break-words">
            {error.message || 'Erreur inconnue'}
          </p>
          {error.digest && (
            <p className="mt-1 text-xs font-mono text-muted-foreground">digest: {error.digest}</p>
          )}
        </div>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset} className="bg-primary hover:bg-primary/90">
            Réessayer
          </Button>
          <Button variant="outline" onClick={() => { window.location.href = '/' }}>
            Retour à l&apos;accueil
          </Button>
        </div>
      </div>
    </div>
  )
}
