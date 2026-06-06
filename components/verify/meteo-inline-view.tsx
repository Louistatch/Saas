'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, CloudRain, Droplets, Wind, Thermometer, Sun, AlertTriangle, Droplets as IrrigationIcon } from 'lucide-react'

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

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

interface Alert { icon: string; text: string; color: string }

function computeAlerts(today: WeatherDay, week: WeatherDay[]): Alert[] {
  const alerts: Alert[] = []
  if (today.et0_mm != null && today.et0_mm >= 5) {
    alerts.push({ icon: '🚿', text: `ETP élevée (${today.et0_mm.toFixed(1)} mm/j) — irriguez vos cultures dès aujourd'hui`, color: 'border-amber-500/30 bg-amber-500/8 text-amber-300' })
  }
  const totalPrecip7d = week.reduce((s, d) => s + (d.precipitation_mm ?? 0), 0)
  if (totalPrecip7d >= 50) {
    alerts.push({ icon: '🌧️', text: `Pluies importantes cette semaine (${totalPrecip7d.toFixed(0)} mm) — vérifiez le drainage`, color: 'border-blue-500/30 bg-blue-500/8 text-blue-300' })
  }
  if (today.temperature_max != null && today.temperature_max >= 38) {
    alerts.push({ icon: '🌡️', text: `Chaleur extrême (${Math.round(today.temperature_max)}°C) — protégez vos plants et augmentez l'irrigation`, color: 'border-red-500/30 bg-red-500/8 text-red-300' })
  }
  if (today.wind_speed_ms != null && today.wind_speed_ms >= 8) {
    alerts.push({ icon: '💨', text: `Vent fort (${today.wind_speed_ms.toFixed(1)} m/s) — risque de verse sur les cultures hautes`, color: 'border-teal-500/30 bg-teal-500/8 text-teal-300' })
  }
  if (today.precipitation_mm != null && today.precipitation_mm < 0.5 && (today.et0_mm ?? 0) > 3) {
    const dryDays = week.filter(d => (d.precipitation_mm ?? 0) < 1).length
    if (dryDays >= 4) {
      alerts.push({ icon: '☀️', text: `${dryDays} jours sans pluie significative — période de sécheresse probable`, color: 'border-orange-500/30 bg-orange-500/8 text-orange-300' })
    }
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

  const today = weather[0] ?? null
  const alerts = today ? computeAlerts(today, weather.slice(1)) : []

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

      {/* Alerts */}
      {alerts.length > 0 && !loading && !error && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`rounded-xl border p-3 flex items-start gap-3 ${a.color}`}>
              <span className="text-lg shrink-0 leading-none mt-0.5">{a.icon}</span>
              <p className="text-[13px] font-medium leading-snug">{a.text}</p>
            </div>
          ))}
        </div>
      )}

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

      {!loading && !error && today && (
        <>
          {/* Today highlight */}
          <div className="vfp-card rounded-2xl p-5 bg-gradient-to-br from-sky-500/15 to-sky-900/5 border-sky-500/15">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sky-400/70 text-xs font-semibold uppercase tracking-wider">Aujourd&apos;hui</p>
                <p className="text-white/60 text-xs mt-0.5">{fmtDate(today.date)}</p>
              </div>
              <span className="text-4xl">{getRainIcon(today.precipitation_mm)}</span>
            </div>

            <div className="flex items-end gap-3 mb-4">
              <span className="text-5xl font-bold text-white">
                {today.temperature_mean != null ? Math.round(today.temperature_mean) : '—'}°
              </span>
              <div className="pb-1">
                <p className="text-xs text-red-400 font-semibold">↑ {today.temperature_max != null ? Math.round(today.temperature_max) : '—'}°</p>
                <p className="text-xs text-blue-400 font-semibold">↓ {today.temperature_min != null ? Math.round(today.temperature_min) : '—'}°</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white/5 border border-white/8 p-3 text-center">
                <Droplets className="h-4 w-4 text-blue-400 mx-auto mb-1" />
                <p className="text-white font-semibold text-sm">{today.precipitation_mm != null ? today.precipitation_mm.toFixed(1) : '—'}<span className="text-[10px] text-white/40 ml-0.5">mm</span></p>
                <p className="text-white/40 text-[10px] mt-0.5">Pluie</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/8 p-3 text-center">
                <Wind className="h-4 w-4 text-teal-400 mx-auto mb-1" />
                <p className="text-white font-semibold text-sm">{today.wind_speed_ms != null ? today.wind_speed_ms.toFixed(1) : '—'}<span className="text-[10px] text-white/40 ml-0.5">m/s</span></p>
                <p className="text-white/40 text-[10px] mt-0.5">Vent</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/8 p-3 text-center">
                <Thermometer className="h-4 w-4 text-amber-400 mx-auto mb-1" />
                <p className="text-white font-semibold text-sm">{today.humidity_pct != null ? Math.round(today.humidity_pct) : '—'}<span className="text-[10px] text-white/40 ml-0.5">%</span></p>
                <p className="text-white/40 text-[10px] mt-0.5">Humidité</p>
              </div>
            </div>

            {today.et0_mm != null && (
              <div className="mt-3 rounded-xl bg-amber-500/8 border border-amber-500/15 p-3 flex items-center gap-3">
                <Sun className="h-4 w-4 text-amber-400 shrink-0" />
                <div>
                  <p className="text-amber-300 text-xs font-semibold">ETP : {today.et0_mm.toFixed(1)} mm/j</p>
                  <p className="text-white/40 text-[11px]">Évapotranspiration de référence — besoins en eau des cultures</p>
                </div>
              </div>
            )}
          </div>

          {/* 7-day list */}
          {weather.length > 1 && (
            <div className="vfp-card rounded-2xl p-4 space-y-1">
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">Conditions récentes</p>
              {weather.slice(1).map(day => (
                <div key={day.date} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <span className="text-lg w-7 text-center">{getRainIcon(day.precipitation_mm)}</span>
                  <p className="text-white/60 text-xs w-28 shrink-0">{fmtDate(day.date)}</p>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-xs text-red-400">↑{day.temperature_max != null ? Math.round(day.temperature_max) : '—'}°</span>
                    <span className="text-xs text-blue-400">↓{day.temperature_min != null ? Math.round(day.temperature_min) : '—'}°</span>
                  </div>
                  {day.precipitation_mm != null && day.precipitation_mm > 0 && (
                    <span className="text-xs text-blue-400/70 shrink-0">{day.precipitation_mm.toFixed(1)}mm</span>
                  )}
                  {(!day.precipitation_mm || day.precipitation_mm === 0) && (
                    <span className="text-xs text-white/20 shrink-0">0mm</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-center text-white/20 text-[11px]">Données historiques · Open-Meteo / NASA POWER</p>
        </>
      )}
    </div>
  )
}
