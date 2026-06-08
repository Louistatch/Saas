const REGION_COORDS: Record<string, { lat: number; lon: number; city: string }> = {
  'Maritime':  { lat: 6.137,  lon: 1.212,  city: 'Lomé' },
  'Plateaux':  { lat: 7.530,  lon: 1.150,  city: 'Atakpamé' },
  'Centrale':  { lat: 8.980,  lon: 1.095,  city: 'Sokodé' },
  'Kara':      { lat: 9.551,  lon: 1.186,  city: 'Kara' },
  'Savanes':   { lat: 10.863, lon: 0.207,  city: 'Dapaong' },
}

// ── In-memory caches (per region, keyed by region name) ──────────────────────
// Shared across all requests within the same server process.
// TTLs are intentionally short: hourly data shifts every hour, nowcast every 15 min.
const TTL_DAILY_MS    = 30 * 60_000   // 30 min  — daily fallback
const TTL_HOURLY_MS   = 15 * 60_000   // 15 min  — hourly strip
const TTL_NOWCAST_MS  =  5 * 60_000   //  5 min  — minutely_15 nowcasting

type CacheEntry<T> = { data: T; ts: number }

const dailyCache:   Map<string, CacheEntry<WeatherDayLive[]>>    = new Map()
const hourlyCache:  Map<string, CacheEntry<WeatherHour[]>>       = new Map()
const nowcastCache: Map<string, CacheEntry<WeatherMinutely15[]>> = new Map()

function fromCache<T>(cache: Map<string, CacheEntry<T>>, key: string, ttl: number): T | null {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.ts < ttl) return entry.data
  return null
}

function toCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() })
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

// ── Fetch functions ───────────────────────────────────────────────────────────

export async function fetchOpenMeteoForRegion(region: string): Promise<WeatherDayLive[]> {
  const hit = fromCache(dailyCache, region, TTL_DAILY_MS)
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
    toCache(dailyCache, region, result)
    return result
  } catch {
    return []
  }
}

export async function fetchMinutely15ForRegion(region: string): Promise<WeatherMinutely15[]> {
  const hit = fromCache(nowcastCache, region, TTL_NOWCAST_MS)
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
    toCache(nowcastCache, region, result)
    return result
  } catch {
    return []
  }
}

export async function fetchHourlyForRegion(region: string): Promise<WeatherHour[]> {
  const hit = fromCache(hourlyCache, region, TTL_HOURLY_MS)
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
    toCache(hourlyCache, region, result)
    return result
  } catch {
    return []
  }
}
