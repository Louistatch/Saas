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
  coordoPhone?: string | null
  coordoName?: string | null
  memberName?: string
  memberCanton?: string | null
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

export function CotisationView({ cardNumber, onBack, coordoPhone, coordoName, memberName, memberCanton }: Props) {
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

  const allCotisations = cotisations ?? []
  const totalCampagnes = allCotisations.length
  const payeeCount = allCotisations.filter(c => c.status === 'paid' || c.status === 'waived').length
  const tauxRegularite = totalCampagnes > 0 ? Math.round((payeeCount / totalCampagnes) * 100) : null

  const waCoordoHref = coordoPhone
    ? `https://wa.me/${coordoPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Bonjour${coordoName ? ` ${coordoName}` : ''}, je suis ${memberName ?? 'un producteur'}${memberCanton ? ` (canton ${memberCanton})` : ''}. Je souhaite régulariser ma cotisation.`)}`
    : null

  return (
    <div className="space-y-4 vfp-enter">
      <button onClick={onBack} className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>
      <h3 className="text-white text-lg font-bold">Ma Cotisation</h3>

      {loading && (
        <div className="space-y-3 animate-pulse">
          <div className="vfp-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-white/10" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 rounded-full bg-white/10 w-2/3" />
                <div className="h-3 rounded-full bg-white/6 w-1/2" />
              </div>
            </div>
            <div className="h-10 rounded-xl bg-white/6" />
          </div>
          <div className="h-16 rounded-2xl bg-white/4" />
          <div className="h-12 rounded-xl bg-white/4" />
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
              <div className={`rounded-xl border p-3 ${summary.is_overdue ? 'border-red-500/30 bg-red-500/8' : 'border-amber-500/30 bg-amber-500/8'}`}>
                <p className={`text-xs font-semibold mb-1 ${summary.is_overdue ? 'text-red-300' : 'text-amber-300'}`}>
                  {summary.is_overdue ? '⚠️ Cotisation en retard' : '💡 Cotisation en attente'}
                </p>
                <p className="text-white/50 text-xs mb-2">
                  {summary.is_overdue
                    ? 'Votre cotisation est échue. Régularisez pour conserver vos droits.'
                    : 'Votre cotisation est due. Contactez votre coordonnateur pour payer.'}
                </p>
                {waCoordoHref && (
                  <a
                    href={waCoordoHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-2 rounded-lg bg-[#25D366]/15 border border-[#25D366]/25 text-[#25D366] text-xs font-bold active:scale-95 transition-transform"
                  >
                    💬 Contacter {coordoName ?? 'le coordonnateur'} sur WhatsApp
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Campaign timeline strip */}
          {totalCampagnes >= 2 && (
            <div className="vfp-card rounded-2xl p-4">
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-3">Historique campagnes</p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                {(cotisations as Cotisation[]).map((c, i) => {
                  const isOver = !!(c.status === 'pending' && c.due_date && new Date(c.due_date) < new Date())
                  const si = getStatusInfo(c.status, isOver)
                  const dotColor = si.color.replace('text-', 'bg-').replace('-400', '-500')
                  return (
                    <div key={c.id ?? i} className="flex flex-col items-center gap-1.5 shrink-0 min-w-[52px]">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                        c.status === 'paid' || c.status === 'waived'
                          ? 'border-emerald-500/50 bg-emerald-500/15'
                          : isOver
                          ? 'border-red-500/50 bg-red-500/15'
                          : 'border-amber-500/50 bg-amber-500/15'
                      }`}>
                        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                      </div>
                      <p className="text-[10px] text-white/50 text-center leading-tight">{c.campaign?.replace(/^(Campagne\s+)?/i, '') ?? '—'}</p>
                      {c.amount != null && (
                        <p className="text-[9px] text-white/30 font-mono">{(c.amount / 1000).toFixed(0)}k</p>
                      )}
                    </div>
                  )
                }).reverse()}
              </div>
            </div>
          )}

          {/* Taux de régularité */}
          {tauxRegularite !== null && totalCampagnes >= 2 && (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/50 text-xs">Taux de régularité</span>
                <span className={`text-sm font-bold ${tauxRegularite >= 80 ? 'text-emerald-400' : tauxRegularite >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {tauxRegularite}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${tauxRegularite >= 80 ? 'bg-emerald-400' : tauxRegularite >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${tauxRegularite}%` }}
                />
              </div>
              <p className="text-white/30 text-[11px] mt-1">{payeeCount} payée{payeeCount > 1 ? 's' : ''} sur {totalCampagnes} campagne{totalCampagnes > 1 ? 's' : ''}</p>
            </div>
          )}

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
