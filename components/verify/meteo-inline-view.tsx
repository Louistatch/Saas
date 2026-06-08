'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, CloudRain, Droplets, Wind, Waves, ChevronDown, Leaf } from 'lucide-react'

/* ─── Types ─────────────────────────────────────────────────────── */

interface WeatherDay {
  date: string
  temperature_max: number | null
  temperature_min: number | null
  temperature_mean: number | null
  precipitation_mm: number | null
  precipitation_probability?: number | null
  humidity_pct: number | null
  wind_speed_ms: number | null
  et0_mm: number | null
  region: string | null
}

interface WeatherHour {
  time: string
  temperature: number
  apparent_temperature: number
  precipitation_probability: number
  weather_code: number
  wind_speed_ms: number
  humidity_pct: number
  uv_index: number
  is_day: number
}

interface WeatherMinutely15 {
  time: string
  precipitation: number
  rain: number
  weather_code: number
  temperature: number
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
  hourly?: WeatherHour[]
  nowcast?: WeatherMinutely15[]
  region?: string | null
  city?: string | null
  data_source?: string
  agro_insights?: AgroInsights
  updated_at?: string
}

interface Props {
  cardNumber: string
  onBack: () => void
  onOpenAgriSmart?: () => void
}

/* ─── WMO Code Mapping ──────────────────────────────────────────── */

interface WMOInfo { emoji: string; label: string; gradient: string; night: string }

const WMO: Record<number, WMOInfo> = {
  0:  { emoji: '☀️',  label: 'Ciel dégagé',          gradient: 'linear-gradient(145deg,#f59e0b,#ea580c,#c2410c)', night: 'linear-gradient(145deg,#0f172a,#1e1b4b,#0f172a)' },
  1:  { emoji: '🌤️', label: 'Principalement dégagé', gradient: 'linear-gradient(145deg,#38bdf8,#0284c7,#1d4ed8)', night: 'linear-gradient(145deg,#0f172a,#1e3a5f,#0f172a)' },
  2:  { emoji: '⛅',  label: 'Partiellement nuageux', gradient: 'linear-gradient(145deg,#64748b,#475569,#334155)', night: 'linear-gradient(145deg,#1e293b,#0f172a,#020617)' },
  3:  { emoji: '☁️',  label: 'Nuageux',               gradient: 'linear-gradient(145deg,#475569,#334155,#1e293b)', night: 'linear-gradient(145deg,#1e293b,#0f172a,#020617)' },
  45: { emoji: '🌫️', label: 'Brouillard',             gradient: 'linear-gradient(145deg,#94a3b8,#64748b,#475569)', night: 'linear-gradient(145deg,#334155,#1e293b,#0f172a)' },
  48: { emoji: '🌫️', label: 'Brouillard givrant',     gradient: 'linear-gradient(145deg,#94a3b8,#64748b,#475569)', night: 'linear-gradient(145deg,#334155,#1e293b,#0f172a)' },
  51: { emoji: '🌦️', label: 'Bruine légère',          gradient: 'linear-gradient(145deg,#64748b,#3b82f6,#1e40af)', night: 'linear-gradient(145deg,#1e293b,#1e3a5f,#0f172a)' },
  53: { emoji: '🌦️', label: 'Bruine',                 gradient: 'linear-gradient(145deg,#475569,#2563eb,#1d4ed8)', night: 'linear-gradient(145deg,#1e293b,#1e3a5f,#0f172a)' },
  55: { emoji: '🌧️', label: 'Bruine forte',           gradient: 'linear-gradient(145deg,#334155,#1d4ed8,#1e40af)', night: 'linear-gradient(145deg,#0f172a,#1e1b4b,#020617)' },
  61: { emoji: '🌧️', label: 'Pluie légère',           gradient: 'linear-gradient(145deg,#475569,#2563eb,#1d4ed8)', night: 'linear-gradient(145deg,#1e293b,#1e3a5f,#0f172a)' },
  63: { emoji: '🌧️', label: 'Pluie modérée',          gradient: 'linear-gradient(145deg,#334155,#1d4ed8,#1e40af)', night: 'linear-gradient(145deg,#0f172a,#1e3a5f,#020617)' },
  65: { emoji: '🌧️', label: 'Pluie forte',            gradient: 'linear-gradient(145deg,#1e293b,#1d4ed8,#1e1b4b)', night: 'linear-gradient(145deg,#020617,#1e1b4b,#020617)' },
  71: { emoji: '🌨️', label: 'Neige légère',           gradient: 'linear-gradient(145deg,#bfdbfe,#93c5fd,#60a5fa)', night: 'linear-gradient(145deg,#1e3a5f,#1e293b,#0f172a)' },
  73: { emoji: '🌨️', label: 'Neige',                  gradient: 'linear-gradient(145deg,#dbeafe,#bfdbfe,#93c5fd)', night: 'linear-gradient(145deg,#1e3a5f,#1e293b,#0f172a)' },
  75: { emoji: '❄️',  label: 'Neige forte',            gradient: 'linear-gradient(145deg,#e0f2fe,#dbeafe,#bfdbfe)', night: 'linear-gradient(145deg,#1e3a5f,#0f172a,#020617)' },
  80: { emoji: '🌦️', label: 'Averses légères',        gradient: 'linear-gradient(145deg,#64748b,#3b82f6,#2563eb)', night: 'linear-gradient(145deg,#1e293b,#1e3a5f,#0f172a)' },
  81: { emoji: '🌦️', label: 'Averses',                gradient: 'linear-gradient(145deg,#475569,#2563eb,#1d4ed8)', night: 'linear-gradient(145deg,#1e293b,#1e3a5f,#020617)' },
  82: { emoji: '🌧️', label: 'Averses fortes',         gradient: 'linear-gradient(145deg,#334155,#1d4ed8,#1e40af)', night: 'linear-gradient(145deg,#0f172a,#1e1b4b,#020617)' },
  95: { emoji: '⛈️', label: 'Orage',                  gradient: 'linear-gradient(145deg,#1e293b,#374151,#111827)', night: 'linear-gradient(145deg,#020617,#111827,#030712)' },
  96: { emoji: '⛈️', label: 'Orage avec grêle',       gradient: 'linear-gradient(145deg,#111827,#1f2937,#030712)', night: 'linear-gradient(145deg,#020617,#030712,#000)' },
  99: { emoji: '⛈️', label: 'Orage violent',          gradient: 'linear-gradient(145deg,#030712,#111827,#020617)', night: 'linear-gradient(145deg,#020617,#030712,#000)' },
}

function getWMO(code: number, isDay = 1): WMOInfo {
  const codes = Object.keys(WMO).map(Number)
  const nearest = codes.reduce((p, c) => (Math.abs(c - code) < Math.abs(p - code) ? c : p))
  const info = WMO[nearest]
  return isDay ? info : { ...info, gradient: info.night }
}

function uvMeta(uv: number): { text: string; color: string } {
  if (uv >= 11) return { text: 'Extrême', color: '#a855f7' }
  if (uv >= 8)  return { text: 'Très élevé', color: '#ef4444' }
  if (uv >= 6)  return { text: 'Élevé', color: '#f97316' }
  if (uv >= 3)  return { text: 'Modéré', color: '#eab308' }
  return { text: 'Faible', color: '#22c55e' }
}

/* ─── Helpers ───────────────────────────────────────────────────── */

function localDateStr() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
}

function lagosHourStr() {
  return new Date(Date.now() + 3600000).toISOString().slice(0, 13)
}

function dailyEmoji(p: number|null, t: number|null, w: number|null): string {
  const pr = p ?? 0, temp = t ?? 28, wind = w ?? 0
  if (pr > 20 || (pr > 10 && wind > 6)) return '⛈️'
  if (pr > 8) return '🌧️'
  if (pr > 2) return '🌦️'
  if (pr > 0) return '🌤️'
  if (temp > 33) return '🌞'
  return '☀️'
}

function hourLabel(time: string, nowHour: string) {
  return time.slice(0,13) === nowHour ? 'Maint.' : `${parseInt(time.slice(11,13))}h`
}

function dayShort(dateStr: string, todayStr: string) {
  const diff = Math.round(
    (new Date(dateStr + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000
  )
  if (diff === 0) return "Auj."
  if (diff === 1) return 'Demain'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short' })
}

function dayFull(dateStr: string, todayStr: string) {
  const diff = Math.round(
    (new Date(dateStr + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000
  )
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return 'Demain'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })
}

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

/* ─── Nowcast banner ────────────────────────────────────────────── */

const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 71, 73, 75, 80, 81, 82, 95, 96, 99])

interface NowcastBanner {
  type: 'raining' | 'rain_soon' | 'clearing'
  text: string
  minutes: number
  slots60: { hasRain: boolean; mm: number }[]
}

function buildNowcastBanner(nowcast: WeatherMinutely15[]): NowcastBanner | null {
  if (!nowcast.length) return null

  const now = Date.now()

  const enriched = nowcast.map(s => {
    // Times are in Africa/Lagos (UTC+1) — parse with offset
    const slotMs = new Date(s.time + ':00+01:00').getTime()
    const minutesFromNow = Math.round((slotMs - now) / 60000)
    const hasRain = s.precipitation > 0.05 || RAIN_CODES.has(s.weather_code)
    return { ...s, minutesFromNow, hasRain }
  })

  // Current slot = the one whose window includes now (starts up to 15 min ago)
  const current = enriched.find(s => s.minutesFromNow >= -15 && s.minutesFromNow < 15) ?? enriched[0]
  const future = enriched.filter(s => s.minutesFromNow >= 0)
  const slots60 = future.slice(0, 4).map(s => ({ hasRain: s.hasRain, mm: s.precipitation }))

  const isCurrentlyRaining = current && current.minutesFromNow < 15 && current.hasRain

  if (isCurrentlyRaining) {
    const stopIdx = future.findIndex(s => !s.hasRain)
    const mm = current.precipitation
    const intensity = mm > 5 ? 'forte' : mm > 1 ? 'modérée' : 'légère'
    if (stopIdx > 0 && stopIdx <= 8) {
      const stopIn = future[stopIdx].minutesFromNow
      return { type: 'clearing', minutes: stopIn, text: `Pluie ${intensity} · éclaircie dans ~${stopIn} min`, slots60 }
    }
    return { type: 'raining', minutes: 0, text: `Pluie ${intensity} en cours`, slots60 }
  }

  const rainSlot = future.find(s => s.minutesFromNow <= 60 && s.hasRain)
  if (!rainSlot) return null

  const mm = rainSlot.precipitation
  const intensity = mm > 5 ? 'forte' : mm > 1 ? 'modérée' : 'légère'
  const mins = Math.max(rainSlot.minutesFromNow, 5)
  return { type: 'rain_soon', minutes: mins, text: `Pluie ${intensity} dans ~${mins} min`, slots60 }
}

/* ─── Agro alerts ───────────────────────────────────────────────── */

type AlertLevel = 'critical' | 'high' | 'moderate' | 'low'
interface AgroAlert { level: AlertLevel; emoji: string; text: string }

const ALERT_COLORS: Record<AlertLevel, string> = {
  critical: 'bg-red-500/15 border-red-500/30 text-red-300',
  high:     'bg-orange-500/15 border-orange-500/30 text-orange-300',
  moderate: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300',
  low:      'bg-green-500/15 border-green-500/30 text-green-300',
}

function buildAlerts(insights: AgroInsights|undefined, today: WeatherDay|null, upcoming: WeatherDay[]): AgroAlert[] {
  const alerts: AgroAlert[] = []
  if (!today) return alerts
  if (insights) {
    if (insights.drought_risk === 'critical') alerts.push({ level: 'critical', emoji: '🔴', text: 'Sécheresse critique — Irriguer immédiatement' })
    else if (insights.drought_risk === 'high') alerts.push({ level: 'high', emoji: '🟠', text: 'Risque élevé de sécheresse — Irriguer sous 48h' })
    else if (insights.drought_risk === 'moderate') alerts.push({ level: 'moderate', emoji: '🟡', text: "Risque modéré de sécheresse — Surveiller l'humidité" })
    if (insights.spray_window) alerts.push({ level: 'low', emoji: '✅', text: `Fenêtre traitement : ${insights.spray_window} · Vent favorable` })
    if (insights.planting_window) alerts.push({ level: 'low', emoji: '🌱', text: 'Semis favorable les prochains jours' })
    if ((insights.heat_stress_days ?? 0) > 2) alerts.push({ level: 'high', emoji: '🌡️', text: `Stress thermique ${insights.heat_stress_days} jours · Protégez vos plants` })
  } else {
    if ((today.et0_mm ?? 0) >= 5) alerts.push({ level: 'high', emoji: '🟠', text: `ETP élevée (${today.et0_mm!.toFixed(1)} mm/j) — irriguez dès aujourd'hui` })
    if ((today.temperature_max ?? 0) >= 38) alerts.push({ level: 'critical', emoji: '🔴', text: `Chaleur extrême (${Math.round(today.temperature_max!)}°C) — protégez vos plants` })
    const totalP = upcoming.reduce((s, d) => s + (d.precipitation_mm ?? 0), 0)
    if (totalP >= 50) alerts.push({ level: 'moderate', emoji: '🟡', text: `Pluies importantes prévues (${totalP.toFixed(0)} mm) — vérifiez le drainage` })
    const dryDays = upcoming.filter(d => (d.precipitation_mm ?? 0) < 1).length
    if ((today.precipitation_mm ?? 0) < 0.5 && (today.et0_mm ?? 0) > 3 && dryDays >= 4)
      alerts.push({ level: 'moderate', emoji: '🟡', text: `${dryDays} jours sans pluie prévus — planifiez l'irrigation` })
  }
  return alerts
}

/* ─── Skeleton ──────────────────────────────────────────────────── */

function SkeletonLoader() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-56 rounded-3xl bg-white/8 border border-white/5" />
      <div className="h-22 rounded-2xl bg-white/6 border border-white/5" />
      <div className="space-y-2">
        {[1,2,3,4,5].map(i => <div key={i} className="h-11 rounded-xl bg-white/5 border border-white/5" />)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1,2,3,4,5,6].map(i => <div key={i} className="h-16 rounded-xl bg-white/5 border border-white/5" />)}
      </div>
    </div>
  )
}

/* ─── Main component ────────────────────────────────────────────── */

export function MeteoInlineView({ cardNumber, onBack, onOpenAgriSmart }: Props) {
  const [weather, setWeather]         = useState<WeatherDay[]>([])
  const [hourly, setHourly]           = useState<WeatherHour[]>([])
  const [nowcast, setNowcast]         = useState<WeatherMinutely15[]>([])
  const [region, setRegion]           = useState<string|null>(null)
  const [city, setCity]               = useState<string|null>(null)
  const [dataSource, setDataSource]   = useState<string>('live')
  const [agroInsights, setAgroInsights] = useState<AgroInsights|undefined>()
  const [updatedAt, setUpdatedAt]     = useState<string|null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showAlerts, setShowAlerts]   = useState(true)

  const doFetch = () => {
    setError(false); setLoading(true)
    fetch(`/api/verify/${encodeURIComponent(cardNumber)}/meteo`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: ApiResponse) => {
        setWeather(d.weather ?? [])
        setHourly(d.hourly ?? [])
        setNowcast(d.nowcast ?? [])
        setRegion(d.region ?? null)
        setCity(d.city ?? null)
        setDataSource(d.data_source ?? 'live')
        setAgroInsights(d.agro_insights)
        setUpdatedAt(d.updated_at ?? null)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { doFetch() }, [cardNumber])

  const todayStr   = localDateStr()
  const nowHour    = lagosHourStr()

  const todayRow   = weather.find(d => d.date === todayStr) ?? null
  const pastRows   = weather.filter(d => d.date < todayStr)
  const futureRows = weather.filter(d => d.date >= todayStr)

  // Current hourly slot: first slot at or after current hour
  const curSlot = hourly.find(h => h.time.slice(0,13) >= nowHour) ?? hourly[0] ?? null

  // Hourly strip: from current hour, next 24 slots
  const hourlyStrip = hourly.filter(h => h.time.slice(0,13) >= nowHour).slice(0, 24)

  // Hero
  const heroWMO   = curSlot ? getWMO(curSlot.weather_code, curSlot.is_day) : null
  const heroEmoji = heroWMO?.emoji ?? dailyEmoji(todayRow?.precipitation_mm ?? null, todayRow?.temperature_max ?? null, todayRow?.wind_speed_ms ?? null)
  const heroLabel = heroWMO?.label ?? 'Météo du jour'
  const heroGrad  = heroWMO?.gradient ?? 'linear-gradient(145deg,#f59e0b,#ea580c,#c2410c)'

  const currentTemp = curSlot?.temperature ?? todayRow?.temperature_mean ?? todayRow?.temperature_max ?? null
  const feelsLike   = curSlot?.apparent_temperature ?? null
  const uvIndex     = curSlot?.uv_index ?? null
  const uvInfo      = uvIndex != null ? uvMeta(uvIndex) : null

  // 7-day range for bar scaling
  const allTMax = futureRows.map(d => d.temperature_max ?? 0)
  const allTMin = futureRows.map(d => d.temperature_min ?? 99)
  const scaleMax = Math.max(...allTMax, 0)
  const scaleMin = Math.min(...allTMin, scaleMax - 1)
  const scaleRange = scaleMax - scaleMin || 1

  const nowcastBanner = buildNowcastBanner(nowcast)
  const agroAlerts  = buildAlerts(agroInsights, todayRow, futureRows.slice(1))
  const historyRows = [...pastRows].reverse().slice(0, 3)
  const isLive      = dataSource === 'live' || !dataSource || dataSource === ''
  const hasData     = !loading && !error && weather.length > 0 && todayRow != null

  return (
    <div className="space-y-3 max-w-md mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sky-400 text-sm font-medium active:opacity-70 transition-opacity">
          <ArrowLeft className="h-4 w-4" />
          Météo Agricole
        </button>
        <span className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${isLive ? 'bg-green-500/15 border-green-500/30 text-green-300' : 'bg-slate-500/15 border-slate-500/30 text-slate-300'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-green-400 animate-pulse' : 'bg-slate-400'}`} />
          {isLive ? 'Live' : 'Mis en cache'}
        </span>
      </div>

      {/* ── Loading ── */}
      {loading && <SkeletonLoader />}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center space-y-3">
          <CloudRain className="h-8 w-8 text-white/20 mx-auto" />
          <p className="text-white/50 text-sm">Données météo indisponibles.</p>
          <button onClick={doFetch} className="text-sky-400 text-sm font-semibold underline">Réessayer</button>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && weather.length === 0 && (
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center">
          <CloudRain className="h-8 w-8 text-white/20 mx-auto mb-2" />
          <p className="text-white/50 text-sm">Aucune donnée météo pour votre région.</p>
        </div>
      )}

      {/* ══════════════════════════ MAIN CONTENT ══════════════════════════ */}
      {hasData && todayRow && (
        <>
          {/* ═══ HERO + HOURLY (single card, Bing-style) ═══════════════════ */}
          <div className="relative rounded-3xl overflow-hidden" style={{ background: heroGrad }}>
            <div className="absolute inset-0 bg-black/30" />

            {/* Current conditions */}
            <div className="relative p-5 pb-4">

              {/* City + weather label + time */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white/90 text-base font-bold">{city ?? region ?? 'Togo'}</p>
                  <p className="text-white/55 text-xs mt-0.5">{heroLabel}</p>
                </div>
                {updatedAt && <p className="text-white/30 text-[10px] mt-0.5">{fmtTime(updatedAt)}</p>}
              </div>

              {/* Main temperature + emoji */}
              <div className="flex items-center justify-between mt-4">
                <div>
                  <div className="flex items-end gap-1">
                    <span className="text-white font-black" style={{ fontSize: '5rem', lineHeight: 1 }}>
                      {currentTemp != null ? Math.round(currentTemp) : '—'}°
                    </span>
                  </div>
                  {feelsLike != null && (
                    <p className="text-white/60 text-sm mt-1">
                      Ressenti <span className="font-semibold text-white/80">{Math.round(feelsLike)}°</span>
                    </p>
                  )}
                  <p className="text-white/40 text-xs mt-0.5">
                    ↑{todayRow.temperature_max != null ? Math.round(todayRow.temperature_max) : '—'}°&nbsp;
                    ↓{todayRow.temperature_min != null ? Math.round(todayRow.temperature_min) : '—'}°
                  </p>
                </div>
                <span
                  style={{ fontSize: '5rem', lineHeight: 1, filter: 'drop-shadow(0 6px 16px rgba(0,0,0,.5))' }}
                  aria-hidden
                >
                  {heroEmoji}
                </span>
              </div>

              {/* Quick-stats bar */}
              <div className="flex items-center gap-4 mt-5 pt-3 border-t border-white/15 flex-wrap">
                <span className="flex items-center gap-1 text-white/70 text-xs">
                  <Droplets className="h-3.5 w-3.5 text-blue-300 shrink-0" />
                  {curSlot?.precipitation_probability != null
                    ? `${Math.round(curSlot.precipitation_probability)}% précip.`
                    : `${(todayRow.precipitation_mm ?? 0).toFixed(1)} mm`}
                </span>
                <span className="flex items-center gap-1 text-white/70 text-xs">
                  <Wind className="h-3.5 w-3.5 text-teal-300 shrink-0" />
                  {todayRow.wind_speed_ms != null ? `${todayRow.wind_speed_ms.toFixed(1)} m/s` : '—'}
                </span>
                <span className="flex items-center gap-1 text-white/70 text-xs">
                  <Droplets className="h-3.5 w-3.5 text-sky-300 shrink-0" />
                  {todayRow.humidity_pct != null ? `${Math.round(todayRow.humidity_pct)}%` : '—'}
                </span>
                {uvIndex != null && (
                  <span className="text-xs font-bold" style={{ color: uvInfo!.color }}>
                    UV {Math.round(uvIndex)} · {uvInfo!.text}
                  </span>
                )}
              </div>
            </div>

            {/* ── Hourly strip ── */}
            {hourlyStrip.length > 0 && (
              <div className="border-t border-white/20 relative">
                <div
                  className="flex overflow-x-auto"
                  style={{
                    scrollSnapType: 'x mandatory',
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                  }}
                >
                  {hourlyStrip.map((slot) => {
                    const isNow = slot.time.slice(0,13) === nowHour
                    const wmo   = getWMO(slot.weather_code, slot.is_day)
                    return (
                      <div
                        key={slot.time}
                        className={`snap-center shrink-0 flex flex-col items-center gap-0.5 px-4 py-3 transition-colors ${isNow ? 'bg-white/20' : ''}`}
                        style={{ minWidth: 60 }}
                      >
                        <span className={`text-[11px] font-semibold ${isNow ? 'text-white' : 'text-white/55'}`}>
                          {hourLabel(slot.time, nowHour)}
                        </span>
                        <span className="text-xl leading-none my-0.5" aria-hidden>{wmo.emoji}</span>
                        <span className={`text-[10px] font-medium ${slot.precipitation_probability > 5 ? 'text-blue-300' : 'text-transparent'}`}>
                          {slot.precipitation_probability > 5 ? `${Math.round(slot.precipitation_probability)}%` : '·'}
                        </span>
                        <span className={`text-xs font-bold ${isNow ? 'text-white' : 'text-white/80'}`}>
                          {Math.round(slot.temperature)}°
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ═══ NOWCAST BANNER ════════════════════════════════════════════ */}
          {nowcastBanner && (
            <div
              className="rounded-2xl overflow-hidden border border-blue-400/30"
              style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.18) 0%, rgba(79,70,229,0.18) 100%)' }}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <span
                  className="text-2xl shrink-0"
                  style={{ animation: nowcastBanner.type === 'raining' ? 'bounce 1s infinite' : 'none' }}
                  aria-hidden
                >
                  {nowcastBanner.type === 'clearing' ? '🌤️' : '🌧️'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-blue-100 font-bold text-sm leading-tight">{nowcastBanner.text}</p>
                  <p className="text-blue-300/55 text-[10px] mt-0.5">Nowcasting · Open-Meteo · 15 min</p>
                </div>
                {nowcastBanner.type === 'rain_soon' && (
                  <div className="shrink-0 text-right">
                    <p className="text-blue-200 font-mono font-black text-xl leading-none">{nowcastBanner.minutes}</p>
                    <p className="text-blue-400/60 text-[9px] mt-0.5">min</p>
                  </div>
                )}
              </div>
              {/* 60-min timeline — 4 slots of 15 min */}
              {nowcastBanner.slots60.length > 0 && (
                <div className="px-4 pb-3">
                  <div className="flex gap-1.5">
                    {nowcastBanner.slots60.map((slot, i) => (
                      <div
                        key={i}
                        className={`flex-1 h-2 rounded-full transition-all ${slot.hasRain ? 'bg-blue-400' : 'bg-white/15'}`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[9px] text-blue-400/45 mt-1">
                    <span>Maint.</span>
                    {nowcastBanner.slots60.length > 2 && <span>+{Math.round(nowcastBanner.slots60.length / 2 * 15)} min</span>}
                    <span>+{nowcastBanner.slots60.length * 15} min</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ 7-DAY FORECAST (vertical list) ═══════════════════════════ */}
          {futureRows.length > 0 && (
            <div className="rounded-2xl bg-white/5 border border-white/8 overflow-hidden">
              <p className="text-white/35 text-[10px] font-semibold uppercase tracking-wider px-4 pt-3 pb-1.5">
                Prévisions {futureRows.length} jours
              </p>
              {futureRows.map((day) => {
                const emoji    = dailyEmoji(day.precipitation_mm, day.temperature_max, day.wind_speed_ms)
                const isToday  = day.date === todayStr
                const barL     = ((day.temperature_min ?? scaleMin) - scaleMin) / scaleRange
                const barW     = ((day.temperature_max ?? scaleMax) - (day.temperature_min ?? scaleMin)) / scaleRange
                const precipPct = day.precipitation_probability != null ? Math.round(day.precipitation_probability) : null

                return (
                  <div
                    key={day.date}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0 ${isToday ? 'bg-white/5' : ''}`}
                  >
                    <span className={`text-[13px] font-semibold shrink-0 w-14 ${isToday ? 'text-sky-300' : 'text-white/65'}`}>
                      {dayShort(day.date, todayStr)}
                    </span>
                    <span className="text-xl shrink-0" aria-hidden>{emoji}</span>
                    <span className="text-[10px] text-blue-300/65 font-mono shrink-0 w-9 text-right">
                      {precipPct != null
                        ? `${precipPct}%`
                        : (day.precipitation_mm ?? 0) > 0
                          ? `${day.precipitation_mm!.toFixed(0)}mm`
                          : ''}
                    </span>
                    <span className="text-[11px] text-blue-400/55 shrink-0 w-6 text-right">
                      {day.temperature_min != null ? Math.round(day.temperature_min) : '—'}°
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 relative overflow-hidden">
                      <div
                        className="absolute h-full rounded-full"
                        style={{
                          left: `${barL * 100}%`,
                          width: `${Math.max(barW * 100, 6)}%`,
                          background: 'linear-gradient(90deg,#60a5fa,#f97316)',
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-orange-400/70 shrink-0 w-6">
                      {day.temperature_max != null ? Math.round(day.temperature_max) : '—'}°
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* ═══ DETAILS GRID (2×3, Bing-style tiles) ══════════════════════ */}
          <div className="grid grid-cols-3 gap-2">
            {/* Ressenti */}
            <div className="rounded-2xl bg-white/5 border border-white/8 p-3 flex flex-col gap-0.5">
              <p className="text-white/35 text-[9px] uppercase tracking-wide font-semibold">Ressenti</p>
              <p className="text-white font-bold text-xl leading-none mt-0.5">
                {feelsLike != null ? `${Math.round(feelsLike)}°` : '—'}
              </p>
              <p className="text-white/25 text-[9px]">°Celsius</p>
            </div>

            {/* UV Index */}
            <div className="rounded-2xl bg-white/5 border border-white/8 p-3 flex flex-col gap-0.5">
              <p className="text-white/35 text-[9px] uppercase tracking-wide font-semibold">Indice UV</p>
              <p className="font-bold text-xl leading-none mt-0.5" style={{ color: uvInfo?.color ?? 'white' }}>
                {uvIndex != null ? Math.round(uvIndex) : '—'}
              </p>
              <p className="text-[9px] font-semibold" style={{ color: uvInfo ? uvInfo.color + '99' : 'rgba(255,255,255,.25)' }}>
                {uvInfo?.text ?? '—'}
              </p>
            </div>

            {/* Humidité */}
            <div className="rounded-2xl bg-white/5 border border-white/8 p-3 flex flex-col gap-0.5">
              <p className="text-white/35 text-[9px] uppercase tracking-wide font-semibold">Humidité</p>
              <p className="text-white font-bold text-xl leading-none mt-0.5">
                {todayRow.humidity_pct != null ? `${Math.round(todayRow.humidity_pct)}%` : '—'}
              </p>
              <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden mt-1">
                <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${todayRow.humidity_pct ?? 0}%` }} />
              </div>
            </div>

            {/* Vent */}
            <div className="rounded-2xl bg-white/5 border border-white/8 p-3 flex flex-col gap-0.5">
              <p className="text-white/35 text-[9px] uppercase tracking-wide font-semibold">Vent</p>
              <p className="text-white font-bold text-xl leading-none mt-0.5">
                {todayRow.wind_speed_ms != null ? todayRow.wind_speed_ms.toFixed(1) : '—'}
              </p>
              <p className="text-white/25 text-[9px]">m/s</p>
            </div>

            {/* ETo FAO */}
            <div className="rounded-2xl bg-white/5 border border-white/8 p-3 flex flex-col gap-0.5">
              <p className="text-white/35 text-[9px] uppercase tracking-wide font-semibold">ETo FAO</p>
              <p className="text-emerald-300 font-bold text-xl leading-none mt-0.5">
                {todayRow.et0_mm != null ? todayRow.et0_mm.toFixed(1) : '—'}
              </p>
              <p className="text-white/25 text-[9px]">mm/jour</p>
            </div>

            {/* Pluie */}
            <div className="rounded-2xl bg-white/5 border border-white/8 p-3 flex flex-col gap-0.5">
              <p className="text-white/35 text-[9px] uppercase tracking-wide font-semibold">Pluie</p>
              <p className="text-blue-300 font-bold text-xl leading-none mt-0.5">
                {todayRow.precipitation_mm != null ? todayRow.precipitation_mm.toFixed(1) : '—'}
              </p>
              <p className="text-white/25 text-[9px]">mm aujourd'hui</p>
            </div>
          </div>

          {/* ═══ AGRO ALERTS ═══════════════════════════════════════════════ */}
          {agroAlerts.length > 0 && (
            <div className="rounded-2xl bg-white/5 border border-white/8 overflow-hidden">
              <button
                onClick={() => setShowAlerts(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 active:bg-white/5 transition-colors"
              >
                <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">
                  ⚡ Alertes agronomiques ({agroAlerts.length})
                </span>
                <ChevronDown
                  className="h-4 w-4 text-white/30 transition-transform duration-300"
                  style={{ transform: showAlerts ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
              {showAlerts && (
                <div className="border-t border-white/8 px-4 pb-3 pt-2 space-y-2">
                  {agroAlerts.map((alert, i) => (
                    <div key={i} className={`rounded-xl border p-3 flex items-start gap-2.5 ${ALERT_COLORS[alert.level]}`}>
                      <span className="text-base leading-none shrink-0 mt-0.5">{alert.emoji}</span>
                      <p className="text-[12px] font-medium leading-snug">{alert.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ HISTORY ════════════════════════════════════════════════════ */}
          {historyRows.length > 0 && (
            <div className="rounded-2xl bg-white/5 border border-white/8 overflow-hidden">
              <button
                onClick={() => setShowHistory(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 active:bg-white/5 transition-colors"
              >
                <span className="text-white/35 text-xs font-semibold uppercase tracking-wider">
                  Historique ({historyRows.length} jours)
                </span>
                <ChevronDown
                  className="h-4 w-4 text-white/25 transition-transform duration-300"
                  style={{ transform: showHistory ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
              {showHistory && (
                <div className="border-t border-white/8 px-4 pb-3 pt-2">
                  {historyRows.map(day => {
                    const emoji = dailyEmoji(day.precipitation_mm, day.temperature_max, day.wind_speed_ms)
                    return (
                      <div key={day.date} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                        <span className="text-lg w-7 text-center shrink-0" aria-hidden>{emoji}</span>
                        <p className="text-white/40 text-xs w-28 shrink-0 capitalize">{dayFull(day.date, todayStr)}</p>
                        <span className="text-xs text-orange-400/55">↑{day.temperature_max != null ? Math.round(day.temperature_max) : '—'}°</span>
                        <span className="text-xs text-blue-400/55 ml-1">↓{day.temperature_min != null ? Math.round(day.temperature_min) : '—'}°</span>
                        <span className="ml-auto text-xs text-blue-300/45 font-mono">
                          {(day.precipitation_mm ?? 0) > 0 ? `${day.precipitation_mm!.toFixed(1)}mm` : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ AgriSmart CTA ══════════════════════════════════════════════ */}
          {onOpenAgriSmart && (
            <button
              onClick={onOpenAgriSmart}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-blue-500/25 bg-blue-500/8 text-blue-300 text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              <Waves className="h-4 w-4" />
              Calculer mes besoins en eau
            </button>
          )}

          {/* ═══ Footer ═════════════════════════════════════════════════════ */}
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-white/20 text-[10px]">Open-Meteo · FAO-56 · WMO</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${isLive ? 'bg-green-500/10 border-green-500/20 text-green-400/65' : 'bg-slate-500/10 border-slate-500/20 text-slate-400/65'}`}>
              {isLive ? '🟢 Temps réel' : '📦 Cache'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
