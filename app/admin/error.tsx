'use client'

import { ErrorScreen } from '@/components/shared/error-screen'
import { reportClientError } from '@/lib/errors/report-client'
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
    reportClientError(error as Error & { digest?: string })
  }, [error])

  return (
    <ErrorScreen
      error={error}
      onRetry={retry}
      back={{ href: '/admin', label: 'Retour à l’administration' }}
    />
  )
}
