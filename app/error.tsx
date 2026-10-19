'use client'

import { ErrorScreen } from '@/components/shared/error-screen'
import { reportClientError } from '@/lib/errors/report-client'
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Error boundary applicatif (toutes les routes sous le layout racine).
 * Le détail technique part à Sentry ; l'utilisateur voit une phrase claire
 * et la référence du serveur quand elle existe (components/shared/error-screen).
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
    reportClientError(error as Error & { digest?: string })
  }, [error])

  return (
    <ErrorScreen
      error={error}
      onRetry={retry}
      back={{ href: '/', label: 'Retour à l’accueil' }}
      fullPage
    />
  )
}
