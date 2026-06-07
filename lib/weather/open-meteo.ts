const REGION_COORDS: Record<string, { lat: number; lon: number; city: string }> = {
  'Maritime':  { lat: 6.137,  lon: 1.212,  city: 'Lomé' },
  'Plateaux':  { lat: 7.530,  lon: 1.150,  city: 'Atakpamé' },
  'Centrale':  { lat: 8.980,  lon: 1.095,  city: 'Sokodé' },
  'Kara':      { lat: 9.551,  lon: 1.186,  city: 'Kara' },
  'Savanes':   { lat: 10.863, lon: 0.207,  city: 'Dapaong' },
}

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

export function getRegionCoords(region: string): { lat: number; lon: number; city: string } | null {
  const key = Object.keys(REGION_COORDS).find(
    k => k.toLowerCase() === region.trim().toLowerCase()
  )
  return key ? REGION_COORDS[key] : null
}

export async function fetchOpenMeteoForRegion(region: string): Promise<WeatherDayLive[]> {
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
    return d.time.map((date, i) => ({
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
  } catch {
    return []
  }
}
