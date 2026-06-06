'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, CloudRain, Droplets, Wind, Thermometer, Sun } from 'lucide-react'

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

interface Props {
  cardNumber: string
  onBack: () => void
}

function getRainIcon(mm: number | null) {
  if (!mm || mm < 1) return '☀️'
  if (mm < 5) return '🌦️'
  if (mm < 20) return '🌧️'
  return '⛈️'
}

function localDateStr() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dayLabel(dateStr: string, todayStr: string): string {
  const diff = Math.round(
    (new Date(dateStr + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime())
    / 86400000
  )
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return 'Demain'
  if (diff === -1) return 'Hier'
  if (diff === -2) return 'Avant-hier'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })
}

function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

interface Alert { icon: string; text: string; color: string }

function computeAlerts(todayRow: WeatherDay, upcoming: WeatherDay[]): Alert[] {
  const alerts: Alert[] = []
  if (todayRow.et0_mm != null && todayRow.et0_mm >= 5) {
    alerts.push({ icon: '🚿', text: `ETP élevée (${todayRow.et0_mm.toFixed(1)} mm/j) — irriguez vos cultures dès aujourd'hui`, color: 'border-amber-500/30 bg-amber-500/8 text-amber-300' })
  }
  const totalPrecip = upcoming.reduce((s, d) => s + (d.precipitation_mm ?? 0), 0)
  if (totalPrecip >= 50) {
    alerts.push({ icon: '🌧️', text: `Pluies importantes prévues (${totalPrecip.toFixed(0)} mm cumulés) — vérifiez le drainage`, color: 'border-blue-500/30 bg-blue-500/8 text-blue-300' })
  }
  if (todayRow.temperature_max != null && todayRow.temperature_max >= 38) {
    alerts.push({ icon: '🌡️', text: `Chaleur extrême (${Math.round(todayRow.temperature_max)}°C) — protégez vos plants`, color: 'border-red-500/30 bg-red-500/8 text-red-300' })
  }
  if (todayRow.wind_speed_ms != null && todayRow.wind_speed_ms >= 8) {
    alerts.push({ icon: '💨', text: `Vent fort (${todayRow.wind_speed_ms.toFixed(1)} m/s) — risque de verse sur les cultures hautes`, color: 'border-teal-500/30 bg-teal-500/8 text-teal-300' })
  }
  const dryDays = upcoming.filter(d => (d.precipitation_mm ?? 0) < 1).length
  if (todayRow.precipitation_mm != null && todayRow.precipitation_mm < 0.5 && (todayRow.et0_mm ?? 0) > 3 && dryDays >= 4) {
    alerts.push({ icon: '☀️', text: `${dryDays} jours sans pluie prévus — période sèche, planifiez l'irrigation`, color: 'border-orange-500/30 bg-orange-500/8 text-orange-300' })
  }
  return alerts
}

export function MeteoInlineView({ cardNumber, onBack }: Props) {
  const [weather, setWeather] = useState<WeatherDay[]>([])
  const [region, setRegion] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/verify/${encodeURIComponent(cardNumber)}/meteo`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setWeather(d.weather ?? []); setRegion(d.region ?? null) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [cardNumber])

  const todayStr = localDateStr()

  // Split into past / today / future (data ordered ASC from API)
  const pastRows = weather.filter(d => d.date < todayStr)
  const todayRow = weather.find(d => d.date === todayStr) ?? null
  const futureRows = weather.filter(d => d.date > todayStr)

  // Highlighted row: today if available, else most recent past
  const highlightRow = todayRow ?? (pastRows.length > 0 ? pastRows[pastRows.length - 1] : null)
  const isActualToday = highlightRow?.date === todayStr

  const alerts = highlightRow ? computeAlerts(highlightRow, futureRows) : []

  return (
    <div className="space-y-4 vfp-enter">
      <button onClick={onBack} className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>

      <div className="flex items-center gap-2">
        <CloudRain className="h-5 w-5 text-sky-400" />
        <h3 className="text-white text-lg font-bold">Météo Agricole</h3>
        {region && <span className="text-xs text-white/40 font-mono ml-1">— {region}</span>}
      </div>

      {loading && (
        <div className="vfp-card rounded-2xl p-8 text-center">
          <div className="vfp-loader mx-auto" />
          <p className="text-white/40 text-sm mt-3">Chargement des données météo...</p>
        </div>
      )}

      {error && (
        <div className="vfp-card rounded-2xl p-6 text-center">
          <CloudRain className="h-8 w-8 text-white/20 mx-auto mb-2" />
          <p className="text-white/50 text-sm">Données météo indisponibles pour votre région.</p>
        </div>
      )}

      {!loading && !error && weather.length === 0 && (
        <div className="vfp-card rounded-2xl p-6 text-center">
          <CloudRain className="h-8 w-8 text-white/20 mx-auto mb-2" />
          <p className="text-white/50 text-sm">Aucune donnée météo disponible pour votre région.</p>
        </div>
      )}

      {!loading && !error && highlightRow && (
        <>
          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className={`rounded-xl border p-3 flex items-start gap-3 ${a.color}`}>
                  <span className="text-lg shrink-0 leading-none mt-0.5">{a.icon}</span>
                  <p className="text-[13px] font-medium leading-snug">{a.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Today highlight */}
          <div className="vfp-card rounded-2xl p-5 bg-gradient-to-br from-sky-500/15 to-sky-900/5 border-sky-500/15">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sky-400/70 text-xs font-semibold uppercase tracking-wider">
                  {isActualToday ? "Aujourd'hui" : dayLabel(highlightRow.date, todayStr)}
                </p>
                <p className="text-white/60 text-xs mt-0.5">{fmtDateShort(highlightRow.date)}</p>
              </div>
              <span className="text-4xl">{getRainIcon(highlightRow.precipitation_mm)}</span>
            </div>

            <div className="flex items-end gap-3 mb-4">
              <span className="text-5xl font-bold text-white">
                {highlightRow.temperature_mean != null ? Math.round(highlightRow.temperature_mean) : '—'}°
              </span>
              <div className="pb-1">
                <p className="text-xs text-red-400 font-semibold">↑ {highlightRow.temperature_max != null ? Math.round(highlightRow.temperature_max) : '—'}°</p>
                <p className="text-xs text-blue-400 font-semibold">↓ {highlightRow.temperature_min != null ? Math.round(highlightRow.temperature_min) : '—'}°</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white/5 border border-white/8 p-3 text-center">
                <Droplets className="h-4 w-4 text-blue-400 mx-auto mb-1" />
                <p className="text-white font-semibold text-sm">
                  {highlightRow.precipitation_mm != null ? highlightRow.precipitation_mm.toFixed(1) : '—'}
                  <span className="text-[10px] text-white/40 ml-0.5">mm</span>
                </p>
                <p className="text-white/40 text-[10px] mt-0.5">Pluie</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/8 p-3 text-center">
                <Wind className="h-4 w-4 text-teal-400 mx-auto mb-1" />
                <p className="text-white font-semibold text-sm">
                  {highlightRow.wind_speed_ms != null ? highlightRow.wind_speed_ms.toFixed(1) : '—'}
                  <span className="text-[10px] text-white/40 ml-0.5">m/s</span>
                </p>
                <p className="text-white/40 text-[10px] mt-0.5">Vent</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/8 p-3 text-center">
                <Thermometer className="h-4 w-4 text-amber-400 mx-auto mb-1" />
                <p className="text-white font-semibold text-sm">
                  {highlightRow.humidity_pct != null ? Math.round(highlightRow.humidity_pct) : '—'}
                  <span className="text-[10px] text-white/40 ml-0.5">%</span>
                </p>
                <p className="text-white/40 text-[10px] mt-0.5">Humidité</p>
              </div>
            </div>

            {highlightRow.et0_mm != null && (
              <div className="mt-3 rounded-xl bg-amber-500/8 border border-amber-500/15 p-3 flex items-center gap-3">
                <Sun className="h-4 w-4 text-amber-400 shrink-0" />
                <div>
                  <p className="text-amber-300 text-xs font-semibold">ETP : {highlightRow.et0_mm.toFixed(1)} mm/j</p>
                  <p className="text-white/40 text-[11px]">Évapotranspiration — besoins en eau des cultures</p>
                </div>
              </div>
            )}
          </div>

          {/* Upcoming forecast */}
          {futureRows.length > 0 && (
            <div className="vfp-card rounded-2xl p-4">
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">Prévisions</p>
              <div className="space-y-0">
                {futureRows.map(day => (
                  <div key={day.date} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                    <span className="text-lg w-7 text-center shrink-0">{getRainIcon(day.precipitation_mm)}</span>
                    <p className="text-white/70 text-xs w-32 shrink-0 capitalize">{dayLabel(day.date, todayStr)}</p>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-xs text-red-400 font-medium">↑{day.temperature_max != null ? Math.round(day.temperature_max) : '—'}°</span>
                      <span className="text-xs text-blue-400 font-medium">↓{day.temperature_min != null ? Math.round(day.temperature_min) : '—'}°</span>
                    </div>
                    <span className="text-xs text-blue-400/70 shrink-0 font-mono">
                      {day.precipitation_mm != null && day.precipitation_mm > 0
                        ? `${day.precipitation_mm.toFixed(1)}mm`
                        : <span className="text-white/20">0mm</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent history */}
          {pastRows.length > (isActualToday ? 0 : 1) && (
            <div className="vfp-card rounded-2xl p-4">
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">Historique récent</p>
              <div className="space-y-0">
                {(isActualToday ? pastRows : pastRows.slice(0, -1)).slice().reverse().map(day => (
                  <div key={day.date} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                    <span className="text-lg w-7 text-center shrink-0">{getRainIcon(day.precipitation_mm)}</span>
                    <p className="text-white/50 text-xs w-32 shrink-0 capitalize">{dayLabel(day.date, todayStr)}</p>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-xs text-red-400/70">↑{day.temperature_max != null ? Math.round(day.temperature_max) : '—'}°</span>
                      <span className="text-xs text-blue-400/70">↓{day.temperature_min != null ? Math.round(day.temperature_min) : '—'}°</span>
                    </div>
                    <span className="text-xs text-blue-400/50 shrink-0 font-mono">
                      {day.precipitation_mm != null && day.precipitation_mm > 0
                        ? `${day.precipitation_mm.toFixed(1)}mm`
                        : <span className="text-white/20">0mm</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-white/20 text-[11px]">Open-Meteo · NASA POWER · Mis à jour le {fmtDateShort(weather[weather.length - 1]?.date ?? todayStr)}</p>
        </>
      )}
    </div>
  )
}
