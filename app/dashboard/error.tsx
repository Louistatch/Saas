'use client'

import { ErrorScreen } from '@/components/shared/error-screen'
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <ErrorScreen
      error={error}
      onRetry={retry}
      back={{ href: '/dashboard', label: 'Retour au tableau de bord' }}
    />
  )
}
