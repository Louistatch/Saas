'use client'

import { Button } from '@/components/ui/button'
import { errorReference, errorScreenBody } from '@/lib/utils/error-reference'
import { AlertCircle, RefreshCw } from 'lucide-react'

interface ErrorScreenProps {
  error: unknown
  /** Nouvel essai (`retry` de Next : relit les données puis réaffiche). */
  onRetry: () => void
  /** Lien de repli, ex. le tableau de bord. */
  back: { href: string; label: string }
  /** Plein écran (racine) ou dans la zone de contenu (tableau de bord, admin). */
  fullPage?: boolean
}

/**
 * Écran commun des error boundaries : en français, sans message technique,
 * avec la référence du serveur quand elle existe. Liens en <a> : le routeur
 * peut être lui-même en panne.
 */
export function ErrorScreen({ error, onRetry, back, fullPage }: ErrorScreenProps) {
  const reference = errorReference(error)
  return (
    <div
      className={`flex items-center justify-center p-4 ${fullPage ? 'min-h-screen bg-background' : 'min-h-[60vh]'}`}
    >
      <div
        role="alert"
        className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card px-6 py-8 text-center shadow-sm"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Un problème est survenu</h2>
          <p className="text-sm text-muted-foreground">{errorScreenBody(reference)}</p>
          {reference ? (
            <p className="text-xs text-muted-foreground">
              Référence :{' '}
              <span className="select-all font-medium text-foreground">{reference}</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={onRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
          <Button asChild variant="outline">
            <a href={back.href}>{back.label}</a>
          </Button>
        </div>
        <a
          href="/contact"
          className="inline-block text-xs text-primary underline-offset-4 hover:underline"
        >
          Contacter le support
        </a>
      </div>
    </div>
  )
}
