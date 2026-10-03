'use client'

/**
 * Actions de l'agronome sur une mission. Accepter et Terminer exigent la carte
 * agronome active ET son PIN (vérifiés côté serveur) ; Refuser n'en a pas
 * besoin. Le PIN n'est jamais conservé dans le navigateur.
 */

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle2, KeyRound, Loader2, XCircle } from 'lucide-react'
import { useState } from 'react'

type Action = 'accept' | 'complete' | 'refuse'

export function MissionActions({
  missionId,
  statut,
  hasCard,
  onChanged,
}: {
  missionId: string
  statut: string
  hasCard: boolean
  onChanged: () => void
}) {
  const [pending, setPending] = useState<Action | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (statut !== 'DEMANDE' && statut !== 'EN_COURS') return null

  if (!hasCard) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Carte agronome requise pour prendre cette mission. Elle est émise par FaîtiereHub après
        validation de votre profil.
      </p>
    )
  }

  const send = async (action: Action, withPin?: string) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/haroo/missions/${missionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withPin ? { action, pin: withPin } : { action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          data.attempts_left != null && data.code === 'wrong_pin'
            ? `${data.error} Il reste ${data.attempts_left} essai${data.attempts_left > 1 ? 's' : ''}.`
            : (data.error ?? 'Action impossible.'),
        )
        return
      }
      setPending(null)
      setPin('')
      onChanged()
    } catch {
      setError('Erreur de connexion.')
    } finally {
      setBusy(false)
    }
  }

  if (pending === 'accept' || pending === 'complete') {
    return (
      <form
        className="space-y-2 rounded-md border border-border bg-muted/40 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send(pending, pin)
        }}
      >
        <label
          htmlFor={`pin-${missionId}`}
          className="flex items-center gap-1.5 text-xs font-semibold"
        >
          <KeyRound className="h-3.5 w-3.5" /> PIN de votre carte agronome
        </label>
        <Input
          id={`pin-${missionId}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••••"
          className="font-mono tracking-[0.4em]"
          autoFocus
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy || pin.length !== 6} className="gap-1.5">
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {pending === 'accept' ? 'Confirmer et accepter' : 'Confirmer la fin'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setPending(null)
              setPin('')
              setError('')
            }}
          >
            Annuler
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {statut === 'DEMANDE' ? (
          <>
            <Button size="sm" className="gap-1.5" onClick={() => setPending('accept')}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Accepter
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-destructive"
              disabled={busy}
              onClick={() => void send('refuse')}
            >
              <XCircle className="h-3.5 w-3.5" /> Refuser
            </Button>
          </>
        ) : (
          <Button size="sm" className="gap-1.5" onClick={() => setPending('complete')}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Mission terminée
          </Button>
        )}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
