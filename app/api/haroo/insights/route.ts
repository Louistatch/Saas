// Insights de l'espace Haroo — croise les capacités de l'écosystème pour
// chaque professionnel connecté :
//   • Météo : ensemble 3 modèles (ECMWF / GFS / ICON) du module météo
//     FaîtiereHub/AgriSmart, sur la région de l'acteur
//   • Prix du marché : table market_prices (collecte terrain FaîtiereHub),
//     filtrés sur la région de l'acteur
//
// La région est résolue depuis le profil Haroo :
//   ouvrier  → premier canton de disponibilité → préfecture → région
//   acheteur → préfecture d'intervention → région
//   agronome → canton d'exercice → préfecture → région

import { NextResponse, type NextRequest } from 'next/server'
import { getAccessContext } from '@/lib/security/assert-access'
import { isHarooRole } from '@/lib/utils/permissions'
import { rateLimit, clientKeyFromHeaders } from '@/lib/utils/rate-limit'
import {
  fetchOpenMeteoForRegion,
  fetchGFSForRegion,
  fetchICONForRegion,
  mergeWeatherModels,
} from '@/lib/weather/open-meteo'

const DEFAULT_REGION = 'Maritime'

interface PriceOut {
  id: string
  culture: string
  price: number
  trend: string
  market: string
  verified: boolean
  recorded_at: string
}

export async function GET(request: NextRequest) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`haroo-insights:${ip}`, 20, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const ctx = await getAccessContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }
  if (!isHarooRole(ctx.role)) {
    return NextResponse.json({ error: 'Réservé aux profils Haroo' }, { status: 403 })
  }

  const { supabase, userId, role } = ctx

  // ── 1. Résoudre la région de l'acteur ──────────────────────────────────────
  let regionId: string | null = null
  let regionName = DEFAULT_REGION

  let prefectureId: string | null = null
  if (role === 'ouvrier') {
    const { data: profile } = await supabase
      .from('haroo_ouvrier_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle<{ id: string }>()
    if (profile) {
      const { data: link } = await supabase
        .from('haroo_ouvrier_cantons')
        .select('cantons(prefecture_id)')
        .eq('ouvrier_id', profile.id)
        .limit(1)
        .maybeSingle<{ cantons: { prefecture_id: string } | null }>()
      prefectureId = link?.cantons?.prefecture_id ?? null
    }
  } else if (role === 'acheteur') {
    const { data: profile } = await supabase
      .from('haroo_acheteur_profiles')
      .select('prefecture_id')
      .eq('user_id', userId)
      .maybeSingle<{ prefecture_id: string | null }>()
    prefectureId = profile?.prefecture_id ?? null
  } else {
    const { data: profile } = await supabase
      .from('haroo_agronome_profiles')
      .select('cantons(prefecture_id)')
      .eq('user_id', userId)
      .maybeSingle<{ cantons: { prefecture_id: string } | null }>()
    prefectureId = profile?.cantons?.prefecture_id ?? null
  }

  if (prefectureId) {
    const { data: pref } = await supabase
      .from('prefectures')
      .select('region_id, regions(name)')
      .eq('id', prefectureId)
      .maybeSingle<{ region_id: string; regions: { name: string } | null }>()
    if (pref?.regions?.name) {
      regionId = pref.region_id
      regionName = pref.regions.name
    }
  }

  // ── 2. Météo (ensemble 3 modèles, cache en mémoire côté lib) + prix ────────
  const today = new Date().toISOString().slice(0, 10)

  interface PriceRow {
    id: string
    culture_id: string
    market_name: string
    price: number
    trend: string | null
    verified: boolean
    created_at: string
    cultures: { name: string } | null
  }

  const pricesQuery = regionId
    ? supabase
        .from('market_prices')
        .select('id, culture_id, market_name, price, trend, verified, created_at, cultures(name)')
        .eq('region_id', regionId)
        .order('created_at', { ascending: false })
        .limit(40)
        .returns<PriceRow[]>()
    : supabase
        .from('market_prices')
        .select('id, culture_id, market_name, price, trend, verified, created_at, cultures(name)')
        .order('created_at', { ascending: false })
        .limit(40)
        .returns<PriceRow[]>()

  const [ecmwf, gfs, icon, pricesRes] = await Promise.all([
    fetchOpenMeteoForRegion(regionName),
    fetchGFSForRegion(regionName),
    fetchICONForRegion(regionName),
    pricesQuery,
  ])

  const weather = mergeWeatherModels(ecmwf, gfs, icon)
    .filter((d) => d.date >= today)
    .slice(0, 4)
    .map((d) => ({
      date: d.date,
      temperature_min: Math.round(d.temperature_min),
      temperature_max: Math.round(d.temperature_max),
      precipitation_mm: Math.round(d.precipitation_mm * 10) / 10,
      precipitation_probability: Math.round(d.precipitation_probability),
      humidity_pct: Math.round(d.humidity_pct),
    }))

  // Dédoublonner : garder le prix le plus récent par culture.
  const seen = new Set<string>()
  const prices: PriceOut[] = []
  for (const row of pricesRes.data ?? []) {
    const culture = row.cultures?.name ?? '—'
    if (seen.has(culture)) continue
    seen.add(culture)
    prices.push({
      id: row.id,
      culture,
      price: Number(row.price),
      trend: row.trend ?? 'stable',
      market: row.market_name,
      verified: row.verified,
      recorded_at: row.created_at,
    })
    if (prices.length >= 8) break
  }

  return NextResponse.json(
    { region: regionName, weather, prices },
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  )
}
