'use client'

import { ErrorScreen } from '@/components/shared/error-screen'
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
// global-error remplace le layout racine : ses styles ne sont pas chargés.
import './globals.css'

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="fr">
      <body className="bg-background font-sans antialiased">
        <title>Un problème est survenu — FaîtiereHub</title>
        <ErrorScreen
          error={error}
          onRetry={retry}
          back={{ href: '/', label: 'Retour à l’accueil' }}
          fullPage
        />
      </body>
    </html>
  )
}
