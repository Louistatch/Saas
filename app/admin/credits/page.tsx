'use client'

// Demandes de crédit des membres (lecture seule) : l'instruction se fait par les coopératives.
import { useEffect, useState } from 'react'

interface Credit {
  id: string
  status: string
  amount_requested_fcfa: number | null
  amount_approved_fcfa: number | null
  purpose: string | null
  duration_months: number | null
  credit_grade: string | null
  created_at: string
  cooperative: { name: string } | null
}

const LABEL: Record<string, string> = {
  pending: 'En attente',
  submitted: 'Déposée',
  scoring: 'Évaluation en cours',
  under_review: 'En instruction',
  approved: 'Accordée',
  rejected: 'Refusée',
  disbursed: 'Versée',
  closed: 'Clôturée',
  expired: 'Expirée',
  repaid: 'Remboursée',
}
const DONE = ['approved', 'rejected', 'disbursed', 'closed', 'expired', 'cancelled', 'repaid']
const fcfa = (n: number | null) =>
  n == null ? '—' : `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`

export default function CreditsPage() {
  const [rows, setRows] = useState<Credit[] | null>(null)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    fetch('/api/admin/queues?type=credit', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => setRows(d.rows ?? []))
      .catch(() => setRows([]))
  }, [])

  const shown = (rows ?? []).filter((c) => DONE.includes(c.status) !== open)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Demandes de crédit</h1>
        <p className="text-sm text-muted-foreground">
          Vue d’ensemble des demandes des membres. Leur instruction se fait par chaque coopérative.
        </p>
      </header>
      <div className="flex gap-2" aria-label="Filtrer les demandes">
        {(
          [
            [true, 'En cours'],
            [false, 'Terminées'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={open === value}
            onClick={() => setOpen(value)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              open === value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Chargement des demandes…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl bg-primary/5 px-5 py-4 text-sm">
          Aucune demande dans cette catégorie.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {shown.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block font-medium text-foreground">
                  {c.cooperative?.name ?? 'Organisation inconnue'}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {c.purpose ?? 'Objet non précisé'}
                  {c.duration_months ? `, ${c.duration_months} mois` : ''}
                  {c.credit_grade ? `, note ${c.credit_grade}` : ''}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-sm tabular-nums text-foreground">
                  {fcfa(c.amount_requested_fcfa)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {LABEL[c.status] ?? c.status}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
