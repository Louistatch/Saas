'use client'

// Suivi des commandes d'impression de cartes (lecture seule) : où en est chaque commande,
// de la demande à la livraison. L'impression et la livraison se font dans l'espace opérateur.
import { useEffect, useState } from 'react'

interface Order {
  id: string
  status: 'requested' | 'paid' | 'printed' | 'delivered' | 'cancelled'
  amount_fcfa: number | null
  provider: string | null
  created_at: string
  paid_at: string | null
  printed_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  cooperative: { name: string } | null
}

const STEPS = [
  ['requested', 'Demandée', 'created_at'],
  ['paid', 'Payée', 'paid_at'],
  ['printed', 'Imprimée', 'printed_at'],
  ['delivered', 'Livrée', 'delivered_at'],
] as const
const NEXT: Record<Order['status'], string> = {
  requested: 'En attente du paiement de l’organisation.',
  paid: 'À imprimer par l’opérateur.',
  printed: 'À livrer à l’organisation.',
  delivered: 'Terminée.',
  cancelled: 'Annulée.',
}
const FILTERS = [
  ['open', 'En cours'],
  ['delivered', 'Livrées'],
  ['cancelled', 'Annulées'],
] as const

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null

export default function CardOrdersPage() {
  const [rows, setRows] = useState<Order[] | null>(null)
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('open')

  useEffect(() => {
    fetch('/api/admin/queues?type=print', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => setRows(d.rows ?? []))
      .catch(() => setRows([]))
  }, [])

  const shown = (rows ?? []).filter((o) =>
    filter === 'open' ? !['delivered', 'cancelled'].includes(o.status) : o.status === filter,
  )

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Commandes de cartes</h1>
        <p className="text-sm text-muted-foreground">
          Suivi des impressions demandées par les organisations, de la demande à la livraison.
        </p>
      </header>
      <div className="flex gap-2" aria-label="Filtrer les commandes">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              filter === value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Chargement des commandes…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl bg-primary/5 px-5 py-4 text-sm">
          Aucune commande dans cette catégorie.
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((o) => {
            const reached = o.status === 'cancelled' ? -1 : STEPS.findIndex(([s]) => s === o.status)
            return (
              <li key={o.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-foreground">
                    {o.cooperative?.name ?? 'Organisation inconnue'}
                  </p>
                  {o.amount_fcfa != null && (
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {new Intl.NumberFormat('fr-FR').format(o.amount_fcfa)} FCFA
                    </p>
                  )}
                </div>
                <ol className="grid grid-cols-4 gap-1" aria-label="Avancement">
                  {STEPS.map(([key, label, field], i) => (
                    <li key={key} className="space-y-1">
                      <span
                        aria-hidden="true"
                        className={`block h-1.5 rounded-full ${i <= reached ? 'bg-primary' : 'bg-muted'}`}
                      />
                      <span
                        className={`block text-xs ${i <= reached ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        {label}
                        {i <= reached && day(o[field]) ? `, ${day(o[field])}` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="text-sm text-foreground">{NEXT[o.status]}</p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
