'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Sprout, Map } from 'lucide-react'

interface Parcelle {
  name: string | null
  culture_principale: string | null
  superficie_ha: number | null
  created_at: string
}

interface Props {
  cardNumber: string
  onBack: () => void
}

export function ParcellesInlineView({ cardNumber, onBack }: Props) {
  const [parcelles, setParcelles] = useState<Parcelle[] | null>(null)
  const [totalHa, setTotalHa] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/verify/${encodeURIComponent(cardNumber)}/parcelles`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setParcelles(d.parcelles ?? []); setTotalHa(d.total_ha ?? 0) }
        else setParcelles([])
      })
      .catch(() => setParcelles([]))
      .finally(() => setLoading(false))
  }, [cardNumber])

  const cultures = new Set((parcelles ?? []).map(p => p.culture_principale).filter(Boolean))

  return (
    <div className="space-y-4 vfp-enter">
      <button onClick={onBack} className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>
      <h3 className="text-white text-lg font-bold">Mes Parcelles</h3>

      {loading && (
        <div className="vfp-card rounded-2xl p-8 text-center">
          <div className="vfp-loader mx-auto" />
          <p className="text-white/40 text-sm mt-3">Chargement...</p>
        </div>
      )}

      {!loading && (parcelles ?? []).length === 0 && (
        <div className="vfp-card rounded-2xl p-8 text-center">
          <Map className="h-10 w-10 text-white/15 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Aucune parcelle enregistrée.</p>
          <p className="text-white/25 text-xs mt-1">Données collectées via KoboCollect</p>
        </div>
      )}

      {!loading && (parcelles ?? []).length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="vfp-card rounded-2xl p-3 text-center">
              <p className="text-[var(--vfp-accent)] text-xl font-bold">{(parcelles ?? []).length}</p>
              <p className="text-white/40 text-[11px] mt-0.5">Parcelles</p>
            </div>
            <div className="vfp-card rounded-2xl p-3 text-center">
              <p className="text-[var(--vfp-accent)] text-xl font-bold">{totalHa.toFixed(1)}</p>
              <p className="text-white/40 text-[11px] mt-0.5">Hectares</p>
            </div>
            <div className="vfp-card rounded-2xl p-3 text-center">
              <p className="text-[var(--vfp-accent)] text-xl font-bold">{cultures.size}</p>
              <p className="text-white/40 text-[11px] mt-0.5">Cultures</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {(parcelles as Parcelle[]).map((p, i) => (
              <div key={i} className="vfp-card rounded-2xl p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Sprout className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white truncate">
                      {p.name ?? p.culture_principale ?? 'Parcelle'}
                    </span>
                    {p.superficie_ha != null && (
                      <span className="text-xs font-mono text-[var(--vfp-accent)] shrink-0">
                        {p.superficie_ha.toFixed(2)} ha
                      </span>
                    )}
                  </div>
                  {p.culture_principale && p.name && (
                    <p className="text-xs text-white/50">{p.culture_principale}</p>
                  )}
                  {!p.culture_principale && !p.name && (
                    <p className="text-xs text-white/30">Culture non spécifiée</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-[11px] text-white/20 pt-1">
            Données collectées via KoboCollect · FaîtiereHub
          </p>
        </>
      )}
    </div>
  )
}
