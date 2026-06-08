const REGION_COORDS: Record<string, { lat: number; lon: number; city: string }> = {
  'Maritime':  { lat: 6.137,  lon: 1.212,  city: 'Lomé' },
  'Plateaux':  { lat: 7.530,  lon: 1.150,  city: 'Atakpamé' },
  'Centrale':  { lat: 8.980,  lon: 1.095,  city: 'Sokodé' },
  'Kara':      { lat: 9.551,  lon: 1.186,  city: 'Kara' },
  'Savanes':   { lat: 10.863, lon: 0.207,  city: 'Dapaong' },
}

// ── Model weights for West Africa ensemble ────────────────────────────────────
// ECMWF: best global accuracy, gold standard for 3-10 days
// GFS:   good tropical skill, runs 4x/day (more frequent updates)
// ICON:  independent European model, solid global coverage
const W_ECMWF = 0.45
const W_GFS   = 0.35
const W_ICON  = 0.20

// ── In-memory caches (per region) ────────────────────────────────────────────
const TTL_DAILY_MS   = 30 * 60_000
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
      temperature_max: d.temperature_2m_max[i] ?? 0,
      temperature_min: d.temperature_2m_min[i] ?? 0,
      temperature_mean: d.temperature_2m_mean[i] ?? 0,
      precipitation_mm: d.precipitation_sum[i] ?? 0,
      precipitation_probability: d.precipitation_probability_max[i] ?? 0,
      wind_speed_ms: Math.round(((d.wind_speed_10m_max[i] ?? 0) / 3.6) * 10) / 10,
      humidity_pct: d.relative_humidity_2m_mean[i] ?? 0,
      et0_mm: d.et0_fao_evapotranspiration[i] ?? 0,
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
      temperature: h.temperature_2m[i] ?? 0,
      apparent_temperature: h.apparent_temperature[i] ?? 0,
      precipitation_probability: h.precipitation_probability[i] ?? 0,
      weather_code: h.weather_code[i] ?? 0,
      wind_speed_ms: Math.round(((h.wind_speed_10m[i] ?? 0) / 3.6) * 10) / 10,
      humidity_pct: h.relative_humidity_2m[i] ?? 0,
      uv_index: h.uv_index[i] ?? 0,
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
 * - Temperature, wind, humidity: weighted average
 * - Precipitation: 70% weighted avg + 30% max (conservative for farmers)
 * - Precipitation probability: max across models (if any model says rain, show it)
 * - ET0: from ECMWF when available (most accurate), else weighted avg
 */
export function mergeWeatherModels(
  ecmwf: WeatherDayLive[],
  gfs: WeatherDayLive[],
  icon: WeatherDayLive[]
): WeatherDayLive[] {
  const sources = [
    { data: ecmwf, w: W_ECMWF },
    { data: gfs,   w: W_GFS },
    { data: icon,  w: W_ICON },
  ].filter(s => s.data.length > 0)

  if (sources.length === 0) return []
  if (sources.length === 1) return sources[0].data

  const byDate = new Map<string, { models: { day: WeatherDayLive; w: number }[] }>()
  for (const { data, w } of sources) {
    for (const day of data) {
      if (!byDate.has(day.date)) byDate.set(day.date, { models: [] })
      byDate.get(day.date)!.models.push({ day, w })
    }
  }

  const result: WeatherDayLive[] = []
  for (const [date, { models }] of byDate) {
    const wAvg = (field: keyof WeatherDayLive): number => {
      const valid = models.filter(m => (m.day[field] as number) > 0 || field !== 'et0_mm')
      if (!valid.length) return 0
      const tw = valid.reduce((s, m) => s + m.w, 0)
      return valid.reduce((s, m) => s + (m.day[field] as number) * (m.w / tw), 0)
    }

    const precipAvg = wAvg('precipitation_mm')
    const precipMax = Math.max(...models.map(m => m.day.precipitation_mm ?? 0))

    // ET0 from ECMWF when available (FAO-56 reference)
    const ecmwfDay = models.find(m => m.w === W_ECMWF)?.day
    const et0 = (ecmwfDay?.et0_mm ?? 0) > 0 ? ecmwfDay!.et0_mm : wAvg('et0_mm')

    result.push({
      date,
      temperature_max:  Math.round(wAvg('temperature_max')  * 10) / 10,
      temperature_min:  Math.round(wAvg('temperature_min')  * 10) / 10,
      temperature_mean: Math.round(wAvg('temperature_mean') * 10) / 10,
      precipitation_mm: Math.round((precipAvg * 0.7 + precipMax * 0.3) * 10) / 10,
      precipitation_probability: Math.min(100, Math.max(...models.map(m => m.day.precipitation_probability ?? 0))),
      wind_speed_ms:    Math.round(wAvg('wind_speed_ms')    * 10) / 10,
      humidity_pct:     Math.round(wAvg('humidity_pct')),
      et0_mm:           Math.round(et0 * 10) / 10,
      source: 'open_meteo' as const,
      region: models[0].day.region,
      city:   models[0].day.city,
    })
  }

  return result.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Merges hourly slots from ECMWF, GFS, ICON.
 * - Temperature, wind, humidity: weighted average
 * - Precipitation probability: max across models
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
  if (sources.length === 1) return sources[0].data

  const byTime = new Map<string, { slots: { slot: WeatherHour; w: number }[] }>()
  for (const { data, w } of sources) {
    for (const slot of data) {
      if (!byTime.has(slot.time)) byTime.set(slot.time, { slots: [] })
      byTime.get(slot.time)!.slots.push({ slot, w })
    }
  }

  const result: WeatherHour[] = []
  for (const [time, { slots }] of byTime) {
    const wAvg = (field: keyof WeatherHour): number => {
      const tw = slots.reduce((s, m) => s + m.w, 0)
      return slots.reduce((s, m) => s + (m.slot[field] as number) * (m.w / tw), 0)
    }
    // ECMWF-priority for categorical fields
    const primary = [...slots].sort((a, b) => b.w - a.w)[0].slot

    result.push({
      time,
      temperature:              Math.round(wAvg('temperature')             * 10) / 10,
      apparent_temperature:     Math.round(wAvg('apparent_temperature')    * 10) / 10,
      precipitation_probability: Math.min(100, Math.max(...slots.map(s => s.slot.precipitation_probability ?? 0))),
      weather_code:   primary.weather_code,
      wind_speed_ms:  Math.round(wAvg('wind_speed_ms') * 10) / 10,
      humidity_pct:   Math.round(wAvg('humidity_pct')),
      uv_index:       Math.round(wAvg('uv_index')      * 10) / 10,
      is_day:         primary.is_day,
    })
  }

  return result.sort((a, b) => a.time.localeCompare(b.time))
}
