import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { fetchOpenMeteoForRegion } from '@/lib/weather/open-meteo'

const REGIONS = ['Maritime', 'Plateaux', 'Centrale', 'Kara', 'Savanes']

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const results: { region: string; synced: number; error?: string }[] = []

  for (const region of REGIONS) {
    try {
      const days = await fetchOpenMeteoForRegion(region)
      if (days.length === 0) {
        results.push({ region, synced: 0, error: 'No data from Open-Meteo' })
        continue
      }

      const rows = days.map(d => ({
        region: d.region,
        date: d.date,
        temperature_max: d.temperature_max,
        temperature_min: d.temperature_min,
        temperature_mean: d.temperature_mean,
        precipitation_mm: d.precipitation_mm,
        wind_speed_ms: d.wind_speed_ms,
        humidity_pct: d.humidity_pct,
        et0_mm: d.et0_mm,
        source: 'open_meteo' as const,
        latitude: null as number | null,
        longitude: null as number | null,
        solar_radiation_mj: null as number | null,
      }))

      const { error } = await supabase
        .from('weather_data')
        .upsert(rows, { onConflict: 'region,date,source', ignoreDuplicates: false })

      results.push({ region, synced: rows.length, error: error?.message })
    } catch (err) {
      results.push({ region, synced: 0, error: err instanceof Error ? err.message : 'Unknown' })
    }
  }

  return NextResponse.json({ ok: true, results, timestamp: new Date().toISOString() })
}
