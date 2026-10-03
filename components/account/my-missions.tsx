'use client'

/** « Mes demandes de mission » — suivi côté exploitant, retrait et avis. */

import { Button } from '@/components/ui/button'
import { Star } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface MyMission {
  id: string
  description: string | null
  culture: string | null
  statut: string
  created_at: string
  rating: number | null
  cancel_reason: string | null
  haroo_agronome_profiles: { first_name: string | null; last_name: string | null } | null
}

const STATUT: Record<string, string> = {
  DEMANDE: 'En attente de l’agronome',
  EN_COURS: 'Acceptée — en cours',
  TERMINEE: 'Terminée',
  ANNULEE: 'Annulée',
}

export function MyMissions() {
  const [items, setItems] = useState<MyMission[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetch('/api/haroo/missions', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { missions: [] }))
      .then((d) => setItems(d.missions ?? []))
      .catch(() => setItems([]))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const act = async (id: string, body: Record<string, unknown>) => {
    setBusy(id)
    setError('')
    const res = await fetch(`/api/haroo/missions/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error ?? 'Action impossible.')
    setBusy(null)
    load()
  }

  if (!items) return null
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune demande. Scannez la carte d’un agronome certifié pour lui demander une mission.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {items.map((m) => {
        const who =
          `${m.haroo_agronome_profiles?.first_name ?? ''} ${m.haroo_agronome_profiles?.last_name ?? ''}`.trim()
        return (
          <div key={m.id} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{who || 'Agronome'}</p>
              <span className="text-xs text-muted-foreground">{STATUT[m.statut] ?? m.statut}</span>
            </div>
            {m.description ? (
              <p className="text-sm text-muted-foreground">{m.description}</p>
            ) : null}
            {m.statut === 'ANNULEE' && m.cancel_reason ? (
              <p className="text-xs text-muted-foreground">{m.cancel_reason}</p>
            ) : null}
            {m.statut === 'DEMANDE' ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy === m.id}
                onClick={() => act(m.id, { action: 'cancel' })}
              >
                Retirer ma demande
              </Button>
            ) : null}
            {m.statut === 'TERMINEE' && m.rating == null ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-muted-foreground">Votre avis :</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} sur 5`}
                    disabled={busy === m.id}
                    onClick={() => act(m.id, { action: 'rate', rating: n })}
                    className="rounded p-1 text-amber-500 hover:bg-amber-50"
                  >
                    <Star className="h-5 w-5" />
                  </button>
                ))}
              </div>
            ) : null}
            {m.rating ? (
              <p className="text-xs text-muted-foreground">Votre avis : {m.rating}/5</p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
