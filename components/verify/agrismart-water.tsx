'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Droplets, ChevronRight, RotateCcw, MapPin, Loader2, AlertTriangle } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Crop {
  id: string; name: string; emoji: string
  kc: number[]; z: number[]; mois: string[]
}
interface IrrigationSystem { id: string; label: string; efficiency: number; emoji: string }
interface SoilType {
  id: string; name: string; emoji: string; desc: string
  RU: number; RFU: number; fc_pct: number; wp_pct: number
  clay_pct: number; sand_pct: number; silt_pct: number
}
interface MonthlyRow {
  mois: string; nb_jours: number; etp: number; kc: number; z: number
  etm: number; pluie: number; peff: number; rfu: number
  besoin_net: number; besoin_brut: number; volume_ha: number; volume_total: number
}
interface Kpis {
  total_m3: number; avg_monthly_m3: number
  pic_mois: string; pic_volume_m3: number
  debit_pompe_ls: number; avg_kc: number; avg_etp_mmj: number
  max_besoin_net: number; efficiency_pct: number; area_ha: number
}
interface CalcResult {
  crop: string; soil: string; system: string; area_ha: number
  climate_source: string; avg_temp: number; total_precip: number
  monthly: MonthlyRow[]; kpis: Kpis
}

// ─── Regions fallback (no GPS) ────────────────────────────────────────────────
const REGIONS = [
  { id: 'Maritime', name: 'Maritime',  emoji: '🌊', desc: 'Lomé · Sud' },
  { id: 'Plateaux', name: 'Plateaux',  emoji: '🏔️', desc: 'Atakpamé · Centre-Sud' },
  { id: 'Centrale', name: 'Centrale',  emoji: '🌾', desc: 'Sokodé · Centre' },
  { id: 'Kara',     name: 'Kara',      emoji: '☀️', desc: 'Kara · Nord-Centre' },
  { id: 'Savanes',  name: 'Savanes',   emoji: '🌿', desc: 'Dapaong · Nord' },
]

interface Props { onBack: () => void }

export function AgriSmartWater({ onBack }: Props) {
  // ── Data from API ──────────────────────────────────────────────────────────
  const [crops, setCrops]           = useState<Crop[]>([])
  const [systems, setSystems]       = useState<IrrigationSystem[]>([])
  const [soilTypes, setSoilTypes]   = useState<SoilType[]>([])
  const [apiLoading, setApiLoading] = useState(true)
  const [apiError, setApiError]     = useState('')

  // ── Wizard state ───────────────────────────────────────────────────────────
  const [step, setStep]       = useState<1|2|3|4|5|6>(1)
  const [crop, setCrop]       = useState<Crop | null>(null)
  const [soil, setSoil]       = useState<SoilType | null>(null)
  const [system, setSystem]   = useState<IrrigationSystem | null>(null)
  const [surface, setSurface] = useState('1')
  const [region, setRegion]   = useState<string>('')
  const [gpsCoords, setGpsCoords] = useState<{lat:number;lon:number} | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)

  // ── Calculation ─────────────────────────────────────────────────────────────
  const [result, setResult]       = useState<CalcResult | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [calcError, setCalcError]     = useState('')

  // ── Load crops + soil types on mount ──────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/agrismart?resource=crops').then(r => r.json()),
      fetch('/api/agrismart?resource=soil-types').then(r => r.json()),
    ])
      .then(([cropsData, soilData]) => {
        setCrops(cropsData.crops ?? [])
        setSystems(cropsData.irrigation_systems ?? [])
        setSoilTypes(soilData.soil_types ?? [])
        setApiLoading(false)
      })
      .catch(() => {
        setApiError('Impossible de charger les données AgriSmart.')
        setApiLoading(false)
      })
  }, [])

  const reset = () => {
    setCrop(null); setSoil(null); setSystem(null)
    setSurface('1'); setRegion(''); setGpsCoords(null)
    setResult(null); setCalcError('')
    setStep(1)
  }

  // ── GPS detection ──────────────────────────────────────────────────────────
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

  // ── API calculate call ─────────────────────────────────────────────────────
  const calculate = async () => {
    if (!crop || !soil || !system) return
    setCalcLoading(true)
    setCalcError('')
    try {
      const payload: Record<string, unknown> = {
        resource:   'calculate',
        crop:       crop.name,
        soil_type:  soil.name,
        system:     system.id,
        area_ha:    parseFloat(surface) || 1.0,
      }
      if (gpsCoords) {
        payload.lat = gpsCoords.lat
        payload.lon = gpsCoords.lon
      } else if (region) {
        payload.region = region
      }
      const res = await fetch('/api/agrismart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
      setStep(6)
    } catch (e: unknown) {
      setCalcError(e instanceof Error ? e.message : 'Erreur de calcul')
    } finally {
      setCalcLoading(false)
    }
  }

  // ── Breadcrumb ─────────────────────────────────────────────────────────────
  const crumb = [
    crop?.name,
    soil?.name,
    system?.label,
    region || (gpsCoords ? `GPS ${gpsCoords.lat.toFixed(2)}N` : null),
  ].filter(Boolean).join(' › ')

  // ── Loading / error guard ──────────────────────────────────────────────────
  if (apiLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-white/40">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--vfp-accent)]" />
        <p className="text-sm">Chargement des données AgriSmart…</p>
      </div>
    )
  }

  if (apiError) {
    return (
      <div className="vfp-card rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-white/70 text-sm">{apiError}</p>
        <button onClick={() => window.location.reload()} className="text-xs text-[var(--vfp-accent)] underline">
          Réessayer
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={step === 1 ? onBack : () => setStep(s => (s - 1) as typeof step)}
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

      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--vfp-accent)]/15 flex items-center justify-center">
            <Droplets className="h-4 w-4 text-[var(--vfp-accent)]" />
          </div>
          <h3 className="text-white font-bold text-lg">AgriSmart — Irrigation</h3>
        </div>
        <p className="text-white/40 text-xs pl-10">Bilan hydrique FAO-56 · NASA POWER · ROSETTA v3</p>
      </div>

      {/* ── Progress ── */}
      <div className="flex gap-1.5">
        {[1,2,3,4,5,6].map(n => (
          <div key={n} className={`h-1 flex-1 rounded-full transition-all duration-300 ${n <= step ? 'bg-[var(--vfp-accent)]' : 'bg-white/[0.08]'}`} />
        ))}
      </div>

      {crumb && <p className="text-[10px] text-white/30 font-mono">📍 {crumb}</p>}

      {/* ══ ÉTAPE 1 — Culture ══════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-2">
          <p className="text-white/60 text-sm font-medium mb-3">Quelle culture souhaitez-vous irriguer ?</p>
          <div className="grid grid-cols-2 gap-2">
            {crops.map(c => (
              <button key={c.id} onClick={() => { setCrop(c); setStep(2) }}
                className="vfp-card rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.97] transition-transform text-left">
                <span className="text-2xl">{c.emoji}</span>
                <div>
                  <p className="text-white font-semibold text-sm">{c.name}</p>
                  <p className="text-white/30 text-[10px]">
                    Kc moy. {(c.kc.reduce((a,b) => a+b, 0) / c.kc.length).toFixed(2)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══ ÉTAPE 2 — Type de sol ══════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-2">
          <p className="text-white/60 text-sm font-medium mb-3">Quel est le type de sol de votre parcelle ?</p>
          {soilTypes.map(s => (
            <button key={s.id} onClick={() => { setSoil(s); setStep(3) }}
              className="w-full vfp-card rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform">
              <span className="text-2xl w-10 text-center shrink-0">{s.emoji}</span>
              <div className="flex-1 text-left">
                <p className="text-white font-semibold text-sm">{s.name}</p>
                <p className="text-white/40 text-xs">{s.desc}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-white/40">RU</p>
                <p className="text-white font-bold">{s.RU} <span className="text-xs text-white/30">mm/m</span></p>
              </div>
            </button>
          ))}
          <p className="text-white/25 text-[10px] text-center mt-1">ROSETTA v3 · USDA-ARS · van Genuchten</p>
        </div>
      )}

      {/* ══ ÉTAPE 3 — Système d'irrigation ═════════════════════════════════════ */}
      {step === 3 && (
        <div className="space-y-2">
          <p className="text-white/60 text-sm font-medium mb-3">Quel système d'irrigation utilisez-vous ?</p>
          {systems.map(s => (
            <button key={s.id} onClick={() => { setSystem(s); setStep(4) }}
              className="w-full vfp-card rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform">
              <span className="text-xl w-10 text-center shrink-0">{s.emoji}</span>
              <div className="flex-1 text-left">
                <p className="text-white font-semibold text-sm">{s.label}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-white/40">Efficience</p>
                <p className="text-[var(--vfp-accent)] font-bold">{Math.round(s.efficiency * 100)}%</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ══ ÉTAPE 4 — Surface ═══════════════════════════════════════════════════ */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold block mb-1.5">
              Surface de la parcelle (ha)
            </label>
            <input
              type="number" inputMode="decimal" placeholder="Ex: 1.0"
              value={surface}
              onChange={e => setSurface(e.target.value)}
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.1] px-4 py-3 text-white text-lg font-bold placeholder:text-white/20 focus:outline-none focus:border-[var(--vfp-accent)]/40"
            />
            <p className="text-white/25 text-xs mt-1">1 hectare = 10 000 m² · Entrez 0.1 pour 1 000 m²</p>
          </div>
          <button
            onClick={() => setStep(5)}
            disabled={!surface || parseFloat(surface) <= 0}
            className="w-full py-3.5 rounded-xl bg-[var(--vfp-cta)] text-[var(--vfp-cta-fg)] font-bold text-sm disabled:opacity-30 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
          >
            <ChevronRight className="h-4 w-4" /> Continuer
          </button>
        </div>
      )}

      {/* ══ ÉTAPE 5 — Localisation ══════════════════════════════════════════════ */}
      {step === 5 && (
        <div className="space-y-4">
          <p className="text-white/60 text-sm font-medium">
            Où se trouve votre parcelle ?
            <span className="block text-white/30 text-xs mt-0.5 font-normal">
              Le GPS permet d'utiliser les normales climatiques locales (NASA POWER 30 ans).
            </span>
          </p>

          {/* GPS */}
          <button
            onClick={detectGps}
            disabled={gpsLoading}
            className={`w-full vfp-card rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform ${gpsCoords ? 'border border-[var(--vfp-accent)]/40' : ''}`}
          >
            {gpsLoading
              ? <Loader2 className="h-5 w-5 text-[var(--vfp-accent)] animate-spin shrink-0" />
              : <MapPin className="h-5 w-5 text-[var(--vfp-accent)] shrink-0" />
            }
            <div className="flex-1 text-left">
              <p className="text-white font-semibold text-sm">
                {gpsCoords
                  ? `GPS détecté · ${gpsCoords.lat.toFixed(3)}N, ${gpsCoords.lon.toFixed(3)}E`
                  : 'Détecter ma position GPS'
                }
              </p>
              <p className="text-white/40 text-xs">
                {gpsCoords ? 'NASA POWER climatologie exacte' : 'Recommandé — précision maximale'}
              </p>
            </div>
          </button>

          {/* Ou région */}
          <div>
            <p className="text-white/40 text-xs text-center mb-2">— ou choisir une région —</p>
            <div className="space-y-1.5">
              {REGIONS.map(r => (
                <button key={r.id}
                  onClick={() => { setRegion(r.id); setGpsCoords(null) }}
                  className={`w-full vfp-card rounded-xl p-3 flex items-center gap-3 active:scale-[0.98] transition-transform ${region === r.id ? 'border border-[var(--vfp-accent)]/40 bg-[var(--vfp-accent)]/5' : ''}`}
                >
                  <span className="text-lg">{r.emoji}</span>
                  <div className="flex-1 text-left">
                    <p className="text-white text-sm font-medium">{r.name}</p>
                    <p className="text-white/30 text-xs">{r.desc}</p>
                  </div>
                  {region === r.id && <div className="w-2 h-2 rounded-full bg-[var(--vfp-accent)] shrink-0" />}
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
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Calcul en cours…</>
              : <><Droplets className="h-4 w-4" /> Calculer mes besoins</>
            }
          </button>
          {calcError && (
            <p className="text-red-300/80 text-xs text-center bg-red-500/10 rounded-xl p-3">{calcError}</p>
          )}
        </div>
      )}

      {/* ══ ÉTAPE 6 — Résultats ═════════════════════════════════════════════════ */}
      {step === 6 && result && (
        <div className="space-y-4">
          {/* Source climatique */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/30 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
              {result.climate_source}
            </span>
            {result.avg_temp && (
              <span className="text-[9px] text-white/25">
                {result.avg_temp}°C moy · {result.total_precip} mm/an
              </span>
            )}
          </div>

          {/* KPIs */}
          <div className="vfp-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
              <div className="w-10 h-10 rounded-xl bg-[var(--vfp-accent)]/15 flex items-center justify-center">
                <span className="text-xl">{crop?.emoji}</span>
              </div>
              <div>
                <p className="text-white font-bold text-sm">{result.crop} · {result.soil} · {result.system}</p>
                <p className="text-white/40 text-xs">{result.area_ha} ha · efficience {result.kpis.efficiency_pct}%</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Volume total/an" value={`${(result.kpis.total_m3/1000).toFixed(1)} k`} unit="m³" sub={`${result.area_ha} ha`} accent />
              <KpiCard label="Mois de pointe" value={result.kpis.pic_mois.slice(0,4)} unit="" sub={`${result.kpis.pic_volume_m3.toLocaleString('fr')} m³`} />
              <KpiCard label="Débit pompe" value={result.kpis.debit_pompe_ls.toFixed(2)} unit="L/s" sub="12 h/j · pointe" accent />
              <KpiCard label="Besoin net max" value={result.kpis.max_besoin_net.toFixed(0)} unit="mm" sub={result.kpis.pic_mois} />
            </div>
          </div>

          {/* Tableau mensuel */}
          <div className="vfp-card rounded-2xl p-4">
            <p className="text-[var(--vfp-accent)] text-xs font-bold uppercase tracking-wider mb-3">
              📊 Besoins mensuels (m³/ha)
            </p>
            <div className="space-y-1.5">
              {result.monthly.map(row => (
                <div key={row.mois} className="flex items-center gap-2">
                  <span className="text-white/50 text-xs w-16 shrink-0 font-mono">{row.mois.slice(0,4)}</span>
                  <div className="flex-1 h-5 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (row.volume_ha / 250) * 100)}%`,
                        background: row.volume_ha > 150
                          ? 'var(--vfp-cta)'
                          : row.volume_ha > 80
                          ? 'var(--vfp-accent)'
                          : 'oklch(0.72 0.18 142 / 0.5)',
                      }}
                    />
                  </div>
                  <span className="text-white/70 text-xs w-14 text-right shrink-0 font-mono">
                    {row.volume_ha.toFixed(0)} m³
                  </span>
                </div>
              ))}
            </div>
            <p className="text-white/20 text-[10px] mt-3 text-right">
              Total : {result.kpis.total_m3.toLocaleString('fr')} m³ · Kc moy. {result.kpis.avg_kc} · ETP moy. {result.kpis.avg_etp_mmj} mm/j
            </p>
          </div>

          {/* Détail bilan hydrique */}
          <div className="vfp-card rounded-2xl p-4 space-y-2">
            <p className="text-[var(--vfp-accent)] text-xs font-bold uppercase tracking-wider mb-2">
              💡 Bilan hydrique détaillé
            </p>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[10px] text-white/60">
                <thead>
                  <tr className="text-white/30 border-b border-white/[0.06]">
                    <th className="text-left pb-1.5 font-semibold">Mois</th>
                    <th className="text-right pb-1.5 font-semibold">ETP</th>
                    <th className="text-right pb-1.5 font-semibold">Kc</th>
                    <th className="text-right pb-1.5 font-semibold">ETM</th>
                    <th className="text-right pb-1.5 font-semibold">Peff</th>
                    <th className="text-right pb-1.5 font-semibold">BNet</th>
                    <th className="text-right pb-1.5 font-semibold">Vol.</th>
                  </tr>
                </thead>
                <tbody>
                  {result.monthly.map(row => (
                    <tr key={row.mois} className="border-b border-white/[0.03]">
                      <td className="py-1 font-medium text-white/70">{row.mois.slice(0,4)}</td>
                      <td className="py-1 text-right">{row.etp}</td>
                      <td className="py-1 text-right">{row.kc}</td>
                      <td className="py-1 text-right">{row.etm}</td>
                      <td className="py-1 text-right">{row.peff}</td>
                      <td className={`py-1 text-right font-medium ${row.besoin_net > 0 ? 'text-[var(--vfp-accent)]' : 'text-white/30'}`}>
                        {row.besoin_net}
                      </td>
                      <td className="py-1 text-right text-white/80">{row.volume_ha}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-white/20 text-[9px]">ETP mm/j · ETM mm/mois · Peff mm · BNet mm · Vol. m³/ha</p>
          </div>

          {/* Conseils */}
          <div className="vfp-card rounded-2xl p-4 space-y-2">
            <p className="text-[var(--vfp-accent)] text-xs font-bold uppercase tracking-wider">💡 Recommandations</p>
            <ul className="space-y-2 text-white/60 text-sm">
              {result.kpis.debit_pompe_ls > 0 && (
                <li>• Pompe recommandée : {result.kpis.debit_pompe_ls.toFixed(2)} L/s (12h/j au mois de pointe)</li>
              )}
              {result.kpis.efficiency_pct >= 85 && (
                <li>• Système optimal — le goutte-à-goutte réduit l'évaporation de 30%</li>
              )}
              {result.kpis.efficiency_pct < 75 && (
                <li>• Passage au goutte-à-goutte recommandé : économie de 25-35% du volume</li>
              )}
              <li>• Ajustez selon les pluies réelles — soustrayez la pluviométrie observée</li>
              <li>• Irriguez tôt le matin (6h-8h) pour réduire l'évaporation de 20%</li>
              {soil && soil.RU < 100 && (
                <li>• Sol sableux : fréquence d'irrigation élevée, faibles doses à la fois</li>
              )}
              {soil && soil.RU > 140 && (
                <li>• Sol argileux : espacez les irrigations, surveillez l'engorgement</li>
              )}
            </ul>
          </div>

          <button onClick={reset} className="w-full py-3 rounded-xl border border-[var(--vfp-accent)]/20 text-[var(--vfp-accent)] text-sm font-semibold active:opacity-70 transition-opacity flex items-center justify-center gap-2">
            <RotateCcw className="h-4 w-4" /> Nouveau calcul
          </button>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, unit, sub, accent }: {
  label: string; value: string; unit: string; sub: string; accent?: boolean
}) {
  return (
    <div className={`rounded-xl p-3 border ${accent ? 'bg-[var(--vfp-accent)]/[0.07] border-[var(--vfp-accent)]/20' : 'bg-white/[0.03] border-white/[0.05]'}`}>
      <p className="text-white/40 text-xs mb-0.5">{label}</p>
      <p className={`text-xl font-bold leading-tight ${accent ? 'text-[var(--vfp-accent)]' : 'text-white'}`}>
        {value} <span className="text-xs font-normal opacity-60">{unit}</span>
      </p>
      <p className="text-xs text-white/30 mt-0.5">{sub}</p>
    </div>
  )
}
