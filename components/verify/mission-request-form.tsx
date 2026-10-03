'use client'

/**
 * « Demander une mission » depuis la carte scannée d'un agronome. Le demandeur
 * est le compte connecté (vérifié côté serveur) ; sans compte, on dit
 * clairement quoi faire et on revient ici après connexion.
 */

import { useAuth } from '@/app/context/auth-context'
import { CheckCircle2, Loader2, Lock, Send } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const field =
  'w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[var(--vfp-accent)]/50 focus:outline-none'

export function MissionRequestForm({
  cardNumber,
  agronomeName,
}: { cardNumber: string; agronomeName: string }) {
  const { user, isLoading } = useAuth()
  const [description, setDescription] = useState('')
  const [culture, setCulture] = useState('')
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const back = `/verify/${encodeURIComponent(cardNumber)}`

  if (isLoading) return null

  if (!user) {
    return (
      <div className="vfp-card rounded-2xl p-4 space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <Lock className="h-4 w-4" /> Connexion requise pour demander une mission
        </p>
        <p className="text-xs text-white/55">
          La demande porte votre nom et votre téléphone : l’agronome vous recontacte. Vous suivez
          ensuite la mission et laissez un avis depuis votre compte.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/auth/login?redirect=${encodeURIComponent(back)}`}
            className="rounded-xl border border-white/15 py-2.5 text-center text-sm font-semibold text-white/85"
          >
            Se connecter
          </Link>
          <Link
            href="/auth/signup?espace=haroo"
            className="rounded-xl py-2.5 text-center text-sm font-semibold"
            style={{ background: 'var(--vfp-cta)', color: 'var(--vfp-cta-fg)' }}
          >
            Créer un compte
          </Link>
        </div>
      </div>
    )
  }

  if (sent) {
    return (
      <div className="vfp-card rounded-2xl p-4 space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <CheckCircle2 className="h-4 w-4 text-[var(--vfp-accent)]" /> Demande envoyée à{' '}
          {agronomeName}
        </p>
        <p className="text-xs text-white/55">Suivez-la dans « Mon compte ».</p>
        <Link href="/compte" className="text-xs font-semibold text-[var(--vfp-accent)]">
          Voir mes demandes →
        </Link>
      </div>
    )
  }

  return (
    <form
      className="vfp-card rounded-2xl p-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError('')
        try {
          const res = await fetch('/api/haroo/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              card_number: cardNumber,
              description: description.trim(),
              culture: culture.trim() || undefined,
              phone: phone.trim(),
              date_debut: date || undefined,
            }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) setError(data.error ?? 'Demande impossible.')
          else setSent(true)
        } catch {
          setError('Erreur de connexion.')
        } finally {
          setBusy(false)
        }
      }}
    >
      <p className="text-sm font-semibold text-white">Demander une mission à {agronomeName}</p>
      <textarea
        className={field}
        rows={3}
        required
        minLength={10}
        maxLength={1000}
        placeholder="Votre besoin : diagnostic, irrigation, traitement…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={field}
          placeholder="Culture"
          value={culture}
          onChange={(e) => setCulture(e.target.value)}
        />
        <input
          className={field}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date souhaitée"
        />
      </div>
      <input
        className={field}
        type="tel"
        inputMode="tel"
        required
        placeholder="Votre téléphone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      <button
        type="submit"
        disabled={busy || description.trim().length < 10 || phone.trim().length < 8}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
        style={{ background: 'var(--vfp-cta)', color: 'var(--vfp-cta-fg)' }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Envoyer la demande
      </button>
    </form>
  )
}
