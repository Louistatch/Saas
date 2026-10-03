/**
 * Probabilité de pluie par ENSEMBLE — API Ensemble d'Open-Meteo (gratuite,
 * sans clé, usage non commercial / quota libre).
 *
 * Méthode (prévision probabiliste standard) : on réunit les membres des trois
 * ensembles (ECMWF IFS 0,25° ≈ 51 membres, GFS GEFS ≈ 31, ICON-EPS ≈ 40) et la
 * probabilité est la PART des membres qui annoncent la pluie :
 *   - jour  : cumul journalier ≥ 1 mm ;
 *   - heure : cumul horaire ≥ 0,1 mm.
 * Remplace l'ancienne « probabilité » tirée de trois sorties déterministes.
 * Si l'API ne répond pas, la fonction renvoie null et l'appelant garde la
 * probabilité des modèles déterministes (repli).
 */

import { getRegionCoords } from '@/lib/weather/open-meteo'

const MODELS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless']
const TTL_MS = 60 * 60_000
const DAY_THRESHOLD_MM = 1
const HOUR_THRESHOLD_MM = 0.1

export interface RainProbability {
  /** date (AAAA-MM-JJ) → probabilité 0–100 */
  daily: Map<string, number>
  /** heure ISO (AAAA-MM-JJTHH:MM) → probabilité 0–100 */
  hourly: Map<string, number>
  members: number
}

const cache = new Map<string, { at: number; data: RainProbability }>()

export async function fetchEnsembleRainProbability(region: string): Promise<RainProbability | null> {
  const hit = cache.get(region)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data
  const coords = getRegionCoords(region)
  if (!coords) return null

  const params = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    hourly: 'precipitation',
    models: MODELS.join(','),
    forecast_days: '7',
    timezone: 'Africa/Lagos',
  })
  try {
    const res = await fetch(`https://ensemble-api.open-meteo.com/v1/ensemble?${params}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { hourly?: Record<string, unknown> }
    const data = membersToProbability(json.hourly ?? {})
    if (!data) return null
    cache.set(region, { at: Date.now(), data })
    return data
  } catch {
    return null
  }
}

/**
 * Lit la réponse horaire : `time` + une série par membre et par modèle
 * (`precipitation`, `precipitation_member01`, `precipitation_member01_gfs_seamless`…).
 * Exportée pour les tests.
 */
export function membersToProbability(hourly: Record<string, unknown>): RainProbability | null {
  const time = hourly.time
  if (!Array.isArray(time) || time.length === 0) return null
  const series = Object.entries(hourly)
    .filter(([key, v]) => key.startsWith('precipitation') && Array.isArray(v))
    .map(([, v]) => v as (number | null)[])
  if (series.length === 0) return null

  const hourly_ = new Map<string, number>()
  const daySums: Map<string, number[]> = new Map()
  time.forEach((t: string, i: number) => {
    let wet = 0
    let n = 0
    const day = t.slice(0, 10)
    const sums = daySums.get(day) ?? new Array(series.length).fill(0)
    series.forEach((s, m) => {
      const v = s[i]
      if (typeof v === 'number' && Number.isFinite(v)) {
        n++
        if (v >= HOUR_THRESHOLD_MM) wet++
        sums[m] += v
      } else {
        sums[m] = Number.NaN // membre incomplet ce jour-là : exclu du calcul journalier
      }
    })
    daySums.set(day, sums)
    if (n > 0) hourly_.set(t, Math.round((wet / n) * 100))
  })

  const daily = new Map<string, number>()
  for (const [day, sums] of daySums) {
    const valid = sums.filter((x) => Number.isFinite(x))
    if (valid.length) {
      daily.set(day, Math.round((valid.filter((x) => x >= DAY_THRESHOLD_MM).length / valid.length) * 100))
    }
  }
  return { daily, hourly: hourly_, members: series.length }
}
