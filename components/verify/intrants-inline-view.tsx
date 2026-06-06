'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ShoppingCart, ChevronDown, ChevronUp } from 'lucide-react'

interface Intrant {
  id: string
  name: string
  type: string | null
  quantity: number | null
  unit: string | null
  cost_fcfa: number | null
  purchase_date: string | null
  supplier: string | null
}

interface Props {
  cardNumber: string
  onBack: () => void
}

const TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  semence:   { icon: '🌱', label: 'Semences',   color: 'border-emerald-500/25 bg-emerald-500/8' },
  engrais:   { icon: '🪣', label: 'Engrais',    color: 'border-blue-500/25 bg-blue-500/8' },
  pesticide: { icon: '🧪', label: 'Pesticides', color: 'border-amber-500/25 bg-amber-500/8' },
  outil:     { icon: '🔧', label: 'Outils',     color: 'border-slate-500/25 bg-slate-500/8' },
  autre:     { icon: '📦', label: 'Autres',     color: 'border-white/10 bg-white/5' },
}
const TYPE_ORDER = ['semence', 'engrais', 'pesticide', 'outil', 'autre']

export function IntrantsInlineView({ cardNumber, onBack }: Props) {
  const [intrants, setIntrants] = useState<Intrant[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch(`/api/verify/${encodeURIComponent(cardNumber)}/intrants`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setIntrants(d?.intrants ?? []))
      .catch(() => setIntrants([]))
      .finally(() => setLoading(false))
  }, [cardNumber])

  const totalCost = (intrants ?? []).reduce((s, i) => s + (i.cost_fcfa ?? 0), 0)

  // Group by type
  const groups = TYPE_ORDER.map(type => {
    const items = (intrants ?? []).filter(i => (i.type ?? 'autre') === type)
    const cost = items.reduce((s, i) => s + (i.cost_fcfa ?? 0), 0)
    return { type, items, cost }
  }).filter(g => g.items.length > 0)

  const toggle = (type: string) => setExpanded(prev => ({ ...prev, [type]: !prev[type] }))

  return (
    <div className="space-y-4 vfp-enter">
      <button onClick={onBack} className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>
      <h3 className="text-white text-lg font-bold">Mes Intrants</h3>

      {loading && (
        <div className="vfp-card rounded-2xl p-8 text-center">
          <div className="vfp-loader mx-auto" />
          <p className="text-white/40 text-sm mt-3">Chargement...</p>
        </div>
      )}

      {!loading && (intrants ?? []).length === 0 && (
        <div className="vfp-card rounded-2xl p-8 text-center">
          <ShoppingCart className="h-10 w-10 text-white/15 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Aucun intrant enregistré.</p>
          <p className="text-white/25 text-xs mt-1">Semences, engrais et outils apparaîtront ici.</p>
        </div>
      )}

      {!loading && groups.length > 0 && (
        <>
          {/* Total + breakdown */}
          {totalCost > 0 && (
            <div className="vfp-card rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/50 text-sm">Total investi</span>
                <span className="text-[var(--vfp-accent)] font-bold text-base">
                  {totalCost.toLocaleString('fr-FR')} XOF
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {groups.filter(g => g.cost > 0).map(g => {
                  const meta = TYPE_META[g.type] ?? TYPE_META.autre
                  const pct = Math.round((g.cost / totalCost) * 100)
                  return (
                    <div key={g.type} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${meta.color}`}>
                      <span>{meta.icon}</span>
                      <span className="text-white/70">{meta.label}</span>
                      <span className="font-bold text-white/90">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Groups */}
          {groups.map(({ type, items, cost }) => {
            const meta = TYPE_META[type] ?? TYPE_META.autre
            const isOpen = expanded[type] ?? false
            return (
              <div key={type} className="vfp-card rounded-2xl overflow-hidden">
                <button
                  onClick={() => toggle(type)}
                  className="w-full flex items-center gap-3 p-4"
                >
                  <span className="text-xl w-8 text-center shrink-0">{meta.icon}</span>
                  <div className="flex-1 text-left">
                    <p className="text-white font-semibold text-sm">{meta.label}</p>
                    <p className="text-white/40 text-xs">{items.length} article{items.length > 1 ? 's' : ''}{cost > 0 ? ` · ${cost.toLocaleString('fr-FR')} XOF` : ''}</p>
                  </div>
                  {isOpen
                    ? <ChevronUp className="h-4 w-4 text-white/30 shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-white/30 shrink-0" />}
                </button>

                {isOpen && (
                  <div className="border-t border-white/[0.06] px-4 pb-3 space-y-2 pt-2">
                    {items.map((item, i) => (
                      <div key={item.id ?? i} className="flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-white truncate">{item.name}</span>
                            {item.cost_fcfa != null && item.cost_fcfa > 0 && (
                              <span className="text-xs font-mono text-amber-300/80 shrink-0">
                                {item.cost_fcfa.toLocaleString('fr-FR')} XOF
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {item.quantity != null && item.unit && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 text-white/45 border border-white/8">
                                {item.quantity} {item.unit}
                              </span>
                            )}
                            {item.purchase_date && (
                              <span className="text-[11px] text-white/25">
                                {new Date(item.purchase_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                              </span>
                            )}
                            {item.supplier && (
                              <span className="text-[11px] text-white/30 truncate">{item.supplier}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
