'use client'

import Link from 'next/link'
import { type ReactNode, useEffect, useState } from 'react'

export function PrivateCardSection({
  cardNumber,
  children,
}: { cardNumber: string; children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'allowed' | 'login' | 'denied' | 'error'>(
    'loading',
  )
  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    fetch(`/api/verify/${encodeURIComponent(cardNumber)}/private-access`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((res) =>
        setStatus(
          res.ok
            ? 'allowed'
            : res.status === 401
              ? 'login'
              : res.status === 404
                ? 'denied'
                : 'error',
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })
    return () => controller.abort()
  }, [cardNumber])
  if (status === 'allowed') return children
  return (
    <div
      className="rounded-2xl border border-white/20 bg-white/10 p-6 text-center text-white"
      aria-live="polite"
    >
      <p className="font-semibold">
        {status === 'loading' ? 'Vérification de votre accès…' : 'Espace personnel du membre'}
      </p>
      {status === 'login' && (
        <>
          <p className="mt-2 text-sm">
            Connectez-vous à votre compte autorisé pour consulter les informations de cette carte.
          </p>
          <Link
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-white px-4 font-medium text-green-900"
            href={`/auth/login?redirect=${encodeURIComponent(`/verify/${cardNumber}`)}`}
          >
            Se connecter
          </Link>
        </>
      )}
      {status === 'denied' && (
        <p className="mt-2 text-sm">
          Ce compte n’a pas accès à cette carte. Contactez votre organisation pour vérifier votre
          rattachement.
        </p>
      )}
      {status === 'error' && (
        <p className="mt-2 text-sm">
          La vérification est temporairement indisponible. Réessayez dans quelques instants.
        </p>
      )}
    </div>
  )
}
