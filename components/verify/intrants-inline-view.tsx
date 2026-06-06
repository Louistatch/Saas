'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ShoppingCart } from 'lucide-react'

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

const TYPE_ICON: Record<string, string> = {
  semence: '🌱',
  engrais: '🪣',
  pesticide: '🧪',
  outil: '🔧',
  autre: '📦',
}

export function IntrantsInlineView({ cardNumber, onBack }: Props) {
  const [intrants, setIntrants] = useState<Intrant[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/verify/${encodeURIComponent(cardNumber)}/intrants`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setIntrants(d?.intrants ?? []))
      .catch(() => setIntrants([]))
      .finally(() => setLoading(false))
  }, [cardNumber])

  const totalCost = (intrants ?? []).reduce((s, i) => s + (i.cost_fcfa ?? 0), 0)

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

      {!loading && (intrants ?? []).length > 0 && (
        <>
          {totalCost > 0 && (
            <div className="vfp-card rounded-2xl p-4 flex items-center justify-between">
              <span className="text-white/50 text-sm">Total investi</span>
              <span className="text-[var(--vfp-accent)] font-bold text-base">
                {totalCost.toLocaleString('fr-FR')} XOF
              </span>
            </div>
          )}

          <div className="space-y-2.5">
            {(intrants as Intrant[]).map((item, i) => (
              <div key={item.id ?? i} className="vfp-card rounded-2xl p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0 text-lg">
                  {TYPE_ICON[item.type ?? ''] ?? '📦'}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white truncate">{item.name}</span>
                    {item.cost_fcfa != null && (
                      <span className="text-xs font-mono text-amber-300 shrink-0">
                        {item.cost_fcfa.toLocaleString('fr-FR')} XOF
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.quantity != null && item.unit && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-white/50 border border-white/8">
                        {item.quantity} {item.unit}
                      </span>
                    )}
                    {item.type && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-300/80 border border-orange-500/15 capitalize">
                        {item.type}
                      </span>
                    )}
                    {item.purchase_date && (
                      <span className="text-[11px] text-white/30">
                        {new Date(item.purchase_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                  {item.supplier && (
                    <p className="text-xs text-white/30">{item.supplier}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
