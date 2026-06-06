'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Coins, CheckCircle, AlertCircle, Clock } from 'lucide-react'

interface Cotisation {
  id: string
  campaign: string | null
  status: string | null
  amount: number | null
  currency: string | null
  type: string | null
  due_date: string | null
  paid_date: string | null
  notes: string | null
}

interface Summary {
  last_campaign: string | null
  last_status: string | null
  last_amount: number | null
  currency: string
  is_paid: boolean
  is_overdue: boolean
  due_date: string | null
  paid_date: string | null
}

interface Props {
  cardNumber: string
  onBack: () => void
}

const STATUS_LABEL: Record<string, { label: string; color: string; Icon: typeof CheckCircle }> = {
  paid:    { label: 'Payée',    color: 'text-emerald-400', Icon: CheckCircle },
  pending: { label: 'En attente', color: 'text-amber-400', Icon: Clock },
  overdue: { label: 'En retard', color: 'text-red-400',   Icon: AlertCircle },
  waived:  { label: 'Exonérée', color: 'text-blue-400',   Icon: CheckCircle },
}

function getStatusInfo(status: string | null, isOverdue: boolean) {
  if (isOverdue) return STATUS_LABEL.overdue
  return STATUS_LABEL[status ?? ''] ?? { label: status ?? 'Inconnu', color: 'text-white/40', Icon: Clock }
}

export function CotisationView({ cardNumber, onBack }: Props) {
  const [cotisations, setCotisations] = useState<Cotisation[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/verify/${encodeURIComponent(cardNumber)}/cotisation`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setCotisations(d.cotisations ?? []); setSummary(d.summary) }
        else setCotisations([])
      })
      .catch(() => setCotisations([]))
      .finally(() => setLoading(false))
  }, [cardNumber])

  const statusInfo = summary ? getStatusInfo(summary.last_status, summary.is_overdue) : null

  return (
    <div className="space-y-4 vfp-enter">
      <button onClick={onBack} className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>
      <h3 className="text-white text-lg font-bold">Ma Cotisation</h3>

      {loading && (
        <div className="vfp-card rounded-2xl p-8 text-center">
          <div className="vfp-loader mx-auto" />
          <p className="text-white/40 text-sm mt-3">Chargement...</p>
        </div>
      )}

      {!loading && (cotisations ?? []).length === 0 && (
        <div className="vfp-card rounded-2xl p-8 text-center">
          <Coins className="h-10 w-10 text-white/15 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Aucune cotisation enregistrée.</p>
          <p className="text-white/25 text-xs mt-1">Contactez votre coopérative pour adhérer.</p>
        </div>
      )}

      {!loading && summary && (cotisations ?? []).length > 0 && (
        <>
          {/* Status card */}
          <div className="vfp-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              {statusInfo && <statusInfo.Icon className={`h-6 w-6 ${statusInfo.color}`} />}
              <div>
                <p className="text-white font-semibold text-base">
                  Campagne {summary.last_campaign ?? '—'}
                </p>
                <p className={`text-sm font-medium ${statusInfo?.color ?? 'text-white/50'}`}>
                  {statusInfo?.label}
                  {summary.is_overdue && summary.due_date && ` — dûe le ${new Date(summary.due_date).toLocaleDateString('fr-FR')}`}
                  {summary.is_paid && summary.paid_date && ` le ${new Date(summary.paid_date).toLocaleDateString('fr-FR')}`}
                </p>
              </div>
            </div>

            {summary.last_amount != null && (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 flex items-center justify-between">
                <span className="text-white/50 text-sm">Montant</span>
                <span className="text-white font-bold text-base">
                  {summary.last_amount.toLocaleString('fr-FR')} {summary.currency}
                </span>
              </div>
            )}

            {(summary.last_status === 'pending' || summary.is_overdue) && (
              <div className="pt-1">
                <p className="text-white/40 text-xs text-center">
                  Pour payer votre cotisation, contactez votre coopérative ou votre coordonnateur.
                </p>
              </div>
            )}
          </div>

          {/* History */}
          {(cotisations ?? []).length > 1 && (
            <div className="space-y-2">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider px-1">Historique</p>
              {(cotisations as Cotisation[]).slice(1).map((c, i) => {
                const si = getStatusInfo(c.status, !!(c.status === 'pending' && c.due_date && new Date(c.due_date) < new Date()))
                return (
                  <div key={c.id ?? i} className="vfp-card rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">{c.campaign ?? '—'}</p>
                      <p className={`text-xs ${si.color}`}>{si.label}</p>
                    </div>
                    {c.amount != null && (
                      <span className="text-white/60 text-sm font-mono">
                        {c.amount.toLocaleString('fr-FR')} {c.currency ?? 'XOF'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
