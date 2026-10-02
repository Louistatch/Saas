'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KeyRound } from 'lucide-react'
import { useMemo, useState } from 'react'

export interface CarteRow {
  cardNumber: string
  status: string
  expiry: string | null
  memberName: string
  cooperative: string
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  revoked: 'Révoquée',
  expired: 'Expirée',
}

export function CartesTable({ cards }: { cards: CarteRow[] }) {
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ card: string; pin: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return cards
    return cards.filter((c) =>
      `${c.cardNumber} ${c.memberName} ${c.cooperative}`.toLowerCase().includes(q),
    )
  }, [cards, search])

  const issue = async (card: CarteRow) => {
    if (busy) return
    if (
      !window.confirm(
        `Émettre un nouveau PIN pour ${card.cardNumber} (${card.memberName}) ?\nS'il en existe un, il sera remplacé.`,
      )
    ) {
      return
    }
    setBusy(card.cardNumber)
    setError(null)
    try {
      const res = await fetch('/api/cards/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_number: card.cardNumber }),
      })
      const data = (await res.json().catch(() => ({}))) as { pin?: string; error?: string }
      if (!res.ok || !data.pin) throw new Error(data.error ?? "Impossible d'émettre le PIN.")
      setIssued({ card: card.cardNumber, pin: data.pin })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'émettre le PIN.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un numéro, un membre, une coopérative…"
        aria-label="Rechercher une carte"
      />

      {error && (
        <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {issued && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            PIN de la carte <strong className="text-foreground">{issued.card}</strong> — notez-le,
            il ne sera plus affiché.
          </p>
          <p className="text-4xl font-bold tracking-[0.4em] tabular-nums">{issued.pin}</p>
          <Button size="sm" onClick={() => setIssued(null)}>
            J&apos;ai remis le PIN
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {filtered.length} carte{filtered.length > 1 ? 's' : ''}
      </p>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Carte</th>
              <th className="px-3 py-2">Membre</th>
              <th className="px-3 py-2 hidden md:table-cell">Coopérative</th>
              <th className="px-3 py-2 hidden sm:table-cell">Statut</th>
              <th className="px-3 py-2 text-right">PIN</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.cardNumber} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{c.cardNumber}</td>
                <td className="px-3 py-2">{c.memberName}</td>
                <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">
                  {c.cooperative}
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  {STATUS_LABEL[c.status] ?? c.status}
                </td>
                <td className="px-3 py-2 text-right">
                  {c.status === 'active' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => issue(c)}
                      disabled={busy === c.cardNumber}
                      aria-label={`Émettre un PIN pour ${c.cardNumber}`}
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Aucune carte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
