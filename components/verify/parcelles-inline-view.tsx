'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Sprout, Map, Droplets, Navigation, CalendarDays } from 'lucide-react'

interface Parcelle {
  name: string | null
  culture_principale: string | null
  culture_name: string | null
  superficie_ha: number | null
  surface_ha: number | null
  soil_type: string | null
  irrigation_type: string | null
  gps_coordinates: string | null
  campaign_year: string | null
  source: string | null
  created_at: string
}

interface Props {
  cardNumber: string
  onBack: () => void
  onOpenAgriSmart?: () => void
}

const IRRIG_LABEL: Record<string, string> = { oui: 'Irriguée', non: 'Pluviale', partielle: 'Partielle' }
const SOL_COLOR: Record<string, string> = {
  argileux: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  limoneux: 'bg-green-500/15 text-green-300 border-green-500/20',
  sableux: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20',
  laterite: 'bg-orange-500/15 text-orange-300 border-orange-500/20',
}

export function ParcellesInlineView({ cardNumber, onBack, onOpenAgriSmart }: Props) {
  const [parcelles, setParcelles] = useState<Parcelle[] | null>(null)
  const [totalHa, setTotalHa] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const loadData = () => {
    setError(false)
    setLoading(true)
    fetch(`/api/verify/${encodeURIComponent(cardNumber)}/parcelles`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        if (d) { setParcelles(d.parcelles ?? []); setTotalHa(d.total_ha ?? 0) }
        else setParcelles([])
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardNumber])

  const list = parcelles ?? []
  const cultures = new Set(list.map(p => p.culture_principale ?? p.culture_name).filter(Boolean))

  return (
    <div className="space-y-4 vfp-enter">
      <button onClick={onBack} className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>
      <h3 className="text-white text-lg font-bold">Mes Parcelles</h3>

      {loading && (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-3 gap-2">
            {[1,2,3].map(i => <div key={i} className="vfp-card rounded-2xl p-3 h-16" />)}
          </div>
          {[1,2,3].map(i => (
            <div key={i} className="vfp-card rounded-2xl p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between gap-2">
                  <div className="h-3.5 rounded-full bg-white/10 w-1/2" />
                  <div className="h-3 w-12 rounded-full bg-white/8" />
                </div>
                <div className="flex gap-2">
                  <div className="h-5 w-20 rounded-full bg-white/6" />
                  <div className="h-5 w-16 rounded-full bg-white/6" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="vfp-card rounded-2xl p-6 text-center space-y-3">
          <Map className="h-8 w-8 text-white/20 mx-auto" />
          <p className="text-white/50 text-sm">Impossible de charger les données des parcelles.</p>
          <button
            onClick={loadData}
            className="text-[var(--vfp-accent)] text-sm font-semibold underline-offset-2 underline active:opacity-60"
          >
            Réessayer
          </button>
        </div>
      )}

      {!loading && !error && list.length === 0 && (
        <div className="vfp-card rounded-2xl p-8 text-center">
          <Map className="h-10 w-10 text-white/15 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Aucune parcelle enregistrée.</p>
          <p className="text-white/25 text-xs mt-1">Données collectées via KoboCollect</p>
        </div>
      )}

      {!loading && !error && list.length > 0 && (
        <>
          {/* Summary chips */}
          <div className="grid grid-cols-3 gap-2">
            <div className="vfp-card rounded-2xl p-3 text-center">
              <p className="text-[var(--vfp-accent)] text-xl font-bold">{list.length}</p>
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

          {/* Parcelle cards */}
          <div className="space-y-2.5">
            {list.map((p, i) => {
              const culture = p.culture_principale ?? p.culture_name ?? 'Parcelle'
              const surface = p.superficie_ha ?? p.surface_ha
              const solClass = SOL_COLOR[p.soil_type?.toLowerCase() ?? ''] ?? 'bg-white/5 text-white/50 border-white/8'
              const irrigLabel = IRRIG_LABEL[p.irrigation_type?.toLowerCase() ?? ''] ?? p.irrigation_type
              const isExpanded = expandedIdx === i

              return (
                <div key={i} className="vfp-card rounded-2xl overflow-hidden">
                  <button
                    className="w-full p-4 flex items-start gap-3 text-left active:opacity-70"
                    onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                      <Sprout className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-white truncate">
                          {p.name ?? culture}
                        </span>
                        {surface != null && (
                          <span className="text-xs font-mono text-[var(--vfp-accent)] shrink-0">
                            {surface.toFixed(2)} ha
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {p.name && (
                          <span className="text-xs text-white/50">{culture}</span>
                        )}
                        {p.soil_type && (
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${solClass}`}>
                            {p.soil_type}
                          </span>
                        )}
                        {irrigLabel && (
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${irrigLabel === 'Irriguée' ? 'bg-blue-500/15 text-blue-300 border-blue-500/20' : 'bg-white/5 text-white/40 border-white/8'}`}>
                            {irrigLabel === 'Irriguée' && <Droplets className="h-2.5 w-2.5 inline mr-0.5" />}
                            {irrigLabel}
                          </span>
                        )}
                        {p.campaign_year && (
                          <span className="text-[11px] text-white/30">
                            <CalendarDays className="h-2.5 w-2.5 inline mr-0.5" />
                            {p.campaign_year}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`w-4 h-4 shrink-0 mt-1 text-white/30 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 5l6 6 6-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-white/[0.06] pt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {surface != null && (
                          <div>
                            <p className="text-[10px] text-white/30 uppercase tracking-wider">Surface</p>
                            <p className="text-xs text-white font-mono">{surface.toFixed(4)} ha · {Math.round(surface * 10000).toLocaleString('fr-FR')} m²</p>
                          </div>
                        )}
                        {p.soil_type && (
                          <div>
                            <p className="text-[10px] text-white/30 uppercase tracking-wider">Type de sol</p>
                            <p className="text-xs text-white capitalize">{p.soil_type}</p>
                          </div>
                        )}
                        {irrigLabel && (
                          <div>
                            <p className="text-[10px] text-white/30 uppercase tracking-wider">Irrigation</p>
                            <p className="text-xs text-white">{irrigLabel}</p>
                          </div>
                        )}
                        {p.campaign_year && (
                          <div>
                            <p className="text-[10px] text-white/30 uppercase tracking-wider">Campagne</p>
                            <p className="text-xs text-white">{p.campaign_year}</p>
                          </div>
                        )}
                        {p.source && (
                          <div>
                            <p className="text-[10px] text-white/30 uppercase tracking-wider">Source</p>
                            <p className="text-xs text-white capitalize">{p.source}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] text-white/30 uppercase tracking-wider">Enregistrée</p>
                          <p className="text-xs text-white/60">{new Date(p.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
                        </div>
                      </div>

                      {p.gps_coordinates && (
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(p.gps_coordinates)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[11px] text-[var(--vfp-accent)] mt-1 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Navigation className="h-3 w-3 shrink-0" />
                          <span className="font-mono truncate">{p.gps_coordinates}</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {onOpenAgriSmart && (
            <button
              onClick={onOpenAgriSmart}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-blue-500/25 bg-blue-500/8 text-blue-300 text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              <Droplets className="h-4 w-4" />
              Calculer mes besoins en eau
            </button>
          )}

          <p className="text-center text-[11px] text-white/20 pt-1">
            Données collectées via KoboCollect · FaîtiereHub
          </p>
        </>
      )}
    </div>
  )
}
