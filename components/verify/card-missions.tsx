'use client'

/**
 * « Mes missions » sur l'écran de la carte agronome. Le titulaire tape le PIN
 * de sa carte : ses missions s'affichent et il peut accepter, refuser ou
 * terminer — sans compte ni mot de passe. Le PIN reste en mémoire le temps de
 * l'écran seulement (jamais stocké) et accompagne chaque action, revérifiée
 * par le serveur. Mêmes missions que l'espace /haroo du site.
 */

import { CheckCircle2, KeyRound, Loader2, Phone, XCircle } from 'lucide-react'
import { useState } from 'react'

interface Mission {
  id: string
  description: string | null
  statut: string
  budget_propose: number | null
  date_debut: string | null
  exploitant_name: string | null
  culture: string | null
  requester_phone: string | null
  rating: number | null
}

interface MarketMission {
  id: string
  title: string
  culture: string | null
  canton: string | null
  prefecture: string | null
  region: string | null
}

const LABEL: Record<string, string> = {
  DEMANDE: 'Demande reçue',
  EN_COURS: 'En cours',
  TERMINEE: 'Terminée',
  ANNULEE: 'Annulée',
}

export function CardMissions({ cardNumber }: { cardNumber: string }) {
  const [pin, setPin] = useState('')
  const [missions, setMissions] = useState<Mission[] | null>(null)
  const [market, setMarket] = useState<MarketMission[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = async (p: string) => {
    setBusy('load')
    setError('')
    try {
      const res = await fetch('/api/haroo/card-missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_number: cardNumber, pin: p }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          data.code === 'wrong_pin' && data.attempts_left != null
            ? `PIN incorrect. Il reste ${data.attempts_left} essai${data.attempts_left > 1 ? 's' : ''}.`
            : (data.error ?? 'Accès refusé.'),
        )
        setMissions(null)
        return
      }
      setMissions(data.missions ?? [])
      setMarket(data.market ?? [])
    } catch {
      setError('Erreur de connexion.')
    } finally {
      setBusy(null)
    }
  }

  const take = async (announcementId: string) => {
    setBusy(announcementId)
    setError('')
    try {
      const res = await fetch('/api/haroo/missions/take', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcement_id: announcementId, card_number: cardNumber, pin }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.error ?? 'Prise impossible.')
      await load(pin)
    } catch {
      setError('Erreur de connexion.')
      setBusy(null)
    }
  }

  const act = async (id: string, action: 'accept' | 'refuse' | 'complete') => {
    setBusy(id)
    setError('')
    try {
      const res = await fetch(`/api/haroo/missions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, card_number: cardNumber, pin }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.error ?? 'Action impossible.')
      await load(pin)
    } catch {
      setError('Erreur de connexion.')
      setBusy(null)
    }
  }

  if (missions === null) {
    return (
      <form
        className="vfp-card rounded-2xl p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void load(pin)
        }}
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <KeyRound className="h-4 w-4 text-[var(--vfp-accent)]" /> Entrez le PIN de votre carte
        </p>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••••"
          aria-label="PIN de la carte"
          className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-3 text-center font-mono text-xl tracking-[0.5em] text-white focus:border-[var(--vfp-accent)]/50 focus:outline-none"
        />
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <button
          type="submit"
          disabled={pin.length !== 6 || busy === 'load'}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--vfp-cta)', color: 'var(--vfp-cta-fg)' }}
        >
          {busy === 'load' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Voir mes missions
        </button>
      </form>
    )
  }

  return (
    <div className="space-y-3">
      {error ? <p className="px-1 text-xs text-red-300">{error}</p> : null}
      {missions.length === 0 ? (
        <p className="vfp-card rounded-2xl p-4 text-sm text-white/60">
          Aucune mission pour le moment.
        </p>
      ) : (
        missions.map((m) => (
          <div key={m.id} className="vfp-card rounded-2xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-white">{m.exploitant_name ?? 'Mission'}</p>
              <span className="shrink-0 text-[11px] text-white/50">
                {LABEL[m.statut] ?? m.statut}
              </span>
            </div>
            {m.description ? <p className="text-xs text-white/60">{m.description}</p> : null}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/40">
              {m.culture ? <span>{m.culture}</span> : null}
              {m.date_debut ? (
                <span>{new Date(m.date_debut).toLocaleDateString('fr-FR')}</span>
              ) : null}
              {m.budget_propose ? (
                <span>{m.budget_propose.toLocaleString('fr-FR')} FCFA</span>
              ) : null}
              {m.rating ? <span>Avis {m.rating}/5</span> : null}
            </div>
            {m.requester_phone && (m.statut === 'DEMANDE' || m.statut === 'EN_COURS') ? (
              <a
                href={`tel:${m.requester_phone.replace(/\s/g, '')}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--vfp-accent)]"
              >
                <Phone className="h-3.5 w-3.5" /> {m.requester_phone}
              </a>
            ) : null}
            {m.statut === 'DEMANDE' ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy === m.id}
                  onClick={() => act(m.id, 'accept')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold"
                  style={{ background: 'var(--vfp-cta)', color: 'var(--vfp-cta-fg)' }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Accepter
                </button>
                <button
                  type="button"
                  disabled={busy === m.id}
                  onClick={() => act(m.id, 'refuse')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 py-2.5 text-xs font-semibold text-white/75"
                >
                  <XCircle className="h-3.5 w-3.5" /> Refuser
                </button>
              </div>
            ) : m.statut === 'EN_COURS' ? (
              <button
                type="button"
                disabled={busy === m.id}
                onClick={() => act(m.id, 'complete')}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold"
                style={{ background: 'var(--vfp-cta)', color: 'var(--vfp-cta-fg)' }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Mission terminée
              </button>
            ) : null}
          </div>
        ))
      )}
      {market.length > 0 ? (
        <div className="space-y-2 pt-2">
          <p className="px-1 text-xs font-bold uppercase tracking-wider text-white/45">
            Missions du marché près de chez vous
          </p>
          {market.map((a) => (
            <div key={a.id} className="vfp-card rounded-2xl p-4 space-y-2">
              <p className="text-sm font-semibold text-white">{a.title}</p>
              <p className="text-[11px] text-white/45">
                {[a.culture, a.canton ?? a.prefecture ?? a.region].filter(Boolean).join(' · ')}
              </p>
              <button
                type="button"
                disabled={busy === a.id}
                onClick={() => take(a.id)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold"
                style={{ background: 'var(--vfp-cta)', color: 'var(--vfp-cta-fg)' }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Prendre cette mission
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
