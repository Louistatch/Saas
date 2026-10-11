'use client'

import { Button } from '@/components/ui/button'
import { reportClientError } from '@/lib/errors/report-client'
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
    reportClientError(error)
  }, [error])

  return (
    <html lang="fr">
      <body className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-md">
          <h2 className="text-2xl font-bold text-foreground">Something went wrong</h2>
          <p className="text-muted-foreground">
            An unexpected error occurred. Our team has been notified.
          </p>
          <Button onClick={reset} className="bg-primary hover:bg-primary/90">
            Try again
          </Button>
        </div>
      </body>
    </html>
  )
}
