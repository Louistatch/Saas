'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  CloudRain,
  Droplets,
  Wind,
  Sun,
  Waves,
  ChevronDown,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Flame,
  Thermometer,
  Leaf,
} from 'lucide-react'

/* ─────────────────────────── Types ─────────────────────────── */

interface WeatherDay {
  date: string
  temperature_max: number | null
  temperature_min: number | null
  temperature_mean: number | null
  precipitation_mm: number | null
  humidity_pct: number | null
  wind_speed_ms: number | null
  et0_mm: number | null
  region: string | null
}

interface AgroInsights {
  drought_risk?: 'low' | 'moderate' | 'high' | 'critical'
  planting_window?: string | null
  spray_window?: string | null
  water_stress_days?: number
  heat_stress_days?: number
}

interface ApiResponse {
  weather?: WeatherDay[]
  region?: string | null
  data_source?: 'live' | 'cached' | string
  agro_insights?: AgroInsights
  updated_at?: string
}

interface Props {
  cardNumber: string
  onBack: () => void
  onOpenAgriSmart?: () => void
}

/* ─────────────────────────── CSS animations (injected once) ─────────────────────────── */

const CSS_ANIMATIONS = `
@keyframes meteo-float {
  0%,100% { transform: translateY(0px); }
  50%      { transform: translateY(-6px); }
}
@keyframes meteo-spin-slow {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes meteo-fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes meteo-slide-in {
  from { opacity: 0; transform: translateX(40px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes meteo-pulse-dot {
  0%,100% { opacity: 1; }
  50%     { opacity: 0.3; }
}
`

function injectAnimations() {
  if (typeof document !== 'undefined' && !document.getElementById('meteo-animations')) {
    const style = document.createElement('style')
    style.id = 'meteo-animations'
    style.textContent = CSS_ANIMATIONS
    document.head.appendChild(style)
  }
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function localDateStr(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dayLabel(dateStr: string, todayStr: string): string {
  const diff = Math.round(
    (new Date(dateStr + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000
  )
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return 'Demain'
  if (diff === -1) return 'Hier'
  if (diff === -2) return 'Avant-hier'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })
}

function dayShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { weekday: 'short' })
}

function dayNum(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function fmtTime(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return isoStr
  }
}

interface WeatherInfo {
  emoji: string
  label: string
  bg: string
}

function getWeatherInfo(precipMm: number | null, tempMax: number | null, windMs: number | null): WeatherInfo {
  const p = precipMm ?? 0
  const t = tempMax ?? 25
  const w = windMs ?? 0
  if (p > 20 || (p > 10 && w > 6))
    return { emoji: '⛈️', label: 'Orage', bg: 'from-gray-800 to-slate-900' }
  if (p > 8)
    return { emoji: '🌧️', label: 'Pluie', bg: 'from-slate-700 to-blue-900' }
  if (p > 2)
    return { emoji: '🌦️', label: 'Averses', bg: 'from-slate-600 to-blue-800' }
  if (p > 0)
    return { emoji: '🌤️', label: 'Partiellement nuageux', bg: 'from-blue-600 to-sky-700' }
  if (t > 33)
    return { emoji: '🌞', label: 'Ensoleillé chaud', bg: 'from-amber-500 to-orange-600' }
  return { emoji: '☀️', label: 'Ensoleillé', bg: 'from-yellow-400 to-amber-500' }
}

/* ─────────────────────────── Alert computation ─────────────────────────── */

type AlertLevel = 'critical' | 'high' | 'moderate' | 'low'

interface AgroAlert {
  level: AlertLevel
  icon: React.ElementType
  text: string
}

const ALERT_CONFIG: Record<AlertLevel, { color: string; icon: React.ElementType }> = {
  critical: { color: 'bg-red-500/20 border-red-500/40 text-red-300',     icon: AlertTriangle },
  high:     { color: 'bg-orange-500/20 border-orange-500/40 text-orange-300', icon: Flame },
  moderate: { color: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300', icon: AlertCircle },
  low:      { color: 'bg-green-500/20 border-green-500/40 text-green-300', icon: CheckCircle2 },
}

function buildAgroAlerts(insights: AgroInsights | undefined, today: WeatherDay, upcoming: WeatherDay[]): AgroAlert[] {
  const alerts: AgroAlert[] = []

  if (insights) {
    // drought_risk
    if (insights.drought_risk === 'critical') {
      alerts.push({ level: 'critical', icon: AlertTriangle, text: 'Sécheresse critique — Irriguer immédiatement' })
    } else if (insights.drought_risk === 'high') {
      alerts.push({ level: 'high', icon: Flame, text: 'Risque élevé de sécheresse — Irriguer sous 48h' })
    } else if (insights.drought_risk === 'moderate') {
      alerts.push({ level: 'moderate', icon: AlertCircle, text: 'Risque modéré de sécheresse — Surveiller l\'humidité des sols' })
    }
    // spray_window
    if (insights.spray_window) {
      alerts.push({ level: 'low', icon: CheckCircle2, text: `Fenêtre traitement : ${insights.spray_window} · Vent favorable` })
    }
    // planting_window
    if (insights.planting_window) {
      alerts.push({ level: 'low', icon: Leaf, text: 'Semis favorable les prochains jours' })
    }
    // heat_stress_days
    if ((insights.heat_stress_days ?? 0) > 2) {
      alerts.push({ level: 'high', icon: Thermometer, text: `Stress thermique ${insights.heat_stress_days} jours · Protégez vos plants` })
    }
  } else {
    // Compute locally from raw data
    if (today.et0_mm != null && today.et0_mm >= 5) {
      alerts.push({ level: 'high', icon: Flame, text: `ETP élevée (${today.et0_mm.toFixed(1)} mm/j) — irriguez vos cultures dès aujourd'hui` })
    }
    if (today.temperature_max != null && today.temperature_max >= 38) {
      alerts.push({ level: 'critical', icon: AlertTriangle, text: `Chaleur extrême (${Math.round(today.temperature_max)}°C) — protégez vos plants` })
    }
    const totalPrecip = upcoming.reduce((s, d) => s + (d.precipitation_mm ?? 0), 0)
    if (totalPrecip >= 50) {
      alerts.push({ level: 'moderate', icon: AlertCircle, text: `Pluies importantes prévues (${totalPrecip.toFixed(0)} mm cumulés) — vérifiez le drainage` })
    }
    if (today.wind_speed_ms != null && today.wind_speed_ms >= 8) {
      alerts.push({ level: 'moderate', icon: AlertCircle, text: `Vent fort (${today.wind_speed_ms.toFixed(1)} m/s) — risque de verse sur cultures hautes` })
    }
    const dryDays = upcoming.filter(d => (d.precipitation_mm ?? 0) < 1).length
    if ((today.precipitation_mm ?? 0) < 0.5 && (today.et0_mm ?? 0) > 3 && dryDays >= 4) {
      alerts.push({ level: 'moderate', icon: AlertCircle, text: `${dryDays} jours sans pluie prévus — planifiez l'irrigation` })
    }
  }
  return alerts
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

/** Animated floating weather icon */
function FloatingIcon({ emoji, size = 64 }: { emoji: string; size?: number }) {
  return (
    <span
      style={{
        fontSize: size,
        lineHeight: 1,
        display: 'inline-block',
        animation: 'meteo-float 2.5s ease-in-out infinite',
      }}
      aria-hidden
    >
      {emoji}
    </span>
  )
}

/** Circular wind gauge using SVG stroke-dasharray */
function WindGauge({ windMs }: { windMs: number | null }) {
  const max = 15 // m/s scale max
  const val = Math.min(windMs ?? 0, max)
  const pct = val / max
  const r = 22
  const circumference = 2 * Math.PI * r
  const dash = pct * circumference * 0.75 // 270° arc
  const color = val >= 8 ? '#f97316' : val >= 4 ? '#facc15' : '#34d399'

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14">
        <svg viewBox="0 0 56 56" className="w-full h-full -rotate-[135deg]">
          {/* Track */}
          <circle
            cx="28" cy="28" r={r}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="4"
            strokeDasharray={`${circumference * 0.75} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Value */}
          <circle
            cx="28" cy="28" r={r}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Wind className="h-4 w-4 text-teal-300" />
        </div>
      </div>
      <span className="text-white font-semibold text-sm">
        {windMs != null ? windMs.toFixed(1) : '—'}
        <span className="text-[10px] text-white/40 ml-0.5">m/s</span>
      </span>
      <span className="text-white/40 text-[10px]">Vent</span>
    </div>
  )
}

/** Horizontal progress bar */
function ProgressBar({
  value, max, color, icon: Icon, label, unit,
}: {
  value: number | null
  max: number
  color: string
  icon: React.ElementType
  label: string
  unit: string
}) {
  const pct = value != null ? Math.min(Math.max(value / max, 0), 1) * 100 : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 opacity-70" />
          <span className="text-white/60 text-[11px]">{label}</span>
        </div>
        <span className="text-white font-semibold text-xs">
          {value != null ? (Number.isInteger(value) ? value : value.toFixed(1)) : '—'}
          <span className="text-[10px] text-white/40 ml-0.5">{unit}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%`, transition: 'width 0.8s ease' }}
        />
      </div>
    </div>
  )
}

/** A single forecast day card for the horizontal scroll */
function ForecastCard({
  day,
  todayStr,
  maxPrecip,
  index,
  isSelected,
}: {
  day: WeatherDay
  todayStr: string
  maxPrecip: number
  index: number
  isSelected: boolean
}) {
  const info = getWeatherInfo(day.precipitation_mm, day.temperature_max, day.wind_speed_ms)
  const precipPct = maxPrecip > 0 ? Math.min((day.precipitation_mm ?? 0) / maxPrecip, 1) * 100 : 0
  const isToday = day.date === todayStr

  return (
    <div
      className={[
        'snap-center shrink-0 flex flex-col items-center gap-1.5 rounded-2xl px-3 py-3 border',
        'bg-white/8 backdrop-blur-sm',
        isSelected || isToday
          ? 'border-sky-400/60 scale-105 bg-sky-500/15'
          : 'border-white/10',
      ].join(' ')}
      style={{
        minWidth: 80,
        animation: `meteo-slide-in 0.4s ease both`,
        animationDelay: `${index * 50}ms`,
      }}
    >
      {/* Day label */}
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${isToday ? 'text-sky-300' : 'text-white/50'}`}>
        {isToday ? 'Auj.' : dayShort(day.date)}
      </span>
      <span className="text-[10px] text-white/30">{dayNum(day.date)}</span>

      {/* Weather emoji */}
      <span className="text-2xl leading-none my-0.5">{info.emoji}</span>

      {/* Temps */}
      <div className="text-center">
        <div className="text-white font-bold text-sm">{day.temperature_max != null ? Math.round(day.temperature_max) : '—'}°</div>
        <div className="text-white/40 text-[11px]">{day.temperature_min != null ? Math.round(day.temperature_min) : '—'}°</div>
      </div>

      {/* Temperature gradient bar */}
      <div className="w-full h-1 rounded-full overflow-hidden bg-white/10 mt-0.5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-orange-400"
          style={{
            width: '100%',
            opacity: day.temperature_max != null ? 0.9 : 0.2,
          }}
        />
      </div>

      {/* Rain bar */}
      <div className="w-full flex flex-col items-center gap-0.5 mt-1">
        <div className="w-4 bg-white/8 rounded-sm overflow-hidden" style={{ height: 24 }}>
          <div
            className="w-full rounded-sm"
            style={{
              height: `${precipPct}%`,
              background: precipPct > 60 ? '#3b82f6' : precipPct > 20 ? '#60a5fa' : '#bfdbfe40',
              marginTop: 'auto',
              transition: 'height 0.8s ease',
            }}
          />
        </div>
        <span className="text-[9px] text-blue-300/70 font-mono">
          {(day.precipitation_mm ?? 0) > 0 ? `${(day.precipitation_mm ?? 0).toFixed(0)}mm` : '—'}
        </span>
      </div>
    </div>
  )
}

/** Skeleton loading UI */
function SkeletonLoader() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-40 rounded-3xl bg-white/8 border border-white/5" />
      <div className="flex gap-2 overflow-hidden">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="shrink-0 w-20 h-32 rounded-2xl bg-white/6 border border-white/5" />
        ))}
      </div>
      <div className="h-28 rounded-2xl bg-white/6 border border-white/5" />
      <div className="h-14 rounded-xl bg-white/5 border border-white/5" />
    </div>
  )
}

/* ─────────────────────────── Main component ─────────────────────────── */

export function MeteoInlineView({ cardNumber, onBack, onOpenAgriSmart }: Props) {
  const [weather, setWeather] = useState<WeatherDay[]>([])
  const [region, setRegion] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<string>('live')
  const [agroInsights, setAgroInsights] = useState<AgroInsights | undefined>(undefined)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    injectAnimations()
    setMounted(true)
  }, [])

  const doFetch = () => {
    setError(false)
    setLoading(true)
    fetch(`/api/verify/${encodeURIComponent(cardNumber)}/meteo`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: ApiResponse) => {
        setWeather(d.weather ?? [])
        setRegion(d.region ?? null)
        setDataSource(d.data_source ?? 'live')
        setAgroInsights(d.agro_insights)
        setUpdatedAt(d.updated_at ?? null)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { doFetch() }, [cardNumber]) // eslint-disable-line react-hooks/exhaustive-deps

  const todayStr = localDateStr()
  const pastRows = weather.filter(d => d.date < todayStr)
  const todayRow = weather.find(d => d.date === todayStr) ?? null
  const futureRows = weather.filter(d => d.date > todayStr)

  const highlightRow = todayRow ?? (pastRows.length > 0 ? pastRows[pastRows.length - 1] : null)
  const isActualToday = highlightRow?.date === todayStr

  const allForecast = [...(isActualToday && highlightRow ? [highlightRow] : []), ...futureRows]
  const maxPrecip = Math.max(...allForecast.map(d => d.precipitation_mm ?? 0), 1)

  const heroInfo = highlightRow
    ? getWeatherInfo(highlightRow.precipitation_mm, highlightRow.temperature_max, highlightRow.wind_speed_ms)
    : null

  const agroAlerts = highlightRow
    ? buildAgroAlerts(agroInsights, highlightRow, futureRows)
    : []

  const historyRows = (isActualToday ? pastRows : pastRows.slice(0, -1)).slice().reverse().slice(0, 3)

  const isLive = dataSource === 'live' || !dataSource || dataSource === ''

  return (
    <div
      className="space-y-4 max-w-md mx-auto"
      style={mounted ? { animation: 'meteo-fade-up 0.5s ease both' } : { opacity: 0 }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sky-400 text-sm font-medium active:opacity-70 transition-opacity"
        >
          <ArrowLeft className="h-4 w-4" />
          Météo Agricole
        </button>

        {/* Live / Cached badge */}
        <span className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${isLive ? 'bg-green-500/15 border-green-500/30 text-green-300' : 'bg-slate-500/15 border-slate-500/30 text-slate-300'}`}>
          <span
            className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-green-400' : 'bg-slate-400'}`}
            style={isLive ? { animation: 'meteo-pulse-dot 1.5s ease-in-out infinite' } : undefined}
          />
          {isLive ? 'Live' : 'Mis en cache'}
        </span>
      </div>

      {/* Subtitle */}
      {(region || updatedAt) && (
        <p className="text-white/35 text-xs -mt-2">
          Maritime · {region ?? 'Lomé'}
          {updatedAt ? ` · mis à jour ${fmtTime(updatedAt)}` : ''}
        </p>
      )}

      {/* ── Loading ── */}
      {loading && <SkeletonLoader />}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center space-y-3">
          <CloudRain className="h-8 w-8 text-white/20 mx-auto" />
          <p className="text-white/50 text-sm">Données météo indisponibles pour votre région.</p>
          <button
            onClick={doFetch}
            className="text-sky-400 text-sm font-semibold underline-offset-2 underline active:opacity-60"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && weather.length === 0 && (
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center">
          <CloudRain className="h-8 w-8 text-white/20 mx-auto mb-2" />
          <p className="text-white/50 text-sm">Aucune donnée météo disponible pour votre région.</p>
        </div>
      )}

      {/* ── Main content ── */}
      {!loading && !error && highlightRow && heroInfo && (
        <>
          {/* ═══════════════ HERO CARD ═══════════════ */}
          <div className={`relative rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-br ${heroInfo.bg}`}>
            {/* Glassmorphism overlay */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />

            <div className="relative p-5 space-y-4">
              {/* Date line */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-xs font-semibold uppercase tracking-widest">
                    {isActualToday ? "Aujourd'hui" : dayLabel(highlightRow.date, todayStr)}
                  </p>
                  <p className="text-white/45 text-xs mt-0.5 capitalize">{dayNum(highlightRow.date)}</p>
                </div>
                <p className="text-white/50 text-xs font-medium">{heroInfo.label}</p>
              </div>

              {/* Big icon + temperatures */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="flex items-end gap-3">
                    <span className="text-white font-black leading-none" style={{ fontSize: '4rem' }}>
                      {highlightRow.temperature_max != null ? Math.round(highlightRow.temperature_max) : '—'}°
                    </span>
                    <span className="text-white/60 font-semibold mb-2" style={{ fontSize: '1.5rem' }}>
                      {highlightRow.temperature_min != null ? Math.round(highlightRow.temperature_min) : '—'}°
                    </span>
                  </div>
                  <p className="text-white/50 text-xs mt-1">max / min</p>
                </div>

                <div className="flex flex-col items-center">
                  <FloatingIcon emoji={heroInfo.emoji} size={64} />
                  {/* Spinning sun if hot */}
                  {(highlightRow.temperature_max ?? 0) > 30 && (
                    <Sun
                      className="h-4 w-4 text-yellow-300/60 mt-1"
                      style={{ animation: 'meteo-spin-slow 20s linear infinite' }}
                    />
                  )}
                </div>
              </div>

              {/* 4 metric chips 2×2 */}
              <div className="grid grid-cols-2 gap-2">
                {/* Pluie */}
                <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-2.5 flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-blue-300 shrink-0" />
                  <div>
                    <p className="text-white font-semibold text-sm leading-none">
                      {highlightRow.precipitation_mm != null ? highlightRow.precipitation_mm.toFixed(1) : '—'}
                      <span className="text-[10px] text-white/40 ml-0.5">mm</span>
                    </p>
                    <p className="text-white/40 text-[10px] mt-0.5">Pluie</p>
                  </div>
                </div>

                {/* Vent */}
                <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-2.5 flex items-center gap-2">
                  <Wind className="h-4 w-4 text-teal-300 shrink-0" />
                  <div>
                    <p className="text-white font-semibold text-sm leading-none">
                      {highlightRow.wind_speed_ms != null ? highlightRow.wind_speed_ms.toFixed(1) : '—'}
                      <span className="text-[10px] text-white/40 ml-0.5">m/s</span>
                    </p>
                    <p className="text-white/40 text-[10px] mt-0.5">Vent</p>
                  </div>
                </div>

                {/* Humidité */}
                <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-2.5 flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-sky-300 shrink-0" />
                  <div>
                    <p className="text-white font-semibold text-sm leading-none">
                      {highlightRow.humidity_pct != null ? Math.round(highlightRow.humidity_pct) : '—'}
                      <span className="text-[10px] text-white/40 ml-0.5">%</span>
                    </p>
                    <p className="text-white/40 text-[10px] mt-0.5">Hum.</p>
                  </div>
                </div>

                {/* ETo */}
                <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-2.5 flex items-center gap-2">
                  <Leaf className="h-4 w-4 text-green-300 shrink-0" />
                  <div>
                    <p className="text-white font-semibold text-sm leading-none">
                      {highlightRow.et0_mm != null ? highlightRow.et0_mm.toFixed(1) : '—'}
                      <span className="text-[10px] text-white/40 ml-0.5">mm</span>
                    </p>
                    <p className="text-white/40 text-[10px] mt-0.5">ETo</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════ VISUAL INDICATORS ═══════════════ */}
          <div className="rounded-2xl bg-white/5 border border-white/8 p-4 space-y-4">
            <div className="flex items-center justify-around">
              <WindGauge windMs={highlightRow.wind_speed_ms} />
              <div className="w-px h-16 bg-white/10" />
              <div className="flex-1 px-4 space-y-3">
                <ProgressBar
                  value={highlightRow.humidity_pct}
                  max={100}
                  color="bg-gradient-to-r from-blue-500 to-sky-400"
                  icon={Droplets}
                  label="Humidité"
                  unit="%"
                />
                <ProgressBar
                  value={highlightRow.et0_mm}
                  max={10}
                  color="bg-gradient-to-r from-green-500 to-emerald-400"
                  icon={Leaf}
                  label="ETo FAO-56"
                  unit="mm/j"
                />
              </div>
            </div>
          </div>

          {/* ═══════════════ 7-DAY HORIZONTAL SCROLL ═══════════════ */}
          {allForecast.length > 0 && (
            <div className="space-y-2">
              <p className="text-white/35 text-xs font-semibold uppercase tracking-wider px-1">
                Prévisions {allForecast.length} jours
              </p>
              <div
                className="flex gap-2 overflow-x-auto pb-2"
                style={{
                  scrollSnapType: 'x mandatory',
                  scrollBehavior: 'smooth',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {/* padding sentinels for snap */}
                <div className="shrink-0 w-1" />
                {allForecast.map((day, idx) => (
                  <ForecastCard
                    key={day.date}
                    day={day}
                    todayStr={todayStr}
                    maxPrecip={maxPrecip}
                    index={idx}
                    isSelected={false}
                  />
                ))}
                <div className="shrink-0 w-1" />
              </div>
            </div>
          )}

          {/* ═══════════════ AGRO ALERTS ═══════════════ */}
          {agroAlerts.length > 0 && (
            <div className="space-y-2">
              <p className="text-white/35 text-xs font-semibold uppercase tracking-wider px-1">
                ⚡ Alertes agronomiques
              </p>
              {agroAlerts.map((alert, i) => {
                const cfg = ALERT_CONFIG[alert.level]
                const Icon = alert.icon
                return (
                  <div
                    key={i}
                    className={`rounded-xl border p-3 flex items-start gap-3 ${cfg.color}`}
                    style={{
                      animation: 'meteo-fade-up 0.4s ease both',
                      animationDelay: `${i * 80}ms`,
                    }}
                  >
                    <Icon className="h-4 w-4 shrink-0 mt-0.5" />
                    <p className="text-[13px] font-medium leading-snug">{alert.text}</p>
                  </div>
                )
              })}
            </div>
          )}

          {/* ═══════════════ HISTORY (collapsible) ═══════════════ */}
          {historyRows.length > 0 && (
            <div className="rounded-2xl bg-white/5 border border-white/8 overflow-hidden">
              <button
                onClick={() => setShowHistory(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-white/5 transition-colors"
              >
                <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">
                  Historique récent ({historyRows.length} jours)
                </span>
                <ChevronDown
                  className="h-4 w-4 text-white/30 transition-transform duration-300"
                  style={{ transform: showHistory ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
              {showHistory && (
                <div className="border-t border-white/8 px-4 pb-3 pt-2 space-y-0"
                  style={{ animation: 'meteo-fade-up 0.3s ease both' }}
                >
                  {historyRows.map(day => {
                    const info = getWeatherInfo(day.precipitation_mm, day.temperature_max, day.wind_speed_ms)
                    return (
                      <div key={day.date} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                        <span className="text-lg w-7 text-center shrink-0">{info.emoji}</span>
                        <p className="text-white/50 text-xs w-24 shrink-0 capitalize">{dayLabel(day.date, todayStr)}</p>
                        <div className="flex-1 flex items-center gap-2">
                          <span className="text-xs text-red-400/70">↑{day.temperature_max != null ? Math.round(day.temperature_max) : '—'}°</span>
                          <span className="text-xs text-blue-400/70">↓{day.temperature_min != null ? Math.round(day.temperature_min) : '—'}°</span>
                        </div>
                        <span className="text-xs text-blue-300/60 shrink-0 font-mono">
                          {(day.precipitation_mm ?? 0) > 0 ? `${(day.precipitation_mm ?? 0).toFixed(1)}mm` : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ AgriSmart CTA ═══════════════ */}
          {onOpenAgriSmart && (
            <button
              onClick={onOpenAgriSmart}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-blue-500/25 bg-blue-500/8 text-blue-300 text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              <Waves className="h-4 w-4" />
              Calculer mes besoins en eau
            </button>
          )}

          {/* ═══════════════ FOOTER ═══════════════ */}
          <div className="flex items-center justify-between px-1">
            <p className="text-white/20 text-[11px]">Open-Meteo · NASA POWER · FAO-56</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${isLive ? 'bg-green-500/10 border-green-500/25 text-green-400/80' : 'bg-slate-500/10 border-slate-500/25 text-slate-400/80'}`}>
              {isLive ? '🟢 Temps réel' : '📦 Cache'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
