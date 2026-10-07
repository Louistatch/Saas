'use client'

/**
 * Vérification d'une carte professionnelle par jeton opaque
 * (QR des nouvelles cartes : /verify/t/<jeton>). Jamais mise en cache : le
 * layout /verify impose no-store, comme next.config.mjs pour /verify/*.
 */

import { Logo } from '@/components/shared/logo'
import {
  type AgronomePublicCard,
  type AgronomePublicProfile,
  AgronomeView,
} from '@/components/verify/agronome-view'
import { vfpStyles } from '@/components/verify/vfp-styles'
import { Loader2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

interface TokenVerifyResult {
  valid: boolean
  card_type?: string
  card?: AgronomePublicCard
  agronome?: AgronomePublicProfile
  error?: string
}

export default function VerifyTokenPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token ?? ''
  const [result, setResult] = useState<TokenVerifyResult | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    fetch(`/api/verify/t/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => res.json() as Promise<TokenVerifyResult>)
      .then(setResult)
      .catch(() => {
        if (!controller.signal.aborted) setResult({ valid: false, error: 'Erreur réseau.' })
      })
    return () => controller.abort()
  }, [token])

  return (
    <div className="min-h-screen vfp-bg relative overflow-hidden" style={{ isolation: 'isolate' }}>
      <style>{vfpStyles}</style>
      <div className="relative z-10 max-w-md mx-auto px-4 pt-4 pb-8 space-y-5">
        <header className="flex items-center justify-between">
          <Link href="/">
            <Logo size="sm" textClassName="text-white" />
          </Link>
          <span className="text-white/40 text-xs">Vérification officielle</span>
        </header>

        {!result && (
          <div className="flex items-center justify-center py-20 text-white/60">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Vérification en cours" />
          </div>
        )}

        {result?.card && result.agronome && (
          <AgronomeView
            cardNumber={result.card.card_number}
            agronome={result.agronome}
            card={result.card}
          />
        )}

        {result?.valid && result.card && !result.agronome && (
          <div className="rounded-2xl border border-green-500/40 bg-green-600/15 p-6 text-center text-green-100">
            <p className="font-semibold">Carte valide</p>
            <p className="text-sm mt-1">
              Carte {result.card_type?.toLowerCase()} n° {result.card.card_number}. Pour le profil
              détaillé, ouvrez{' '}
              <Link className="underline" href={`/verify/${result.card.card_number}`}>
                la fiche
              </Link>
              .
            </p>
          </div>
        )}

        {result && !result.valid && !(result.card && result.agronome) && (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/40 bg-red-600/20 p-6 text-center text-red-100"
          >
            <XCircle className="h-8 w-8 mx-auto mb-2 text-red-300" />
            <p className="font-semibold">
              {result.card ? 'Carte non valide' : 'Carte introuvable'}
            </p>
            <p className="text-sm mt-1 text-red-100/80">
              {result.card
                ? `La carte ${result.card.card_number} n’est pas valide (${result.card.status}).`
                : 'Ce QR code ne correspond à aucune carte en circulation.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
