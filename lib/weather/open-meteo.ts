const REGION_COORDS: Record<string, { lat: number; lon: number; city: string }> = {
  'Maritime':  { lat: 6.137,  lon: 1.212,  city: 'Lomé' },
  'Plateaux':  { lat: 7.530,  lon: 1.150,  city: 'Atakpamé' },
  'Centrale':  { lat: 8.980,  lon: 1.095,  city: 'Sokodé' },
  'Kara':      { lat: 9.551,  lon: 1.186,  city: 'Kara' },
  'Savanes':   { lat: 10.863, lon: 0.207,  city: 'Dapaong' },
}

// ── Poids de l'ensemble multi-modèles ─────────────────────────────────────────
// Audit oct. 2026 : les anciens poids (0,45 / 0,35 / 0,20) ne reposaient sur
// aucune vérification au Togo. Sans scores locaux (stations, CHIRPS, ERA5),
// la littérature recommande des poids ÉGAUX. À ajuster seulement après
// vérification des erreurs de chaque modèle sur des observations togolaises.
const W_ECMWF = 1 / 3
const W_GFS   = 1 / 3
const W_ICON  = 1 / 3

/** Valeur absente de l'API : NaN (jamais 0, qui fausserait les moyennes). */
const val = (x: number | null | undefined): number => (x == null ? Number.NaN : x)
/** Moyenne pondérée des seules valeurs connues ; NaN si aucune. */
function finiteMean(items: { v: number; w: number }[]): number {
  const ok = items.filter((it) => Number.isFinite(it.v))
  const tw = ok.reduce((s, it) => s + it.w, 0)
  return tw > 0 ? ok.reduce((s, it) => s + it.v * it.w, 0) / tw : Number.NaN
}
const or0 = (x: number): number => (Number.isFinite(x) ? x : 0)

// ── In-memory caches (per region) ────────────────────────────────────────────
const TTL_DAILY_MS   = 30 * 60_000
const TTL_SEASONAL_MS = 6 * 60 * 60_000
const TTL_HOURLY_MS  = 15 * 60_000
const TTL_NOWCAST_MS =  5 * 60_000

type CE<T> = { data: T; ts: number }
const caches = {
  dailyECMWF:  new Map<string, CE<WeatherDayLive[]>>(),
  dailyGFS:    new Map<string, CE<WeatherDayLive[]>>(),
  dailyICON:   new Map<string, CE<WeatherDayLive[]>>(),
  hourlyECMWF: new Map<string, CE<WeatherHour[]>>(),
  hourlyGFS:   new Map<string, CE<WeatherHour[]>>(),
  hourlyICON:  new Map<string, CE<WeatherHour[]>>(),
  nowcast:     new Map<string, CE<WeatherMinutely15[]>>(),
  seasonal:    new Map<string, CE<WeatherSeasonal[]>>(),
}

function fromCache<T>(map: Map<string, CE<T>>, key: string, ttl: number): T | null {
  const e = map.get(key)
  return e && Date.now() - e.ts < ttl ? e.data : null
}
function toCache<T>(map: Map<string, CE<T>>, key: string, data: T): void {
  map.set(key, { data, ts: Date.now() })
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface WeatherDayLive {
  date: string
  temperature_max: number
  temperature_min: number
  temperature_mean: number
  precipitation_mm: number
  precipitation_probability: number
  wind_speed_ms: number
  humidity_pct: number
  et0_mm: number
  source: 'open_meteo'
  region: string
  city: string
}

export interface WeatherHour {
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

export interface WeatherMinutely15 {
  time: string        // "YYYY-MM-DDTHH:MM" in Africa/Lagos (UTC+1)
  precipitation: number
  rain: number
  weather_code: number
  temperature: number
}

export interface WeatherSeasonal {
  month: string
  temperature_mean: number
  precipitation_mm: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getRegionCoords(region: string): { lat: number; lon: number; city: string } | null {
  const key = Object.keys(REGION_COORDS).find(
    k => k.toLowerCase() === region.trim().toLowerCase()
  )
  return key ? REGION_COORDS[key] : null
}

// ── Internal generic fetchers ─────────────────────────────────────────────────

async function _fetchDailyModel(
  region: string,
  model: string | null,
  cacheMap: Map<string, CE<WeatherDayLive[]>>
): Promise<WeatherDayLive[]> {
  const hit = fromCache(cacheMap, region, TTL_DAILY_MS)
  if (hit) return hit

  const coords = getRegionCoords(region)
  if (!coords) return []

  const params = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'temperature_2m_mean',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'relative_humidity_2m_mean',
      'et0_fao_evapotranspiration',
    ].join(','),
    past_days: '3',
    forecast_days: '7',
    timezone: 'Africa/Lagos',
  })
  if (model) params.set('models', model)

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return []

    const json = await res.json() as {
      daily: {
        time: string[]
        temperature_2m_max: (number | null)[]
        temperature_2m_min: (number | null)[]
        temperature_2m_mean: (number | null)[]
        precipitation_sum: (number | null)[]
        precipitation_probability_max: (number | null)[]
        wind_speed_10m_max: (number | null)[]
        relative_humidity_2m_mean: (number | null)[]
        et0_fao_evapotranspiration: (number | null)[]
      }
    }

    const d = json.daily
    const result: WeatherDayLive[] = d.time.map((date, i) => ({
      date,
      temperature_max: val(d.temperature_2m_max[i]),
      temperature_min: val(d.temperature_2m_min[i]),
      temperature_mean: val(d.temperature_2m_mean[i]),
      precipitation_mm: val(d.precipitation_sum[i]),
      precipitation_probability: val(d.precipitation_probability_max[i]),
      wind_speed_ms: Math.round((val(d.wind_speed_10m_max[i]) / 3.6) * 10) / 10,
      humidity_pct: val(d.relative_humidity_2m_mean[i]),
      et0_mm: val(d.et0_fao_evapotranspiration[i]),
      source: 'open_meteo' as const,
      region,
      city: coords.city,
    }))
    toCache(cacheMap, region, result)
    return result
  } catch {
    return []
  }
}

async function _fetchHourlyModel(
  region: string,
  model: string | null,
  cacheMap: Map<string, CE<WeatherHour[]>>
): Promise<WeatherHour[]> {
  const hit = fromCache(cacheMap, region, TTL_HOURLY_MS)
  if (hit) return hit

  const coords = getRegionCoords(region)
  if (!coords) return []

  const params = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    hourly: [
      'temperature_2m',
      'apparent_temperature',
      'precipitation_probability',
      'weather_code',
      'wind_speed_10m',
      'relative_humidity_2m',
      'uv_index',
      'is_day',
    ].join(','),
    forecast_days: '2',
    timezone: 'Africa/Lagos',
  })
  if (model) params.set('models', model)

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return []

    const json = await res.json() as {
      hourly: {
        time: string[]
        temperature_2m: (number | null)[]
        apparent_temperature: (number | null)[]
        precipitation_probability: (number | null)[]
        weather_code: (number | null)[]
        wind_speed_10m: (number | null)[]
        relative_humidity_2m: (number | null)[]
        uv_index: (number | null)[]
        is_day: (number | null)[]
      }
    }

    const h = json.hourly
    const result: WeatherHour[] = h.time.map((time, i) => ({
      time,
      temperature: val(h.temperature_2m[i]),
      apparent_temperature: val(h.apparent_temperature[i]),
      precipitation_probability: val(h.precipitation_probability[i]),
      weather_code: h.weather_code[i] ?? 0,
      wind_speed_ms: Math.round((val(h.wind_speed_10m[i]) / 3.6) * 10) / 10,
      humidity_pct: val(h.relative_humidity_2m[i]),
      uv_index: val(h.uv_index[i]),
      is_day: h.is_day[i] ?? 1,
    }))
    toCache(cacheMap, region, result)
    return result
  } catch {
    return []
  }
}

// ── Public fetch functions ────────────────────────────────────────────────────

/** ECMWF IFS — European Centre, best global accuracy */
export function fetchOpenMeteoForRegion(region: string): Promise<WeatherDayLive[]> {
  return _fetchDailyModel(region, 'ecmwf_ifs025', caches.dailyECMWF)
}

/** GFS Seamless — NOAA, good tropical skill, 4 runs/day */
export function fetchGFSForRegion(region: string): Promise<WeatherDayLive[]> {
  return _fetchDailyModel(region, 'gfs_seamless', caches.dailyGFS)
}

/** ICON Seamless — DWD Germany, independent European model */
export function fetchICONForRegion(region: string): Promise<WeatherDayLive[]> {
  return _fetchDailyModel(region, 'icon_seamless', caches.dailyICON)
}

/** ECMWF hourly */
export function fetchHourlyForRegion(region: string): Promise<WeatherHour[]> {
  return _fetchHourlyModel(region, 'ecmwf_ifs025', caches.hourlyECMWF)
}

/** GFS hourly */
export function fetchHourlyGFSForRegion(region: string): Promise<WeatherHour[]> {
  return _fetchHourlyModel(region, 'gfs_seamless', caches.hourlyGFS)
}

/** ICON hourly */
export function fetchHourlyICONForRegion(region: string): Promise<WeatherHour[]> {
  return _fetchHourlyModel(region, 'icon_seamless', caches.hourlyICON)
}

/** Nowcast minutely_15 — Open-Meteo (radar-based, 6h ahead) */
export async function fetchMinutely15ForRegion(region: string): Promise<WeatherMinutely15[]> {
  const hit = fromCache(caches.nowcast, region, TTL_NOWCAST_MS)
  if (hit) return hit

  const coords = getRegionCoords(region)
  if (!coords) return []

  const params = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    minutely_15: ['precipitation', 'rain', 'weather_code', 'temperature_2m'].join(','),
    forecast_minutely_15: '24',
    timezone: 'Africa/Lagos',
  })

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return []

    const json = await res.json() as {
      minutely_15: {
        time: string[]
        precipitation: (number | null)[]
        rain: (number | null)[]
        weather_code: (number | null)[]
        temperature_2m: (number | null)[]
      }
    }

    const m = json.minutely_15
    const result: WeatherMinutely15[] = m.time.map((time, i) => ({
      time,
      precipitation: m.precipitation[i] ?? 0,
      rain: m.rain[i] ?? 0,
      weather_code: m.weather_code[i] ?? 0,
      temperature: m.temperature_2m[i] ?? 0,
    }))
    toCache(caches.nowcast, region, result)
    return result
  } catch {
    return []
  }
}

// ── Ensemble fusion ───────────────────────────────────────────────────────────

/**
 * Merges daily forecasts from ECMWF, GFS, ICON into a single ensemble.
 * - Température, vent, humidité, pluie : moyenne des modèles disponibles
 *   (valeurs absentes ignorées, poids égaux)
 * - Probabilité de pluie : moyenne des modèles qui la fournissent
 * - ET0: from ECMWF when available (most accurate), else weighted avg
 */
export function mergeWeatherModels(
  ecmwf: WeatherDayLive[],
  gfs: WeatherDayLive[],
  icon: WeatherDayLive[]
): WeatherDayLive[] {
  const sources = [
    { data: ecmwf, w: W_ECMWF, ecmwf: true },
    { data: gfs,   w: W_GFS,   ecmwf: false },
    { data: icon,  w: W_ICON,  ecmwf: false },
  ].filter(s => s.data.length > 0)

  if (sources.length === 0) return []

  const byDate = new Map<string, { day: WeatherDayLive; w: number; ecmwf: boolean }[]>()
  for (const { data, w, ecmwf: isEcmwf } of sources) {
    for (const day of data) {
      const list = byDate.get(day.date) ?? []
      list.push({ day, w, ecmwf: isEcmwf })
      byDate.set(day.date, list)
    }
  }

  const round1 = (x: number) => Math.round(or0(x) * 10) / 10
  const result: WeatherDayLive[] = []
  for (const [date, models] of byDate) {
    const mean = (field: keyof WeatherDayLive) =>
      finiteMean(models.map((m) => ({ v: m.day[field] as number, w: m.w })))

    // Probabilité : moyenne des modèles qui la fournissent (l'ancien maximum
    // gonflait les alertes). À défaut, part des modèles annonçant ≥ 1 mm.
    let prob = mean('precipitation_probability')
    if (!Number.isFinite(prob)) {
      const amounts = models.map((m) => m.day.precipitation_mm).filter(Number.isFinite)
      prob = amounts.length ? (amounts.filter((x) => x >= 1).length / amounts.length) * 100 : Number.NaN
    }

    // ET0 FAO-56 : ECMWF en priorité quand il est fourni.
    const ecmwfEt0 = models.find((m) => m.ecmwf)?.day.et0_mm
    const et0 = ecmwfEt0 != null && Number.isFinite(ecmwfEt0) ? ecmwfEt0 : mean('et0_mm')

    result.push({
      date,
      temperature_max:  round1(mean('temperature_max')),
      temperature_min:  round1(mean('temperature_min')),
      temperature_mean: round1(mean('temperature_mean')),
      // Quantité : moyenne des modèles (l'ancien mélange 70 % moyenne + 30 %
      // maximum biaisait la pluie vers le haut sans fondement de vérification).
      precipitation_mm: round1(mean('precipitation_mm')),
      precipitation_probability: Math.round(Math.min(100, or0(prob))),
      wind_speed_ms:    round1(mean('wind_speed_ms')),
      humidity_pct:     Math.round(or0(mean('humidity_pct'))),
      et0_mm:           round1(et0),
      source: 'open_meteo' as const,
      region: models[0].day.region,
      city:   models[0].day.city,
    })
  }

  return result.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Merges hourly slots from ECMWF, GFS, ICON.
 * - Température, vent, humidité : moyenne des modèles disponibles
 * - Probabilité de pluie : moyenne des modèles qui la fournissent
 * - Weather code: from highest-weight available model (ECMWF priority)
 * - UV, is_day: from ECMWF
 */
export function mergeHourlyModels(
  ecmwf: WeatherHour[],
  gfs: WeatherHour[],
  icon: WeatherHour[]
): WeatherHour[] {
  const sources = [
    { data: ecmwf, w: W_ECMWF },
    { data: gfs,   w: W_GFS },
    { data: icon,  w: W_ICON },
  ].filter(s => s.data.length > 0)

  if (sources.length === 0) return []

  const byTime = new Map<string, { slots: { slot: WeatherHour; w: number }[] }>()
  for (const { data, w } of sources) {
    for (const slot of data) {
      let entry = byTime.get(slot.time)
      if (!entry) {
        entry = { slots: [] }
        byTime.set(slot.time, entry)
      }
      entry.slots.push({ slot, w })
    }
  }

  const result: WeatherHour[] = []
  for (const [time, { slots }] of byTime) {
    const wAvg = (field: keyof WeatherHour): number =>
      or0(finiteMean(slots.map((m) => ({ v: m.slot[field] as number, w: m.w }))))
    // Champs catégoriels (code météo, jour/nuit) : ECMWF en priorité.
    const primary = slots[0].slot // ordre des sources : ECMWF, GFS, ICON

    result.push({
      time,
      temperature:              Math.round(wAvg('temperature')             * 10) / 10,
      apparent_temperature:     Math.round(wAvg('apparent_temperature')    * 10) / 10,
      precipitation_probability: Math.round(Math.min(100, wAvg('precipitation_probability'))),
      weather_code:   primary.weather_code,
      wind_speed_ms:  Math.round(wAvg('wind_speed_ms') * 10) / 10,
      humidity_pct:   Math.round(wAvg('humidity_pct')),
      uv_index:       Math.round(wAvg('uv_index')      * 10) / 10,
      is_day:         primary.is_day,
    })
  }

  return result.sort((a, b) => a.time.localeCompare(b.time))
}

// ── Seasonal forecast ─────────────────────────────────────────────────────────

/**
 * Fetches a 3-month seasonal forecast from the CFS v2 model.
 * Returns one WeatherSeasonal entry per month, sorted by month.
 * TTL: 6 hours. Returns [] on any error.
 */
export async function fetchSeasonalForRegion(region: string): Promise<WeatherSeasonal[]> {
  const hit = fromCache(caches.seasonal, region, TTL_SEASONAL_MS)
  if (hit) return hit

  const coords = getRegionCoords(region)
  if (!coords) return []

  const params = new URLSearchParams({
    latitude:       String(coords.lat),
    longitude:      String(coords.lon),
    monthly:        'temperature_2m_mean,precipitation_sum',
    forecast_months: '3',
    timezone:       'Africa/Lagos',
    models:         'cfs_v2',
  })

  try {
    const res = await fetch(`https://seasonal-api.open-meteo.com/v1/seasonal?${params}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return []

    const json = await res.json() as {
      monthly: {
        time: string[]
        temperature_2m_mean: (number | null)[]
        precipitation_sum: (number | null)[]
      }
    }

    const m = json.monthly
    const result: WeatherSeasonal[] = m.time.map((month, i) => ({
      month,
      temperature_mean: m.temperature_2m_mean[i] ?? 0,
      precipitation_mm: m.precipitation_sum[i] ?? 0,
    }))

    const sorted = result.sort((a, b) => a.month.localeCompare(b.month))
    toCache(caches.seasonal, region, sorted)
    return sorted
  } catch {
    return []
  }
}
