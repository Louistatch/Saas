'use client'

import { useState } from 'react'
import { ArrowLeft, Droplets, ChevronRight, RotateCcw } from 'lucide-react'

// ─── Données agronomiques (FAO-56) ──────────────────────────────────────────

const CROPS = [
  {
    id: 'tomate',    name: 'Tomate',  emoji: '🍅',
    kc: { ini: 0.60, dev: 0.90, mid: 1.15, late: 0.80 },
    days: { ini: 30, dev: 40, mid: 45, late: 25 },
  },
  {
    id: 'oignon',   name: 'Oignon',  emoji: '🧅',
    kc: { ini: 0.70, dev: 0.88, mid: 1.05, late: 0.75 },
    days: { ini: 15, dev: 35, mid: 110, late: 30 },
  },
  {
    id: 'piment',   name: 'Piment',  emoji: '🌶️',
    kc: { ini: 0.60, dev: 0.83, mid: 1.05, late: 0.90 },
    days: { ini: 30, dev: 35, mid: 40, late: 20 },
  },
  {
    id: 'gombo',    name: 'Gombo',   emoji: '🥒',
    kc: { ini: 0.50, dev: 0.80, mid: 1.10, late: 0.60 },
    days: { ini: 20, dev: 30, mid: 40, late: 20 },
  },
  {
    id: 'mais',     name: 'Maïs',   emoji: '🌽',
    kc: { ini: 0.30, dev: 0.75, mid: 1.20, late: 0.35 },
    days: { ini: 20, dev: 35, mid: 40, late: 30 },
  },
  {
    id: 'riz',      name: 'Riz',    emoji: '🌾',
    kc: { ini: 1.05, dev: 1.13, mid: 1.20, late: 0.75 },
    days: { ini: 30, dev: 30, mid: 60, late: 30 },
  },
  {
    id: 'sorgho',   name: 'Sorgho', emoji: '🌿',
    kc: { ini: 0.30, dev: 0.65, mid: 1.00, late: 0.55 },
    days: { ini: 20, dev: 35, mid: 45, late: 30 },
  },
  {
    id: 'manioc',   name: 'Manioc', emoji: '🥔',
    kc: { ini: 0.30, dev: 0.70, mid: 1.00, late: 0.90 },
    days: { ini: 60, dev: 90, mid: 120, late: 60 },
  },
]

// ETo de référence (mm/jour) par région et saison — valeurs Togo (FAO/CLIMWAT)
const REGIONS = [
  { id: 'maritime', name: 'Maritime',  emoji: '🌊', eto: { dry: 6.5, wet: 4.5 } },
  { id: 'plateaux', name: 'Plateaux',  emoji: '🏔️', eto: { dry: 5.8, wet: 4.2 } },
  { id: 'centrale', name: 'Centrale',  emoji: '🌾', eto: { dry: 7.0, wet: 4.8 } },
  { id: 'kara',     name: 'Kara',      emoji: '☀️', eto: { dry: 7.5, wet: 5.0 } },
  { id: 'savanes',  name: 'Savanes',   emoji: '🌿', eto: { dry: 8.0, wet: 5.5 } },
]

const STAGES = [
  { id: 'ini',  label: 'Initial',          desc: 'Semis / plantation',        color: 'from-emerald-400/30' },
  { id: 'dev',  label: 'Développement',    desc: 'Croissance des feuilles',   color: 'from-cyan-400/30' },
  { id: 'mid',  label: 'Mi-saison',        desc: 'Floraison / fructification', color: 'from-violet-400/30' },
  { id: 'late', label: 'Fin de saison',    desc: 'Maturation / récolte',      color: 'from-amber-400/30' },
]

type Stage = 'ini' | 'dev' | 'mid' | 'late'
type Season = 'dry' | 'wet'

interface Props { onBack: () => void }

export function AgriSmartWater({ onBack }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [crop, setCrop]     = useState<typeof CROPS[0] | null>(null)
  const [stage, setStage]   = useState<Stage | null>(null)
  const [region, setRegion] = useState<typeof REGIONS[0] | null>(null)
  const [season, setSeason] = useState<Season | null>(null)
  const [surface, setSurface] = useState('')

  const reset = () => {
    setCrop(null); setStage(null); setRegion(null); setSeason(null)
    setSurface(''); setStep(1)
  }

  // ── Calcul ETc ──────────────────────────────────────────────────────────
  const compute = () => {
    if (!crop || !stage || !region || !season) return null
    const eto = region.eto[season]
    const kc  = crop.kc[stage]
    const etc = eto * kc                         // mm/jour
    const days = crop.days[stage]
    const surfM2 = parseFloat(surface) || 1000   // m²
    const litersPerDay  = etc * surfM2 * 1        // 1 mm/m² = 1 litre/m²
    const litersPerWeek = litersPerDay * 7
    const litersTotal   = litersPerDay * days
    const m3Total       = litersTotal / 1000

    return { etc, kc, eto, days, litersPerDay, litersPerWeek, litersTotal, m3Total, surfM2 }
  }

  const result = step === 5 ? compute() : null

  // ── Breadcrumb helpers ───────────────────────────────────────────────────
  const crumb = [
    crop?.name,
    stage ? STAGES.find(s => s.id === stage)?.label : null,
    region?.name,
    season === 'dry' ? 'Saison sèche' : season === 'wet' ? 'Saison pluvieuse' : null,
  ].filter(Boolean).join(' › ')

  return (
    <div className="space-y-4 agrismart-root">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={step === 1 ? onBack : () => setStep(s => (s - 1) as typeof step)} className="flex items-center gap-1.5 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
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
          <h3 className="text-white font-bold text-lg">AgriSmart — Eau</h3>
        </div>
        <p className="text-white/40 text-xs pl-10">Besoins en irrigation de vos cultures (FAO-56)</p>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1.5">
        {[1,2,3,4,5].map(n => (
          <div key={n} className={`h-1 flex-1 rounded-full transition-all duration-300 ${n <= step ? 'bg-[var(--vfp-accent)]' : 'bg-white/[0.08]'}`} />
        ))}
      </div>

      {crumb && <p className="text-[10px] text-white/30 font-mono">📍 {crumb}</p>}

      {/* ── ÉTAPE 1 : Culture ── */}
      {step === 1 && (
        <div className="space-y-2">
          <p className="text-white/60 text-sm font-medium mb-3">Quelle culture souhaitez-vous irriguer ?</p>
          <div className="grid grid-cols-2 gap-2">
            {CROPS.map(c => (
              <button key={c.id} onClick={() => { setCrop(c); setStep(2) }}
                className="vfp-card rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.97] transition-transform text-left">
                <span className="text-2xl">{c.emoji}</span>
                <div>
                  <p className="text-white font-semibold text-sm">{c.name}</p>
                  <p className="text-white/30 text-[10px]">{c.days.ini + c.days.dev + c.days.mid + c.days.late} jours</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── ÉTAPE 2 : Stade ── */}
      {step === 2 && (
        <div className="space-y-2">
          <p className="text-white/60 text-sm font-medium mb-3">Quel est le stade de croissance actuel ?</p>
          {STAGES.map(s => {
            const kc = crop!.kc[s.id as Stage]
            const days = crop!.days[s.id as Stage]
            return (
              <button key={s.id} onClick={() => { setStage(s.id as Stage); setStep(3) }}
                className="w-full vfp-card rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform text-left">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.color} to-transparent flex items-center justify-center shrink-0`}>
                  <Droplets className="h-5 w-5 text-white/70" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm">{s.label}</p>
                  <p className="text-white/40 text-xs">{s.desc} — {days} jours</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-white/50">Kc</p>
                  <p className="text-white font-bold text-lg">{kc.toFixed(2)}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── ÉTAPE 3 : Région ── */}
      {step === 3 && (
        <div className="space-y-2">
          <p className="text-white/60 text-sm font-medium mb-3">Dans quelle région se trouve votre parcelle ?</p>
          {REGIONS.map(r => (
            <button key={r.id} onClick={() => { setRegion(r); setStep(4) }}
              className="w-full vfp-card rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform">
              <span className="text-2xl w-11 text-center">{r.emoji}</span>
              <div className="flex-1 text-left">
                <p className="text-white font-semibold text-sm">{r.name}</p>
                <p className="text-white/40 text-xs">ETo sec {r.eto.dry} mm/j — pluv. {r.eto.wet} mm/j</p>
              </div>
              <ChevronRight className="h-4 w-4 text-white/30" />
            </button>
          ))}
        </div>
      )}

      {/* ── ÉTAPE 4 : Saison + Surface ── */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <p className="text-white/60 text-sm font-medium mb-3">Quelle saison êtes-vous ?</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { id: 'dry', label: 'Saison sèche',     emoji: '☀️', desc: 'Nov → Mar' },
                { id: 'wet', label: 'Saison pluvieuse', emoji: '🌧️', desc: 'Avr → Oct' },
              ] as const).map(s => (
                <button key={s.id} onClick={() => setSeason(s.id)}
                  className={`vfp-card rounded-2xl p-4 flex flex-col items-center gap-1.5 transition-all ${season === s.id ? 'border border-[var(--vfp-accent)]/50 bg-[var(--vfp-accent)]/10' : ''}`}>
                  <span className="text-2xl">{s.emoji}</span>
                  <p className="text-white font-semibold text-sm text-center">{s.label}</p>
                  <p className="text-white/40 text-xs">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold block mb-1.5">
              Surface de la parcelle (m²)
            </label>
            <input
              type="number" inputMode="numeric" placeholder="Ex: 1000"
              value={surface}
              onChange={e => setSurface(e.target.value)}
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.1] px-4 py-3 text-white text-lg font-bold placeholder:text-white/20 focus:outline-none focus:border-[var(--vfp-accent)]/40"
            />
            <p className="text-white/25 text-xs mt-1">1 hectare = 10 000 m²</p>
          </div>

          <button
            onClick={() => { if (season) setStep(5) }}
            disabled={!season}
            className="w-full py-3.5 rounded-xl bg-[var(--vfp-cta)] text-[var(--vfp-cta-fg)] font-bold text-sm disabled:opacity-30 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
          >
            <Droplets className="h-4 w-4" /> Calculer mes besoins
          </button>
        </div>
      )}

      {/* ── ÉTAPE 5 : Résultats ── */}
      {step === 5 && result && (
        <div className="space-y-4">
          {/* Carte principale */}
          <div className="vfp-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
              <div className="w-12 h-12 rounded-xl bg-[var(--vfp-accent)]/15 flex items-center justify-center">
                <span className="text-2xl">{crop!.emoji}</span>
              </div>
              <div>
                <p className="text-white font-bold">{crop!.name} — {STAGES.find(s => s.id === stage)?.label}</p>
                <p className="text-white/40 text-xs">{region!.name} · {season === 'dry' ? 'Saison sèche' : 'Saison pluvieuse'} · {result.surfM2.toLocaleString('fr')} m²</p>
              </div>
            </div>

            {/* Formule */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3 text-center">
              <p className="text-white/40 text-xs mb-1">ETc = ETo × Kc</p>
              <p className="text-white font-mono text-sm">
                <span className="text-[var(--vfp-accent)]">{result.etc.toFixed(1)} mm/j</span>
                {' = '}
                <span className="text-white/60">{result.eto} × {result.kc.toFixed(2)}</span>
              </p>
            </div>

            {/* Métriques */}
            <div className="grid grid-cols-2 gap-3">
              <ResultCard label="Par jour" value={Math.round(result.litersPerDay).toLocaleString('fr')} unit="litres" sub={`${result.etc.toFixed(1)} mm/m²`} accent />
              <ResultCard label="Par semaine" value={Math.round(result.litersPerWeek).toLocaleString('fr')} unit="litres" sub="7 jours" />
              <ResultCard label="Pour ce stade" value={result.m3Total.toFixed(1)} unit="m³" sub={`${result.days} jours`} accent />
              <ResultCard label="Total du stade" value={Math.round(result.litersTotal).toLocaleString('fr')} unit="litres" sub={`${result.days} jours`} />
            </div>
          </div>

          {/* Conseils */}
          <div className="vfp-card rounded-2xl p-4 space-y-3">
            <p className="text-[var(--vfp-accent)] text-xs font-bold uppercase tracking-wider">💡 Conseils d'irrigation</p>
            <ul className="space-y-2 text-white/60 text-sm">
              {stage === 'ini' && <li>• Arrosages légers et fréquents pour favoriser la germination</li>}
              {stage === 'dev' && <li>• Augmentez progressivement les apports avec la croissance</li>}
              {stage === 'mid' && <li>• Stade critique : ne pas laisser le sol sécher complètement</li>}
              {stage === 'late' && <li>• Réduire l'eau 10 jours avant la récolte pour concentrer les sucres</li>}
              {season === 'dry' && <li>• Privilégiez l'irrigation tôt le matin pour réduire l'évaporation</li>}
              {season === 'wet' && <li>• Ajustez selon les pluies — soustrayez la pluviométrie réelle</li>}
              <li>• Divisez par 2 si irrigation au goutte-à-goutte (efficacité ≈ 90%)</li>
            </ul>
          </div>

          {/* CTA */}
          <button onClick={reset} className="w-full py-3 rounded-xl border border-[var(--vfp-accent)]/20 text-[var(--vfp-accent)] text-sm font-semibold active:opacity-70 transition-opacity flex items-center justify-center gap-2">
            <RotateCcw className="h-4 w-4" /> Nouveau calcul
          </button>
        </div>
      )}
    </div>
  )
}

function ResultCard({ label, value, unit, sub, accent }: {
  label: string; value: string; unit: string; sub: string; accent?: boolean
}) {
  return (
    <div className={`rounded-xl p-3 border ${accent ? 'bg-[var(--vfp-accent)]/[0.07] border-[var(--vfp-accent)]/20' : 'bg-white/[0.03] border-white/[0.05]'}`}>
      <p className="text-white/40 text-xs mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${accent ? 'text-[var(--vfp-accent)]' : 'text-white'}`}>{value}</p>
      <p className="text-xs text-white/40">{unit} <span className="text-white/20">· {sub}</span></p>
    </div>
  )
}
