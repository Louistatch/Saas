'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { TrendingUp, MapPin } from 'lucide-react'

const REGIONS = [
  { id: 'b0f3fef0-032d-4566-9b97-89d9efcbe23b', name: 'Maritime', emoji: '🌊' },
  { id: '913db44f-9095-4ee0-8574-8ecbfad47a4a', name: 'Plateaux', emoji: '🏔️' },
  { id: '1fba6fc3-28e8-48f7-bf3e-774fce7bd9f0', name: 'Centrale', emoji: '🌾' },
  { id: 'e7becd6d-4f6e-4cb9-9f4d-f70d736800b1', name: 'Kara', emoji: '☀️' },
  { id: '801137e4-e990-4dc7-83f6-db4d9b41c42d', name: 'Savanes', emoji: '🌿' },
]

const CULTURE_LIST = [
  { id: '90b9f0cf-c879-4ac4-b3f7-98c5f2e712b7', name: 'Tomate', emoji: '🍅' },
  { id: 'c2891f71-e3d8-4f08-b5ac-992bce1ddff4', name: 'Oignon', emoji: '🧅' },
  { id: '3cb519af-7572-499e-ab58-83655f05825a', name: 'Piment', emoji: '🌶️' },
  { id: '478432bd-83c8-4923-8aa2-ceb686c0bc1e', name: 'Gombo', emoji: '🥒' },
]

interface Prefecture { id: string; name: string; priceCount?: number }
interface Canton { id: string; name: string; priceCount?: number }
interface MarketPrice { id: string; culture_id: string; market_name: string; price: number; trend: string; verified: boolean; created_at: string; cultures: { name: string } | null }

function TrendBadge({ trend }: { trend: string }) {
  if (trend === 'up') return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs font-bold">↑ Hausse</span>
  if (trend === 'down') return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs font-bold">↓ Baisse</span>
  return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/5 text-white/50 text-xs font-bold">→ Stable</span>
}

function SVGSparkline({ values, trend }: { values: number[], trend: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const W = 52, H = 22
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - ((v - min) / range) * (H - 4) - 2,
  ])
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const color = trend === 'up' ? '#f87171' : trend === 'down' ? '#4ade80' : 'rgba(255,255,255,0.3)'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 opacity-80">
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={color} />
    </svg>
  )
}

interface Props {
  onBack?: () => void
  cooperativeName?: string
  cardNumber?: string
  memberLocality?: {
    village: string | null
    canton: string | null
    prefecture: string | null
    region: string | null
  }
  compact?: boolean
  onSeeMore?: () => void
}

export function MarketPricesDashboard({ onBack, cooperativeName, cardNumber, memberLocality, compact, onSeeMore }: Props) {
  type Step = 'regions' | 'prefectures' | 'cantons' | 'prices' | 'submit'
  const [step, setStep] = useState<Step>('regions')
  const [selectedRegion, setSelectedRegion] = useState<typeof REGIONS[0] | null>(null)
  const [selectedPrefecture, setSelectedPrefecture] = useState<Prefecture | null>(null)
  const [selectedCanton, setSelectedCanton] = useState<Canton | null>(null)
  const [prefectures, setPrefectures] = useState<Prefecture[]>([])
  const [cantons, setCantons] = useState<Canton[]>([])
  const [prices, setPrices] = useState<MarketPrice[]>([])
  const [loading, setLoading] = useState(false)
  const [submitForm, setSubmitForm] = useState({ culture_id: '', price: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [regionCounts, setRegionCounts] = useState<Record<string, number>>({})

  const pricesByCulture = useMemo(() => {
    const groups: Record<string, number[]> = {}
    const sorted = [...prices].sort((a, b) => a.created_at.localeCompare(b.created_at))
    for (const p of sorted) {
      if (!groups[p.culture_id]) groups[p.culture_id] = []
      groups[p.culture_id].push(p.price)
    }
    return groups
  }, [prices])

  const sortedRegions = useMemo(() => {
    const memberRegionName = memberLocality?.region
    if (!memberRegionName) return REGIONS
    return [...REGIONS].sort((a, b) => {
      if (a.name === memberRegionName) return -1
      if (b.name === memberRegionName) return 1
      return 0
    })
  }, [memberLocality?.region])

  // Load region counts on mount
  useEffect(() => {
    fetch('/api/market-prices?action=regions')
      .then(r => r.json())
      .then(d => setRegionCounts(d.regionCounts ?? {}))
      .catch(() => {})
  }, [])

  // Fetch prefectures for a region
  const fetchPrefectures = useCallback(async (regionId: string) => {
    setLoading(true)
    const controller = new AbortController()
    try {
      const res = await fetch(`/api/market-prices?action=prefectures&region_id=${regionId}`, { signal: controller.signal })
      const data = await res.json()
      if (!controller.signal.aborted) setPrefectures(data.prefectures ?? [])
    } catch (e: unknown) { if (!(e instanceof Error && e.name === 'AbortError')) setPrefectures([]) }
    if (!controller.signal.aborted) setLoading(false)
  }, [])

  // Fetch cantons for a prefecture
  const fetchCantons = useCallback(async (prefectureId: string) => {
    setLoading(true)
    const controller = new AbortController()
    try {
      const res = await fetch(`/api/market-prices?action=cantons&prefecture_id=${prefectureId}`, { signal: controller.signal })
      const data = await res.json()
      if (!controller.signal.aborted) setCantons(data.cantons ?? [])
    } catch (e: unknown) { if (!(e instanceof Error && e.name === 'AbortError')) setCantons([]) }
    if (!controller.signal.aborted) setLoading(false)
  }, [])

  // Fetch prices for a location
  const fetchPrices = useCallback(async (regionId: string, cantonId?: string) => {
    setLoading(true)
    const controller = new AbortController()
    try {
      let url = `/api/market-prices?region_id=${regionId}`
      if (cantonId) url += `&canton_id=${cantonId}`
      const res = await fetch(url, { signal: controller.signal })
      const data = await res.json()
      if (!controller.signal.aborted) {
        setPrices(data.prices ?? [])
      }
    } catch (e: unknown) { if (!(e instanceof Error && e.name === 'AbortError')) setPrices([]) }
    if (!controller.signal.aborted) setLoading(false)
  }, [])

  const handleSelectRegion = (region: typeof REGIONS[0]) => {
    setSelectedRegion(region)
    setStep('prefectures')
    fetchPrefectures(region.id)
  }

  const handleSelectPrefecture = (pref: Prefecture) => {
    setSelectedPrefecture(pref)
    setStep('cantons')
    fetchCantons(pref.id)
  }

  const handleSelectCanton = (canton: Canton) => {
    setSelectedCanton(canton)
    setStep('prices')
    if (selectedRegion) fetchPrices(selectedRegion.id, canton.id)
  }

  const handleSubmitPrice = async () => {
    if (!submitForm.culture_id || !submitForm.price) return
    setSubmitting(true); setSubmitResult(null)
    // Use member's locality as the market name (they can only report for their zone)
    const marketName = memberLocality?.canton ?? memberLocality?.village ?? selectedCanton?.name ?? selectedPrefecture?.name ?? 'Non précisé'
    // Find the region from member's locality or selected region
    const memberRegion = REGIONS.find(r => r.name === memberLocality?.region)
    const regionId = memberRegion?.id ?? selectedRegion?.id
    if (!regionId) { setSubmitResult({ ok: false, msg: 'Région introuvable' }); setSubmitting(false); return }
    try {
      const res = await fetch('/api/market-prices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_number: decodeURIComponent(cardNumber ?? ''),
          culture_id: submitForm.culture_id,
          region_id: regionId,
          market_name: marketName,
          price: parseInt(submitForm.price, 10),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSubmitResult({ ok: true, msg: data.message ?? 'Prix enregistré !' })
        setSubmitForm({ culture_id: '', price: '' })
      } else { setSubmitResult({ ok: false, msg: data.error ?? 'Erreur' }) }
    } catch { setSubmitResult({ ok: false, msg: 'Erreur de connexion' }) }
    setSubmitting(false)
  }

  const goBack = () => {
    if (step === 'submit') { setStep('prices'); return }
    if (step === 'prices') { setStep('cantons'); return }
    if (step === 'cantons') { setStep('prefectures'); setSelectedPrefecture(null); return }
    if (step === 'prefectures') { setStep('regions'); setSelectedRegion(null); return }
    onBack?.()
  }

  const breadcrumb = [
    selectedRegion?.name,
    selectedPrefecture?.name,
    selectedCanton?.name,
  ].filter(Boolean).join(' › ')

  return (
    <div className="space-y-4">
      {/* Back + Breadcrumb */}
      <button onClick={goBack} className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {step === 'regions' ? 'Retour au menu' : 'Retour'}
      </button>
      {breadcrumb && <p className="text-[10px] text-white/30 font-mono">📍 {breadcrumb}</p>}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white text-lg font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[var(--vfp-accent)]" /> Prix du Marché
          </h3>
          <p className="text-white/40 text-xs mt-0.5">
            {step === 'regions' && 'Choisir une région'}
            {step === 'prefectures' && 'Choisir une préfecture'}
            {step === 'cantons' && 'Choisir un canton / marché'}
            {step === 'prices' && 'Prix disponibles'}
            {step === 'submit' && 'Renseigner un prix'}
          </p>
        </div>
        <div className="px-2 py-1 rounded-full bg-orange-500/10 border border-orange-500/20">
          <span className="text-[9px] font-bold text-orange-400 uppercase">FCFA/kg</span>
        </div>
      </div>

      {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-[var(--vfp-accent)]/30 border-t-[var(--vfp-accent)] rounded-full animate-spin" /></div>}

      {/* Step 1: Regions */}
      {step === 'regions' && !loading && (
        <div className="space-y-2">
          {sortedRegions.map((r) => {
            const isMemberRegion = r.name === memberLocality?.region
            return (
              <button key={r.id} onClick={() => handleSelectRegion(r)} className="w-full rounded-2xl vfp-card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform">
                <div className="w-12 h-12 rounded-xl bg-[var(--vfp-accent)]/10 flex items-center justify-center text-xl">{r.emoji}</div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{r.name}</p>
                    {isMemberRegion && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--vfp-accent)]/15 text-[var(--vfp-accent)] border border-[var(--vfp-accent)]/20 uppercase tracking-wide">Ma région</span>
                    )}
                  </div>
                  <p className="text-xs text-white/40">{regionCounts[r.id] ?? 0} prix enregistrés</p>
                </div>
                {(regionCounts[r.id] ?? 0) > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[var(--vfp-accent)]/10 text-[var(--vfp-accent)] text-xs font-bold">{regionCounts[r.id]}</span>
                )}
                <svg className="h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )
          })}
        </div>
      )}

      {/* Step 2: Prefectures */}
      {step === 'prefectures' && !loading && (
        <div className="space-y-2">
          {prefectures.map((p) => (
            <button key={p.id} onClick={() => handleSelectPrefecture(p)} className="w-full rounded-xl vfp-card p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform ">
              <MapPin className="h-4 w-4 text-[var(--vfp-accent)]/60 shrink-0" />
              <span className="text-sm text-white font-medium flex-1 text-left">{p.name}</span>
              {(p.priceCount ?? 0) > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[var(--vfp-accent)]/10 text-[var(--vfp-accent)] text-xs font-bold">{p.priceCount}</span>
              )}
              <svg className="h-3.5 w-3.5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ))}
        </div>
      )}

      {/* Step 3: Cantons */}
      {step === 'cantons' && !loading && (
        <div className="space-y-2">
          {cantons.map((c) => (
            <button key={c.id} onClick={() => handleSelectCanton(c)} className="w-full rounded-xl vfp-card p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform ">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-sm">🏘️</div>
              <span className="text-sm text-white font-medium flex-1 text-left">{c.name}</span>
              {(c.priceCount ?? 0) > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-[var(--vfp-accent)]/10 text-[var(--vfp-accent)] text-xs font-bold">{c.priceCount} prix</span>
              ) : (
                <span className="text-[10px] text-white/25">aucun prix</span>
              )}
              <svg className="h-3.5 w-3.5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ))}
        </div>
      )}

      {/* Step 4: Prices */}
      {step === 'prices' && !loading && (
        <div className="space-y-3">
          {prices.length === 0 ? (
            <div className="rounded-2xl vfp-card p-6 text-center">
              <p className="text-white/50 text-sm">Aucun prix disponible ici</p>
              <p className="text-white/30 text-xs mt-1">Soyez le premier à renseigner !</p>
            </div>
          ) : (
            <div className="space-y-2">
              {prices.map((p) => {
                const sparkValues = pricesByCulture[p.culture_id] ?? []
                return (
                  <div key={p.id} className="rounded-xl vfp-card p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center text-lg shrink-0">
                      {CULTURE_LIST.find(c => c.id === p.culture_id)?.emoji ?? '🌱'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{CULTURE_LIST.find(c => c.id === p.culture_id)?.name ?? p.cultures?.name ?? '—'}</p>
                      <TrendBadge trend={p.trend ?? 'stable'} />
                    </div>
                    {sparkValues.length >= 2 && (
                      <SVGSparkline values={sparkValues} trend={p.trend ?? 'stable'} />
                    )}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-white">{p.price} F</p>
                      <p className="text-[11px] text-white/30">/kg</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <button onClick={() => {
            // Pre-fill with member's locality from their card
            const memberRegion = REGIONS.find(r => r.name === memberLocality?.region)
            if (memberRegion) setSelectedRegion(memberRegion)
            setStep('submit')
          }} className="w-full rounded-2xl p-4 bg-[var(--vfp-accent)]/[0.08] border border-[var(--vfp-accent)]/20 flex items-center gap-3 active:scale-[0.98] transition-transform">
            <div className="w-10 h-10 rounded-xl bg-[var(--vfp-accent)]/15 flex items-center justify-center shrink-0"><TrendingUp className="h-5 w-5 text-[var(--vfp-accent)]" /></div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-white">Renseigner un prix</p>
              <p className="text-xs text-white/50">📍 {memberLocality?.canton ?? memberLocality?.village ?? 'Votre zone'}</p>
            </div>
          </button>
        </div>
      )}

      {/* Step 5: Submit */}
      {step === 'submit' && (
        <div className="rounded-2xl vfp-card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[var(--vfp-accent)]/10 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-[var(--vfp-accent)]" /></div>
            <div>
              <p className="text-sm font-bold text-white">Renseigner un prix</p>
              <p className="text-xs text-white/40">📍 {[memberLocality?.village, memberLocality?.canton, memberLocality?.prefecture].filter(Boolean).join(', ') || 'Votre zone'}</p>
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5">
            <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Votre localité (carte membre)</p>
            <p className="text-xs text-white font-medium">{[memberLocality?.village, memberLocality?.canton, memberLocality?.prefecture, memberLocality?.region].filter(Boolean).join(', ') || '—'}</p>
          </div>
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold block mb-1.5">Culture</label>
            <div className="grid grid-cols-4 gap-2">
              {CULTURE_LIST.map((c) => (
                <button key={c.id} onClick={() => setSubmitForm(f => ({ ...f, culture_id: c.id }))} className={`flex flex-col items-center gap-0.5 p-2 rounded-xl border transition-all ${submitForm.culture_id === c.id ? 'bg-[var(--vfp-accent)]/10 border-[var(--vfp-accent)]/40' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                  <span className="text-lg">{c.emoji}</span>
                  <span className="text-[10px] text-white/60 text-center">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold block mb-1.5">Prix (FCFA/kg)</label>
            <input type="number" inputMode="numeric" placeholder="Ex: 450" value={submitForm.price} onChange={(e) => setSubmitForm(f => ({ ...f, price: e.target.value }))} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.1] px-4 py-3 text-white text-lg font-bold placeholder:text-white/20 focus:outline-none focus:border-[var(--vfp-accent)]/40" />
          </div>
          <button onClick={handleSubmitPrice} disabled={!submitForm.culture_id || !submitForm.price || submitting} className="w-full py-3.5 rounded-xl bg-[var(--vfp-cta)] text-[var(--vfp-cta-fg)] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.97] transition-transform">
            {submitting ? <div className="w-4 h-4 border-2 border-[var(--vfp-cta-fg)]/30 border-t-[var(--vfp-cta-fg)] rounded-full animate-spin" /> : <>✓ Envoyer</>}
          </button>
          {submitResult && <div className={`rounded-xl p-3 text-center text-xs font-medium ${submitResult.ok ? 'bg-[var(--vfp-accent)]/10 text-[var(--vfp-accent)]' : 'bg-red-500/10 text-red-400'}`}>{submitResult.msg}</div>}
          <p className="text-[11px] text-white/25 text-center">Vérifié par la coopérative avant publication</p>
        </div>
      )}
    </div>
  )
}
