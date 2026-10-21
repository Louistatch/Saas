'use client'

import { CardLoginPanel } from '@/components/verify/card-login-panel'
import { type CardIdentity, cardEntryHref } from '@/lib/haroolife/card-entry'
import { ArrowLeft, Gamepad2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * HarooLife from the card page. The holder who opened the card session (the PIN given with the
 * card, or the SMS code) enters the game under their own name, as a visitor: no account, no
 * e-mail. Without the PIN anyone plays as a plain visitor, without the holder's name; a
 * FaîtiereHub account that can read the card plays under that account.
 */
export function HarooLifeCardView({
  cardNumber,
  firstName,
  village,
  onBack,
  onConnected,
}: {
  cardNumber: string
  firstName: string
  village: string | null
  onBack: () => void
  /** The PIN (or SMS code) was accepted: the page reloads its private data. */
  onConnected: () => void
}) {
  // Who is looking, as the game will see it (app/api/verify/[card_number]/haroolife): the holder
  // (card session), a FaîtiereHub account that can read the card (403), or nobody proven yet (an
  // account without rights to this card can still enter the PIN).
  const [access, setAccess] = useState<'checking' | 'card' | 'account' | 'locked' | 'error'>(
    'checking',
  )
  // The name the game will fill in (the same route answers the game).
  const [identity, setIdentity] = useState<CardIdentity | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    void reload
    const controller = new AbortController()
    setAccess('checking')
    fetch(`/api/verify/${encodeURIComponent(cardNumber)}/haroolife`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (res) => {
        if (res.ok) setIdentity((await res.json().catch(() => null)) as CardIdentity | null)
        setAccess(
          res.ok
            ? 'card'
            : res.status === 403
              ? 'account'
              : res.status === 401 || res.status === 404
                ? 'locked'
                : 'error',
        )
      })
      .catch(() => {
        if (!controller.signal.aborted) setAccess('error')
      })
    return () => controller.abort()
  }, [cardNumber, reload])
  const checking = access === 'checking'
  const viaCard = access === 'card'
  const privateLocked = access === 'locked'
  const name = identity?.first_name ?? firstName
  const place = identity ? identity.village : village
  const visitorLink = (
    <Link
      href="/haroolife"
      prefetch={false}
      className="flex min-h-11 items-center justify-center text-sm font-medium text-white/70 underline underline-offset-4"
    >
      Jouer en visiteur, sans mon nom
    </Link>
  )
  return (
    <div className="space-y-4 vfp-enter" data-testid="haroolife-card">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70"
      >
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>
      <section className="vfp-card rounded-2xl p-5" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/25">
            <Gamepad2 className="h-6 w-6 text-emerald-300" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white">HarooLife</h2>
            <p className="text-sm leading-snug text-white/60">
              Le jeu de la vie au Togo. Sans e-mail ni mot de passe.
            </p>
          </div>
        </div>
        {checking ? (
          <p className="mt-4 text-sm text-white/70">Vérification de votre accès…</p>
        ) : viaCard ? (
          <>
            <p className="mt-4 text-[15px] leading-relaxed text-white">
              Tu entres sous ton nom : <strong>{name}</strong>
              {place ? ` (village : ${place})` : ''}. Il est déjà rempli à l’arrivée dans le jeu.
            </p>
            <Link
              href={cardEntryHref(cardNumber)}
              prefetch={false}
              className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--vfp-cta)] px-4 font-bold text-[var(--vfp-cta-fg)] active:scale-[0.98]"
            >
              Jouer sous mon nom
            </Link>
          </>
        ) : privateLocked ? (
          <p className="mt-4 text-[15px] leading-relaxed text-white/85">
            Pour jouer sous ton nom, entre le PIN remis avec ta carte.
          </p>
        ) : access === 'error' ? (
          <p className="mt-4 text-sm text-white/80">
            La vérification est indisponible. Réessaie dans un instant, ou joue en visiteur.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-white/80">
              Tu joues avec ton compte FaîtiereHub.
            </p>
            <Link
              href="/haroolife"
              prefetch={false}
              className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--vfp-cta)] px-4 font-bold text-[var(--vfp-cta-fg)] active:scale-[0.98]"
            >
              Ouvrir HarooLife
            </Link>
          </>
        )}
      </section>
      {privateLocked && (
        <CardLoginPanel
          cardNumber={cardNumber}
          onConnected={() => {
            setReload((n) => n + 1)
            onConnected()
          }}
        />
      )}
      {(privateLocked || viaCard || access === 'error') && visitorLink}
    </div>
  )
}
