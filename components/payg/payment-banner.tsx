'use client'

/**
 * Retour de FedaPay (/api/payg/payments/return) : l'état affiché vient de la transaction relue
 * côté serveur, jamais de l'URL d'origine. Le paramètre est retiré de l'adresse aussitôt lu.
 */

import { CheckCircle2, Clock, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

const COPY = {
  success: {
    icon: CheckCircle2,
    tone: 'border-primary/30 bg-primary/5 text-foreground',
    text: 'Paiement confirmé par FedaPay. Votre solde est à jour.',
  },
  pending: {
    icon: Clock,
    tone: 'border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100',
    text: 'Paiement en attente de confirmation. Le solde se mettra à jour dès que FedaPay confirme ; rien ne sera débité deux fois.',
  },
  failed: {
    icon: XCircle,
    tone: 'border-destructive/30 bg-destructive/5 text-foreground',
    text: 'Paiement non abouti : aucun montant n’a été pris. Vous pouvez réessayer.',
  },
  unknown: {
    icon: XCircle,
    tone: 'border-border bg-muted text-foreground',
    text: 'Paiement introuvable. Si vous avez été débité, écrivez à l’équipe avec l’heure du paiement.',
  },
} as const

type State = keyof typeof COPY

export function PaymentBanner({ onSettled }: { onSettled?: () => void }) {
  const [state, setState] = useState<State | null>(null)

  useEffect(() => {
    const url = new URL(window.location.href)
    const value = url.searchParams.get('payment')
    if (!value) return
    if (value in COPY) setState(value as State)
    url.searchParams.delete('payment')
    url.searchParams.delete('ref')
    window.history.replaceState(null, '', url.toString())
    if (value === 'success') onSettled?.()
  }, [onSettled])

  if (!state) return null
  const { icon: Icon, tone, text } = COPY[state]
  return (
    <div
      aria-live="polite"
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm motion-safe:animate-in motion-safe:fade-in ${tone}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="flex-1">{text}</p>
      <button
        type="button"
        onClick={() => setState(null)}
        className="rounded p-0.5 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
