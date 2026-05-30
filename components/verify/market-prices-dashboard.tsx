'use client'

import { useState, useCallback, useEffect } from 'react'
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
  { id: '560aec9a-25b4-44c0-870c-f616561dc29c', name: 'Maïs', emoji: '🌽' },
  { id: '5a52aeb1-d214-496b-9c1a-9180a417d31e', name: 'Riz', emoji: '🍚' },
  { id: 'a13a54ad-a0a4-4415-a53f-38b61afea2f9', name: 'Igname', emoji: '🥔' },
  { id: 'dea07009-bf00-4f13-b24b-8b45a8eb8b5a', name: 'Soja', emoji: '🫘' },
  { id: '689b2812-9361-4792-89f6-810c40ed6bad', name: 'Arachide', emoji: '🥜' },
  { id: '939b0bc8-54d5-45ae-926b-df491ba062fd', name: 'Manioc', emoji: '🌱' },
]

interface Prefecture { id: string; name: string }
interface Canton { id: string; name: string }
interface MarketPrice { id: string; culture_id: string; market_name: string; price: number; trend: string; verified: boolean; cultures: { name: string } | null }

function TrendBadge({ trend }: { trend: string }) {
  if (trend === 'up') return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[9px] font-bold">↑ Hausse</span>
  if (trend === 'down') return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[9px] font-bold">↓ Baisse</span>
  return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/5 text-white/50 text-[9px] font-bold">→ Stable</span>
}

interface Props { onBack: () => void; cooperativeName?: string; cardNumber: string }

export function MarketPricesDashboard({ onBack, cooperativeName, cardNumber }: Props) {
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
  const fetchPrices = useCallback(async (regionId: string, marketName?: string) => {
    setLoading(true)
    const controller = new AbortController()
    try {
      const res = await fetch(`/api/market-prices?region_id=${regionId}`, { signal: controller.signal })
      const data = await res.json()
      if (!controller.signal.aborted) {
        let filtered = data.prices ?? []
        if (marketName) filtered = filtered.filter((p: MarketPrice) => p.market_name === marketName)
        setPrices(filtered)
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
    if (selectedRegion) fetchPrices(selectedRegion.id, canton.name)
  }

  const handleSubmitPrice = async () => {
    if (!submitForm.culture_id || !submitForm.price || !selectedRegion) return
    setSubmitting(true); setSubmitResult(null)
    try {
      const res = await fetch('/api/market-prices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_number: decodeURIComponent(cardNumber),
          culture_id: submitForm.culture_id,
          region_id: selectedRegion.id,
          market_name: selectedCanton?.name ?? selectedPrefecture?.name ?? 'Non précisé',
          price: parseInt(submitForm.price, 10),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSubmitResult({ ok: true, msg: data.message ?? 'Prix enregistré !' })
        setSubmitForm({ culture_id: '', price: '' })
        if (selectedRegion && selectedCanton) fetchPrices(selectedRegion.id, selectedCanton.name)
      } else { setSubmitResult({ ok: false, msg: data.error ?? 'Erreur' }) }
    } catch { setSubmitResult({ ok: false, msg: 'Erreur de connexion' }) }
    setSubmitting(false)
  }

  const goBack = () => {
    if (step === 'submit') { setStep('prices'); return }
    if (step === 'prices') { setStep('cantons'); return }
    if (step === 'cantons') { setStep('prefectures'); setSelectedPrefecture(null); return }
    if (step === 'prefectures') { setStep('regions'); setSelectedRegion(null); return }
    onBack()
  }

  const breadcrumb = [
    selectedRegion?.name,
    selectedPrefecture?.name,
    selectedCanton?.name,
  ].filter(Boolean).join(' › ')

  return (
    <div className="space-y-4">
      {/* Back + Breadcrumb */}
      <button onClick={goBack} className="flex items-center gap-2 text-[#4ADE80] text-sm font-medium active:opacity-70">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {step === 'regions' ? 'Retour au menu' : 'Retour'}
      </button>
      {breadcrumb && <p className="text-[10px] text-white/30 font-mono">📍 {breadcrumb}</p>}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white text-lg font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#4ADE80]" /> Prix du Marché
          </h3>
          <p className="text-white/40 text-[11px] mt-0.5">
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

      {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-[#4ADE80]/30 border-t-[#4ADE80] rounded-full animate-spin" /></div>}

      {/* Step 1: Regions */}
      {step === 'regions' && !loading && (
        <div className="space-y-2">
          {REGIONS.map((r) => (
            <button key={r.id} onClick={() => handleSelectRegion(r)} className="w-full rounded-2xl bg-white/[0.04] border border-white/[0.08] p-4 flex items-center gap-4 active:scale-[0.98] transition-transform hover:bg-white/[0.06]">
              <div className="w-12 h-12 rounded-xl bg-[#4ADE80]/10 flex items-center justify-center text-xl">{r.emoji}</div>
              <div className="flex-1 text-left"><p className="text-sm font-semibold text-white">{r.name}</p></div>
              <svg className="h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Prefectures */}
      {step === 'prefectures' && !loading && (
        <div className="space-y-2">
          {prefectures.map((p) => (
            <button key={p.id} onClick={() => handleSelectPrefecture(p)} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform hover:bg-white/[0.06]">
              <MapPin className="h-4 w-4 text-[#4ADE80]/60 shrink-0" />
              <span className="text-sm text-white font-medium flex-1 text-left">{p.name}</span>
              <svg className="h-3.5 w-3.5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ))}
        </div>
      )}

      {/* Step 3: Cantons */}
      {step === 'cantons' && !loading && (
        <div className="space-y-2">
          {cantons.map((c) => (
            <button key={c.id} onClick={() => handleSelectCanton(c)} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform hover:bg-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-sm">🏘️</div>
              <span className="text-sm text-white font-medium flex-1 text-left">{c.name}</span>
              <svg className="h-3.5 w-3.5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ))}
        </div>
      )}

      {/* Step 4: Prices */}
      {step === 'prices' && !loading && (
        <div className="space-y-3">
          {prices.length === 0 ? (
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-6 text-center">
              <p className="text-white/50 text-sm">Aucun prix disponible ici</p>
              <p className="text-white/30 text-xs mt-1">Soyez le premier à renseigner !</p>
            </div>
          ) : (
            <div className="space-y-2">
              {prices.map((p) => (
                <div key={p.id} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center text-lg shrink-0">
                    {CULTURE_LIST.find(c => c.id === p.culture_id)?.emoji ?? '🌱'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{CULTURE_LIST.find(c => c.id === p.culture_id)?.name ?? p.cultures?.name ?? '—'}</p>
                    <TrendBadge trend={p.trend ?? 'stable'} />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-white">{p.price} F</p>
                    <p className="text-[9px] text-white/30">/kg</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setStep('submit')} className="w-full rounded-2xl p-4 bg-gradient-to-r from-[#0A5C36] to-[#0d7a4a] border border-[#4ADE80]/20 flex items-center gap-3 active:scale-[0.98] transition-transform">
            <div className="w-10 h-10 rounded-xl bg-[#4ADE80]/15 flex items-center justify-center shrink-0"><TrendingUp className="h-5 w-5 text-[#4ADE80]" /></div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-white">Renseigner un prix</p>
              <p className="text-[11px] text-white/50">Partagez les prix de votre zone</p>
            </div>
          </button>
        </div>
      )}

      {/* Step 5: Submit */}
      {step === 'submit' && (
        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-5 space-y-4">
          <p className="text-sm font-bold text-white">Nouveau prix — {selectedCanton?.name ?? selectedPrefecture?.name}</p>
          <div>
            <label className="text-[10px] text-white/50 uppercase tracking-wider font-semibold block mb-1.5">Culture</label>
            <div className="grid grid-cols-5 gap-1.5">
              {CULTURE_LIST.map((c) => (
                <button key={c.id} onClick={() => setSubmitForm(f => ({ ...f, culture_id: c.id }))} className={`flex flex-col items-center gap-0.5 p-2 rounded-xl border transition-all ${submitForm.culture_id === c.id ? 'bg-[#4ADE80]/10 border-[#4ADE80]/40' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                  <span className="text-lg">{c.emoji}</span>
                  <span className="text-[8px] text-white/60 text-center">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-white/50 uppercase tracking-wider font-semibold block mb-1.5">Prix (FCFA/kg)</label>
            <input type="number" inputMode="numeric" placeholder="Ex: 450" value={submitForm.price} onChange={(e) => setSubmitForm(f => ({ ...f, price: e.target.value }))} className="w-full rounded-xl bg-white/[0.06] border border-white/[0.1] px-4 py-3 text-white text-lg font-bold placeholder:text-white/20 focus:outline-none focus:border-[#4ADE80]/40" />
          </div>
          <button onClick={handleSubmitPrice} disabled={!submitForm.culture_id || !submitForm.price || submitting} className="w-full py-3.5 rounded-xl bg-[#4ADE80] text-[#0A2E1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.97] transition-transform">
            {submitting ? <div className="w-4 h-4 border-2 border-[#0A2E1A]/30 border-t-[#0A2E1A] rounded-full animate-spin" /> : <>✓ Envoyer</>}
          </button>
          {submitResult && <div className={`rounded-xl p-3 text-center text-xs font-medium ${submitResult.ok ? 'bg-[#4ADE80]/10 text-[#4ADE80]' : 'bg-red-500/10 text-red-400'}`}>{submitResult.msg}</div>}
          <p className="text-[9px] text-white/25 text-center">Vérifié par la coopérative avant publication</p>
        </div>
      )}
    </div>
  )
}
