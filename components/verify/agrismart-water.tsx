'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Droplets, RotateCcw, MapPin, Loader2, AlertTriangle, Plus, Trash2, TrendingUp, Info } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SavedCalc {
  id: string
  crop: string
  region: string
  superficie: number
  result_et0: number | null
  result_kc: number | null
  result_daily_mm: number | null
}

interface Crop {
  id: string; name: string; emoji: string; kc: number[]; z: number[]
}
interface IrrigationSystem { id: string; label: string; efficiency: number; emoji: string }
interface SoilType {
  id: string; name: string; emoji: string; desc: string
  RU: number; RFU: number; fc_pct: number; wp_pct: number
}
interface CropEntry { crop: Crop; area_m2: string }

interface MonthlyRow {
  mois: string; nb_jours: number; etp: number; kc: number
  etm: number; pluie: number; peff: number
  besoin_net: number; volume_total: number
  boost_mm: number; boost_vol_total: number
}
interface CropResult {
  crop: string; area_m2: number
  monthly: MonthlyRow[]
  kpis: {
    total_m3: number; total_boost_m3: number; total_optimal_m3: number
    pic_mois: string; pic_volume_m3: number; debit_pompe_ls: number
    avg_kc: number; avg_etp_mmj: number; max_besoin_net: number
    efficiency_pct: number; mois_pluie_couvre: string[]; nb_mois_zero: number
  }
}
interface CalcResult {
  soil: string; system: string; climate_source: string
  avg_temp: number; total_precip: number
  results: CropResult[]
  combined_monthly: { mois: string; volume_total: number; boost_vol_total: number; optimal_total: number }[]
  combined_kpis: {
    total_area_m2: number; total_survival_m3: number; total_boost_m3: number
    total_optimal_m3: number; pic_mois: string; pic_optimal_m3: number; debit_pompe_ls: number
  }
}

const REGIONS = [
  { id: 'Maritime', name: 'Maritime',  emoji: '🌊', desc: 'Lomé · Sud' },
  { id: 'Plateaux', name: 'Plateaux',  emoji: '🏔️', desc: 'Atakpamé · Centre-Sud' },
  { id: 'Centrale', name: 'Centrale',  emoji: '🌾', desc: 'Sokodé · Centre' },
  { id: 'Kara',     name: 'Kara',      emoji: '☀️', desc: 'Kara · Nord-Centre' },
  { id: 'Savanes',  name: 'Savanes',   emoji: '🌿', desc: 'Dapaong · Nord' },
]

interface Props { onBack: () => void; initialRegion?: string }

// ─── Palette de couleurs par culture ─────────────────────────────────────────
const CROP_COLORS = [
  'var(--vfp-accent)',
  'oklch(0.72 0.18 200)',
  'oklch(0.72 0.18 30)',
  'oklch(0.72 0.18 280)',
  'oklch(0.72 0.18 60)',
  'oklch(0.72 0.18 160)',
]

export function AgriSmartWater({ onBack, initialRegion }: Props) {
  // ── API data ──────────────────────────────────────────────────────────────
  const [allCrops, setAllCrops]     = useState<Crop[]>([])
  const [systems, setSystems]       = useState<IrrigationSystem[]>([])
  const [soilTypes, setSoilTypes]   = useState<SoilType[]>([])
  const [apiLoading, setApiLoading] = useState(true)
  const [apiError, setApiError]     = useState('')

  // ── Wizard ────────────────────────────────────────────────────────────────
  type Step = 1 | 2 | 3 | 4 | 5
  const [step, setStep] = useState<Step>(1)

  // Step 1 — cultures sélectionnées avec superficie
  const [entries, setEntries] = useState<CropEntry[]>([])
  const [pickOpen, setPickOpen] = useState(false)

  // Step 2 — sol
  const [soil, setSoil] = useState<SoilType | null>(null)

  // Step 3 — système
  const [system, setSystem] = useState<IrrigationSystem | null>(null)

  // Step 4 — localisation
  const [region, setRegion]   = useState(initialRegion ?? '')
  const [gpsCoords, setGpsCoords] = useState<{lat:number;lon:number} | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)

  // Step 5 — résultats
  const [result, setResult]         = useState<CalcResult | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [calcError, setCalcError]     = useState('')
  const [activeCropIdx, setActiveCropIdx] = useState(0)

  // Historique des calculs récents
  const [savedCalcs, setSavedCalcs] = useState<SavedCalc[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('agrismart_history')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  const cropPickerRef = useRef<HTMLDivElement>(null)

  // ── Load crops + soil on mount ────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/agrismart?resource=crops').then(r => r.json()),
      fetch('/api/agrismart?resource=soil-types').then(r => r.json()),
    ])
      .then(([cropsData, soilData]) => {
        setAllCrops(cropsData.crops ?? [])
        setSystems(cropsData.irrigation_systems ?? [])
        setSoilTypes(soilData.soil_types ?? [])
        setApiLoading(false)
      })
      .catch(() => { setApiError('Impossible de charger les données.'); setApiLoading(false) })
  }, [])

  // Close picker on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (cropPickerRef.current && !cropPickerRef.current.contains(e.target as Node))
        setPickOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const reset = () => {
    setEntries([]); setSoil(null); setSystem(null)
    setRegion(''); setGpsCoords(null); setResult(null)
    setCalcError(''); setActiveCropIdx(0); setStep(1)
  }

  // ── Crop management ───────────────────────────────────────────────────────
  const addCrop = (crop: Crop) => {
    if (entries.find(e => e.crop.id === crop.id)) return
    setEntries(prev => [...prev, { crop, area_m2: '1000' }])
    setPickOpen(false)
  }
  const removeCrop = (idx: number) => setEntries(prev => prev.filter((_, i) => i !== idx))
  const setArea = (idx: number, val: string) =>
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, area_m2: val } : e))

  const selectedIds = new Set(entries.map(e => e.crop.id))
  const alreadySelected = (id: string) => selectedIds.has(id)

  // ── GPS ───────────────────────────────────────────────────────────────────
  const detectGps = () => {
    if (!navigator.geolocation) return
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setRegion('')
        setGpsLoading(false)
      },
      () => setGpsLoading(false),
      { timeout: 8000 },
    )
  }

  // ── Calculate ─────────────────────────────────────────────────────────────
  const calculate = async () => {
    if (!soil || !system || entries.length === 0) return
    setCalcLoading(true); setCalcError('')
    try {
      const payload: Record<string, unknown> = {
        resource:   'calculate',
        crops:      entries.map(e => ({ name: e.crop.name, area_m2: parseFloat(e.area_m2) || 1000 })),
        soil_type:  soil.name,
        system:     system.id,
      }
      if (gpsCoords) { payload.lat = gpsCoords.lat; payload.lon = gpsCoords.lon }
      else if (region) { payload.region = region }

      const res = await fetch('/api/agrismart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
      setActiveCropIdx(0)
      setStep(5)

      // Sauvegarder dans l'historique
      const firstCropName = entries[0]?.crop.name ?? ''
      const totalSuperficie = entries.reduce((sum, e) => sum + (parseFloat(e.area_m2) || 0), 0) / 10000
      const firstCropResult: CropResult | undefined = (data as CalcResult).results?.[0]
      const newCalc: SavedCalc = {
        id: new Date().toISOString(),
        crop: entries.length > 1 ? `${firstCropName} +${entries.length - 1}` : firstCropName,
        region: region || (gpsCoords ? `GPS ${gpsCoords.lat.toFixed(2)}°N` : ''),
        superficie: Math.round(totalSuperficie * 100) / 100,
        result_et0: firstCropResult ? firstCropResult.kpis.avg_etp_mmj : null,
        result_kc: firstCropResult ? firstCropResult.kpis.avg_kc : null,
        result_daily_mm: firstCropResult ? firstCropResult.kpis.max_besoin_net : null,
      }
      setSavedCalcs(prev => {
        const updated = [newCalc, ...prev].slice(0, 3)
        try { localStorage.setItem('agrismart_history', JSON.stringify(updated)) } catch {}
        return updated
      })
    } catch (e: unknown) {
      setCalcError(e instanceof Error ? e.message : 'Erreur de calcul')
    } finally {
      setCalcLoading(false)
    }
  }

  // ── Progress steps label ──────────────────────────────────────────────────
  const STEP_LABELS = ['Cultures', 'Sol', 'Irrigation', 'Localisation', 'Résultats']

  if (apiLoading) return (
    <div className="flex flex-col items-center gap-3 py-16 text-white/40">
      <Loader2 className="h-7 w-7 animate-spin text-[var(--vfp-accent)]" />
      <p className="text-sm">Chargement AgriSmart…</p>
    </div>
  )

  if (apiError) return (
    <div className="vfp-card rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-400" />
      <p className="text-white/70 text-sm">{apiError}</p>
      <button onClick={() => window.location.reload()} className="text-xs text-[var(--vfp-accent)] underline">Réessayer</button>
    </div>
  )

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={step === 1 ? onBack : () => setStep(s => (s - 1) as Step)}
          className="flex items-center gap-1.5 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70"
        >
          <ArrowLeft className="h-4 w-4" />
          {step === 1 ? 'Retour' : 'Précédent'}
        </button>
        {step > 1 && (
          <button onClick={reset} className="ml-auto flex items-center gap-1 text-white/30 text-xs active:opacity-60">
            <RotateCcw className="h-3 w-3" /> Recommencer
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[var(--vfp-accent)]/15 flex items-center justify-center shrink-0">
          <Droplets className="h-4 w-4 text-[var(--vfp-accent)]" />
        </div>
        <div>
          <h3 className="text-white font-bold text-lg leading-none">AgriSmart — Irrigation</h3>
          <p className="text-white/35 text-[10px] mt-0.5">Bilan hydrique FAO-56 · NASA POWER · ROSETTA v3</p>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="space-y-1">
        <div className="flex gap-1">
          {[1,2,3,4,5].map(n => (
            <div key={n} className={`h-1 flex-1 rounded-full transition-all duration-300 ${n <= step ? 'bg-[var(--vfp-accent)]' : 'bg-white/[0.08]'}`} />
          ))}
        </div>
        <div className="flex gap-1">
          {STEP_LABELS.map((label, i) => (
            <p key={i} className={`flex-1 text-center text-[9px] font-semibold transition-colors ${i + 1 === step ? 'text-[var(--vfp-accent)]' : 'text-white/20'}`}>
              {label}
            </p>
          ))}
        </div>
      </div>

      {/* ══ ÉTAPE 1 — Cultures ══════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-white/60 text-sm font-medium">
            Sélectionnez vos cultures et définissez la superficie de chaque parcelle.
          </p>

          {/* Cultures ajoutées */}
          {entries.length > 0 && (
            <div className="space-y-2">
              {entries.map((entry, idx) => (
                <div key={entry.crop.id} className="vfp-card rounded-2xl p-3 flex items-center gap-3">
                  <div
                    className="w-1.5 self-stretch rounded-full shrink-0"
                    style={{ background: CROP_COLORS[idx % CROP_COLORS.length] }}
                  />
                  <span className="text-xl shrink-0">{entry.crop.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">{entry.crop.name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={entry.area_m2}
                        onChange={e => setArea(idx, e.target.value)}
                        placeholder="1000"
                        className="w-24 rounded-lg bg-white/[0.06] border border-white/[0.1] px-2 py-1 text-white text-sm font-bold placeholder:text-white/20 focus:outline-none focus:border-[var(--vfp-accent)]/40"
                      />
                      <span className="text-white/40 text-xs">m²</span>
                      {parseFloat(entry.area_m2) > 0 && (
                        <span className="text-white/25 text-[10px]">
                          = {(parseFloat(entry.area_m2) / 10000).toFixed(4)} ha
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => removeCrop(idx)} className="text-white/20 hover:text-red-400 transition-colors p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Calculs récents */}
          {savedCalcs.length > 0 && entries.length === 0 && (
            <div className="space-y-2">
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider">Calculs récents</p>
              {savedCalcs.map((calc) => (
                <button
                  key={calc.id}
                  onClick={() => {
                    // Trouver la culture dans allCrops (premier nom avant " +N")
                    const baseName = calc.crop.replace(/ \+\d+$/, '')
                    const foundCrop = allCrops.find(c => c.name === baseName)
                    if (foundCrop) {
                      const areaMq = Math.round(calc.superficie * 10000)
                      setEntries([{ crop: foundCrop, area_m2: String(areaMq || 1000) }])
                    }
                    // Pré-remplir la région
                    const matchedRegion = REGIONS.find(r => r.id === calc.region)
                    if (matchedRegion) setRegion(matchedRegion.id)
                  }}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 flex items-center justify-between active:scale-[0.98] transition-transform text-left"
                >
                  <div>
                    <p className="text-white text-sm font-medium">{calc.crop} — {calc.region}</p>
                    <p className="text-white/40 text-xs">{calc.superficie} ha · {calc.result_daily_mm != null ? `${calc.result_daily_mm.toFixed(1)} mm/j` : '—'}</p>
                  </div>
                  <span className="text-white/25 text-xs">{new Date(calc.id).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                </button>
              ))}
            </div>
          )}

          {/* Picker de culture */}
          <div ref={cropPickerRef} className="relative">
            <button
              onClick={() => setPickOpen(o => !o)}
              className="w-full vfp-card rounded-2xl p-3.5 flex items-center justify-center gap-2 border border-dashed border-[var(--vfp-accent)]/25 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70"
            >
              <Plus className="h-4 w-4" />
              Ajouter une culture
            </button>
            {pickOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 vfp-card rounded-2xl p-2 grid grid-cols-2 gap-1.5 shadow-2xl border border-white/[0.08]" style={{background:'oklch(0.14 0.04 142)'}}>
                {allCrops.map(c => (
                  <button
                    key={c.id}
                    onClick={() => addCrop(c)}
                    disabled={alreadySelected(c.id)}
                    className={`rounded-xl p-2.5 flex items-center gap-2 text-left transition-all text-sm ${alreadySelected(c.id) ? 'opacity-30 cursor-default' : 'active:scale-[0.97] hover:bg-white/[0.05]'}`}
                  >
                    <span className="text-lg">{c.emoji}</span>
                    <span className="text-white/80 font-medium">{c.name}</span>
                    {alreadySelected(c.id) && <span className="ml-auto text-[var(--vfp-accent)] text-xs">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {entries.length > 0 && (
            <button
              onClick={() => setStep(2)}
              disabled={entries.some(e => !e.area_m2 || parseFloat(e.area_m2) <= 0)}
              className="w-full py-3.5 rounded-xl bg-[var(--vfp-cta)] text-[var(--vfp-cta-fg)] font-bold text-sm disabled:opacity-30 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
            >
              Continuer avec {entries.length} culture{entries.length > 1 ? 's' : ''} →
            </button>
          )}

          {entries.length === 0 && (
            <p className="text-white/25 text-xs text-center">Ajoutez au moins une culture pour continuer</p>
          )}
        </div>
      )}

      {/* ══ ÉTAPE 2 — Sol ═══════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-2">
          <p className="text-white/60 text-sm font-medium mb-3">Quel est le type de sol de vos parcelles ?</p>
          {soilTypes.map(s => (
            <button key={s.id} onClick={() => { setSoil(s); setStep(3) }}
              className="w-full vfp-card rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform">
              <span className="text-2xl w-10 text-center shrink-0">{s.emoji}</span>
              <div className="flex-1 text-left">
                <p className="text-white font-semibold text-sm">{s.name}</p>
                <p className="text-white/40 text-xs">{s.desc}</p>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <p className="text-white font-bold text-sm">{s.RU} <span className="text-xs text-white/30 font-normal">mm/m</span></p>
                <p className="text-white/30 text-[10px]">RU · FC {s.fc_pct}%</p>
              </div>
            </button>
          ))}
          <p className="text-white/20 text-[10px] text-center mt-1">ROSETTA v3 · USDA-ARS · van Genuchten</p>
        </div>
      )}

      {/* ══ ÉTAPE 3 — Système ═══════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="space-y-2">
          <p className="text-white/60 text-sm font-medium mb-3">Quel système d'irrigation utilisez-vous ?</p>
          {systems.map(s => (
            <button key={s.id} onClick={() => { setSystem(s); setStep(4) }}
              className="w-full vfp-card rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform">
              <span className="text-xl w-10 text-center shrink-0">{s.emoji}</span>
              <div className="flex-1 text-left">
                <p className="text-white font-semibold text-sm">{s.label}</p>
                <p className="text-white/35 text-xs">
                  {s.efficiency >= 0.85 ? 'Économie d\'eau maximale' : s.efficiency >= 0.75 ? 'Efficience moyenne' : 'Irrigation traditionnelle'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`font-bold text-lg ${s.efficiency >= 0.85 ? 'text-[var(--vfp-accent)]' : 'text-white/70'}`}>
                  {Math.round(s.efficiency * 100)}%
                </p>
                <p className="text-white/25 text-[10px]">efficience</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ══ ÉTAPE 4 — Localisation ══════════════════════════════════════════════ */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <p className="text-white/60 text-sm font-medium">Où se situent vos parcelles ?</p>
            <p className="text-white/30 text-xs mt-0.5">
              Le GPS permet d'utiliser les normales climatiques précises de votre site (NASA POWER 30 ans).
            </p>
          </div>

          <button
            onClick={detectGps}
            disabled={gpsLoading}
            className={`w-full vfp-card rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-all ${gpsCoords ? 'border border-[var(--vfp-accent)]/50 bg-[var(--vfp-accent)]/5' : ''}`}
          >
            {gpsLoading
              ? <Loader2 className="h-5 w-5 text-[var(--vfp-accent)] animate-spin shrink-0" />
              : <MapPin className={`h-5 w-5 shrink-0 ${gpsCoords ? 'text-[var(--vfp-accent)]' : 'text-white/40'}`} />
            }
            <div className="flex-1 text-left">
              <p className="text-white font-semibold text-sm">
                {gpsCoords ? `GPS · ${gpsCoords.lat.toFixed(3)}°N, ${gpsCoords.lon.toFixed(3)}°E` : 'Détecter ma position GPS'}
              </p>
              <p className="text-white/35 text-xs">
                {gpsCoords ? '✓ Climatologie locale exacte' : 'Recommandé — précision maximale'}
              </p>
            </div>
          </button>

          <div>
            <p className="text-white/30 text-[10px] text-center mb-2">— ou choisir une région —</p>
            <div className="grid grid-cols-1 gap-1.5">
              {REGIONS.map(r => (
                <button key={r.id}
                  onClick={() => { setRegion(r.id); setGpsCoords(null) }}
                  className={`vfp-card rounded-xl px-4 py-2.5 flex items-center gap-3 active:scale-[0.98] transition-all ${region === r.id ? 'border border-[var(--vfp-accent)]/40 bg-[var(--vfp-accent)]/5' : ''}`}
                >
                  <span>{r.emoji}</span>
                  <div className="flex-1 text-left">
                    <span className="text-white text-sm font-medium">{r.name}</span>
                    <span className="text-white/30 text-xs ml-2">{r.desc}</span>
                  </div>
                  {region === r.id && <div className="w-2 h-2 rounded-full bg-[var(--vfp-accent)]" />}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={calculate}
            disabled={(!gpsCoords && !region) || calcLoading}
            className="w-full py-3.5 rounded-xl bg-[var(--vfp-cta)] text-[var(--vfp-cta-fg)] font-bold text-sm disabled:opacity-30 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
          >
            {calcLoading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Calcul NASA POWER…</>
              : <><Droplets className="h-4 w-4" /> Calculer les besoins</>
            }
          </button>
          {calcError && (
            <p className="text-red-300/80 text-xs text-center bg-red-500/10 rounded-xl p-3">{calcError}</p>
          )}
        </div>
      )}

      {/* ══ ÉTAPE 5 — Résultats ═════════════════════════════════════════════════ */}
      {step === 5 && result && (
        <div className="space-y-4">

          {/* Badge source climatique */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/40 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
              {result.climate_source}
            </span>
            <span className="text-[9px] text-white/25">
              {result.avg_temp}°C · {result.total_precip} mm/an
            </span>
            <span className="text-[9px] text-white/25">
              {result.soil} · {result.system}
            </span>
          </div>

          {/* ── KPIs globaux ── */}
          <div className="vfp-card rounded-2xl p-4 space-y-3">
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider">
              Bilan global — {result.results.length} culture{result.results.length > 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <KpiCard
                label="Survie (pluie insuffisante)"
                value={(result.combined_kpis.total_survival_m3 / 1000).toFixed(2)}
                unit="k m³/an"
                sub={`${(result.combined_kpis.total_area_m2).toLocaleString('fr')} m² total`}
              />
              <KpiCard
                label="Rendement optimal +"
                value={(result.combined_kpis.total_boost_m3 / 1000).toFixed(2)}
                unit="k m³/an"
                sub={`+15% ETM · sécheresses intra-mois`}
                accent
                icon={<TrendingUp className="h-3 w-3" />}
              />
              <KpiCard
                label="Volume total recommandé"
                value={(result.combined_kpis.total_optimal_m3 / 1000).toFixed(2)}
                unit="k m³/an"
                sub="Survie + supplément rendement"
                accent
              />
              <KpiCard
                label="Débit pompe"
                value={result.combined_kpis.debit_pompe_ls.toFixed(2)}
                unit="L/s"
                sub={`Pointe ${result.combined_kpis.pic_mois.slice(0,4)} · 12h/j`}
              />
            </div>

            {/* Explication boost */}
            <div className="rounded-xl bg-[var(--vfp-accent)]/5 border border-[var(--vfp-accent)]/15 p-3 flex gap-2">
              <Info className="h-3.5 w-3.5 text-[var(--vfp-accent)] shrink-0 mt-0.5" />
              <p className="text-white/50 text-[10px] leading-relaxed">
                <span className="text-[var(--vfp-accent)] font-semibold">Rendement optimal :</span>{' '}
                Même quand la pluie couvre les besoins de survie, la pluie mensuelle est inégalement répartie (CV ≈ 40% au Togo).
                Un supplément de <strong className="text-white/70">15% de l'ETM</strong> compense les sécheresses intra-mensuelles
                et maintient le rendement maximal. Ce volume est indiqué en vert.
              </p>
            </div>
          </div>

          {/* ── Graphique combiné 12 mois ── */}
          <div className="vfp-card rounded-2xl p-4">
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider mb-3">
              📊 Besoins combinés par mois (m³)
            </p>
            <div className="space-y-1.5">
              {result.combined_monthly.map(row => {
                const maxOpt = Math.max(...result.combined_monthly.map(r => r.optimal_total))
                const survPct = maxOpt > 0 ? (row.volume_total / maxOpt) * 100 : 0
                const boostPct = maxOpt > 0 ? (row.boost_vol_total / maxOpt) * 100 : 0
                return (
                  <div key={row.mois} className="flex items-center gap-2">
                    <span className="text-white/40 text-[10px] w-14 shrink-0 font-mono">{row.mois.slice(0,4)}</span>
                    <div className="flex-1 h-4 bg-white/[0.04] rounded-full overflow-hidden flex">
                      <div className="h-full rounded-l-full transition-all" style={{ width: `${survPct}%`, background: 'var(--vfp-accent)' }} />
                      <div className="h-full transition-all" style={{ width: `${boostPct}%`, background: 'oklch(0.72 0.18 60 / 0.7)' }} />
                    </div>
                    <span className="text-white/60 text-[10px] w-16 text-right shrink-0 font-mono">
                      {row.optimal_total.toFixed(1)} m³
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-4 mt-2.5">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{background:'var(--vfp-accent)'}} />
                <span className="text-white/30 text-[9px]">Survie</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{background:'oklch(0.72 0.18 60 / 0.7)'}} />
                <span className="text-white/30 text-[9px]">Rendement optimal</span>
              </div>
            </div>
          </div>

          {/* ── Onglets par culture ── */}
          {result.results.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {result.results.map((r, i) => (
                <button
                  key={r.crop}
                  onClick={() => setActiveCropIdx(i)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeCropIdx === i ? 'text-white' : 'text-white/30 bg-white/[0.04]'}`}
                  style={activeCropIdx === i ? { background: CROP_COLORS[i % CROP_COLORS.length] + '33', border: `1px solid ${CROP_COLORS[i % CROP_COLORS.length]}66`, color: CROP_COLORS[i % CROP_COLORS.length] } : {}}
                >
                  {entries.find(e => e.crop.name === r.crop)?.crop.emoji} {r.crop}
                </button>
              ))}
            </div>
          )}

          {/* ── Détail culture active ── */}
          {result.results[activeCropIdx] && (() => {
            const r = result.results[activeCropIdx]
            const entry = entries.find(e => e.crop.name === r.crop)
            const color = CROP_COLORS[activeCropIdx % CROP_COLORS.length]
            return (
              <div className="space-y-3">
                <div className="vfp-card rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/[0.05]">
                    <span className="text-xl">{entry?.crop.emoji}</span>
                    <div>
                      <p className="text-white font-bold text-sm">{r.crop}</p>
                      <p className="text-white/35 text-xs">
                        {r.area_m2.toLocaleString('fr')} m² ·
                        survie {r.kpis.total_m3.toFixed(1)} m³ ·
                        optimal {r.kpis.total_optimal_m3.toFixed(1)} m³/an
                      </p>
                    </div>
                  </div>

                  {/* Mois où la pluie suffit */}
                  {r.kpis.nb_mois_zero > 0 && (
                    <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-2.5">
                      <p className="text-emerald-400/80 text-[10px]">
                        <span className="font-bold">🌧️ Pluie suffisante</span> pendant {r.kpis.nb_mois_zero} mois :{' '}
                        {r.kpis.mois_pluie_couvre.map(m => m.slice(0,4)).join(', ')} — supplément rendement calculé.
                      </p>
                    </div>
                  )}

                  {/* Tableau bilan mensuel */}
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-[10px] min-w-[340px]">
                      <thead>
                        <tr className="text-white/25 border-b border-white/[0.06]">
                          <th className="text-left pb-1.5 font-semibold pl-1">Mois</th>
                          <th className="text-right pb-1.5 font-semibold">ETP</th>
                          <th className="text-right pb-1.5 font-semibold">Kc</th>
                          <th className="text-right pb-1.5 font-semibold">Peff</th>
                          <th className="text-right pb-1.5 font-semibold">Survie</th>
                          <th className="text-right pb-1.5 font-semibold" style={{color}}>+Rend.</th>
                          <th className="text-right pb-1.5 font-semibold text-white/50">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.monthly.map(row => {
                          const isBoosted = row.boost_mm > 0
                          const total = row.volume_total + row.boost_vol_total
                          return (
                            <tr key={row.mois} className={`border-b border-white/[0.03] ${isBoosted ? 'bg-emerald-500/[0.03]' : ''}`}>
                              <td className="py-1 pl-1 font-medium text-white/60">{row.mois.slice(0,4)}</td>
                              <td className="py-1 text-right text-white/40">{row.etp}</td>
                              <td className="py-1 text-right text-white/40">{row.kc}</td>
                              <td className="py-1 text-right text-white/40">{row.peff}</td>
                              <td className={`py-1 text-right font-medium ${row.besoin_net > 0 ? 'text-white/70' : 'text-white/20'}`}>
                                {row.volume_total > 0 ? row.volume_total.toFixed(1) : '—'}
                              </td>
                              <td className="py-1 text-right font-medium" style={{color: isBoosted ? 'oklch(0.72 0.18 142 / 0.7)' : undefined}}>
                                {isBoosted ? `+${row.boost_vol_total.toFixed(1)}` : '—'}
                              </td>
                              <td className="py-1 text-right font-bold text-white/80">
                                {total > 0 ? total.toFixed(1) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                        <tr className="border-t border-white/[0.1]">
                          <td className="pt-1.5 pl-1 font-bold text-white/50 text-[9px] uppercase tracking-wider">Total</td>
                          <td colSpan={3} />
                          <td className="pt-1.5 text-right font-bold text-white/60">{r.kpis.total_m3.toFixed(1)}</td>
                          <td className="pt-1.5 text-right font-bold" style={{color: 'oklch(0.72 0.18 142 / 0.7)'}}>
                            +{r.kpis.total_boost_m3.toFixed(1)}
                          </td>
                          <td className="pt-1.5 text-right font-bold text-white">{r.kpis.total_optimal_m3.toFixed(1)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-white/20 text-[9px]">ETP mm/j · Kc · Peff mm · volumes m³ · Survie = besoin minimal · Rend. = supplément rendement optimal</p>
                </div>
              </div>
            )
          })()}

          {/* ── Recommandations ── */}
          <div className="vfp-card rounded-2xl p-4 space-y-2">
            <p className="text-[var(--vfp-accent)] text-xs font-bold uppercase tracking-wider">💡 Recommandations</p>
            <ul className="space-y-1.5 text-white/55 text-xs">
              <li>• Pompe recommandée : <strong className="text-white/70">{result.combined_kpis.debit_pompe_ls.toFixed(2)} L/s</strong> (12h/j au mois de pointe — {result.combined_kpis.pic_mois})</li>
              {result.results.some(r => r.kpis.nb_mois_zero > 3) && (
                <li>• Plusieurs mois couverts par la pluie — en saison des pluies, irriguez uniquement si 7 jours sans pluie consécutifs</li>
              )}
              <li>• Irriguez tôt le matin (6h–8h) : réduction de l'évaporation de 20%</li>
              {result.system.includes('outte') && (
                <li>• Goutte-à-goutte : placez les goutteurs à 15–20 cm du pied de la plante</li>
              )}
              <li>• Ajustez selon la pluviométrie réelle — soustrayez la pluie tombée la semaine précédente</li>
            </ul>
          </div>

          <button onClick={reset} className="w-full py-3 rounded-xl border border-[var(--vfp-accent)]/20 text-[var(--vfp-accent)] text-sm font-semibold active:opacity-70 flex items-center justify-center gap-2">
            <RotateCcw className="h-4 w-4" /> Nouveau calcul
          </button>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, unit, sub, accent, icon }: {
  label: string; value: string; unit: string; sub: string; accent?: boolean; icon?: React.ReactNode
}) {
  return (
    <div className={`rounded-xl p-3 border ${accent ? 'bg-[var(--vfp-accent)]/[0.07] border-[var(--vfp-accent)]/20' : 'bg-white/[0.03] border-white/[0.05]'}`}>
      <div className="flex items-center gap-1 mb-0.5">
        {icon && <span className={accent ? 'text-[var(--vfp-accent)]' : 'text-white/30'}>{icon}</span>}
        <p className="text-white/35 text-[10px] leading-tight">{label}</p>
      </div>
      <p className={`text-lg font-bold leading-tight ${accent ? 'text-[var(--vfp-accent)]' : 'text-white'}`}>
        {value} <span className="text-xs font-normal opacity-50">{unit}</span>
      </p>
      <p className="text-[9px] text-white/25 mt-0.5 leading-tight">{sub}</p>
    </div>
  )
}
