import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { fetchOpenMeteoForRegion, fetchHourlyForRegion, getRegionCoords } from '@/lib/weather/open-meteo'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ card_number: string }> }
) {
  const { card_number } = await params
  const cardNumber = decodeURIComponent(card_number).toUpperCase().trim()

  const supabase = await createClient()

  const { data: card } = await supabase
    .from('member_cards')
    .select('member_id')
    .eq('card_number', cardNumber)
    .eq('status', 'active')
    .maybeSingle()

  if (!card?.member_id) {
    return NextResponse.json({ error: 'Carte non trouvée.' }, { status: 404 })
  }

  const supabaseAdmin = createAdminClient()

  const { data: member } = await supabaseAdmin
    .from('members')
    .select('region')
    .eq('id', card.member_id)
    .maybeSingle()

  const region = member?.region ?? 'Maritime'

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const threeDaysAgo = new Date(today)
  threeDaysAgo.setDate(today.getDate() - 3)
  const tenDaysLater = new Date(today)
  tenDaysLater.setDate(today.getDate() + 10)

  const dateFrom = threeDaysAgo.toISOString().split('T')[0]
  const dateTo = tenDaysLater.toISOString().split('T')[0]

  const [{ data: cached }, hourlyRaw] = await Promise.all([
    supabaseAdmin
      .from('weather_data')
      .select('date, temperature_max, temperature_min, temperature_mean, precipitation_mm, humidity_pct, wind_speed_ms, et0_mm, region')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .eq('region', region)
      .order('date', { ascending: true })
      .limit(14),
    fetchHourlyForRegion(region),
  ])
  let weather = (cached ?? []) as Array<{
    date: string
    temperature_max: number | null
    temperature_min: number | null
    temperature_mean: number | null
    precipitation_mm: number | null
    humidity_pct: number | null
    wind_speed_ms: number | null
    et0_mm: number | null
    region: string | null
  }>

  // Fallback Open-Meteo direct si données insuffisantes
  let dataSource: 'cached' | 'live' | 'partial' = 'cached'
  if (weather.length < 3) {
    const live = await fetchOpenMeteoForRegion(region)
    if (live.length > 0) {
      const existingDates = new Set(weather.map(w => w.date))
      const newDays = live.filter(l => !existingDates.has(l.date))
      weather = [...weather, ...newDays].sort((a, b) => a.date.localeCompare(b.date))
      dataSource = weather.length === live.length ? 'live' : 'partial'
    }
  }

  // Insights agronomiques
  const futureDays = weather.filter(d => d.date >= todayStr)
  const daysWithoutRain = futureDays.filter(d => (d.precipitation_mm ?? 0) < 1).length
  const avgEto = futureDays.length > 0
    ? futureDays.reduce((s, d) => s + (d.et0_mm ?? 0), 0) / futureDays.length
    : 0
  const waterStressDays = futureDays.filter(d => (d.et0_mm ?? 0) > (d.precipitation_mm ?? 0) + 2).length
  const heatStressDays = futureDays.filter(d => (d.temperature_max ?? 0) > 36).length

  let droughtRisk: 'low' | 'moderate' | 'high' | 'critical' = 'low'
  if (daysWithoutRain >= 7 || (daysWithoutRain >= 4 && avgEto > 5)) droughtRisk = 'critical'
  else if (daysWithoutRain >= 5 || (daysWithoutRain >= 3 && avgEto > 4)) droughtRisk = 'high'
  else if (daysWithoutRain >= 3 || avgEto > 3.5) droughtRisk = 'moderate'

  const sprayDays = futureDays.filter(d => (d.wind_speed_ms ?? 99) < 4 && (d.precipitation_mm ?? 99) < 2)
  const sprayWindow = sprayDays.length >= 2
    ? sprayDays.slice(0, 2).map(d => new Date(d.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short' })).join('-')
    : null

  const plantingOk = futureDays.some(d =>
    (d.temperature_mean ?? 0) >= 20 && (d.temperature_mean ?? 0) <= 32
  )

  const city = getRegionCoords(region)?.city ?? region

  return NextResponse.json(
    {
      weather,
      hourly: hourlyRaw,
      region,
      city,
      data_source: dataSource,
      updated_at: new Date().toISOString(),
      agro_insights: {
        drought_risk: droughtRisk,
        planting_window: plantingOk ? 'Conditions favorables les prochains jours' : null,
        spray_window: sprayWindow,
        water_stress_days: waterStressDays,
        heat_stress_days: heatStressDays,
      },
    },
    { headers: { 'Cache-Control': 'private, max-age=1800, stale-while-revalidate=300' } }
  )
}
