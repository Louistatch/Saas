'use client'

/**
 * Espace /haroo (site) — annonces « mission » du Marché proches de l'agronome.
 * Même règle que sur la carte : PIN de la carte pour prendre une mission.
 */

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Loader2, Store } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface MarketMission {
  id: string
  title: string
  culture: string | null
  canton: string | null
  prefecture: string | null
  region: string | null
}

export function MarketMissions({ hasCard, onTaken }: { hasCard: boolean; onTaken: () => void }) {
  const [items, setItems] = useState<MarketMission[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetch('/api/haroo/missions/take', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { announcements: [] }))
      .then((d) => setItems(d.announcements ?? []))
      .catch(() => setItems([]))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const take = async (id: string) => {
    setBusy(true)
    setError('')
    const res = await fetch('/api/haroo/missions/take', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ announcement_id: id, pin }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(data.error ?? 'Prise impossible.')
      return
    }
    setOpen(null)
    setPin('')
    load()
    onTaken()
  }

  if (items.length === 0) return null
  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" /> Missions du marché près de chez vous
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((a) => (
          <div key={a.id} className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-sm font-semibold text-foreground">{a.title}</p>
            <p className="text-xs text-muted-foreground">
              {[a.culture, a.canton ?? a.prefecture ?? a.region].filter(Boolean).join(' · ')}
            </p>
            {!hasCard ? (
              <p className="text-xs text-amber-800">Carte agronome requise pour prendre une mission.</p>
            ) : open === a.id ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void take(a.id)
                }}
              >
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="PIN de la carte"
                  aria-label="PIN de la carte"
                  className="w-40 font-mono tracking-widest"
                  autoFocus
                />
                <Button type="submit" size="sm" disabled={busy || pin.length !== 6}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Prendre
                </Button>
              </form>
            ) : (
              <Button size="sm" onClick={() => setOpen(a.id)}>
                Prendre cette mission
              </Button>
            )}
            {open === a.id && error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
