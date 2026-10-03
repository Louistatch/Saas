import 'server-only'

/**
 * Rendement attendu d'une parcelle — modèle FAO-33 d'AgriTogo
 * (docs/YIELD_MODEL.md dans le dépôt AgriTogo). Renvoie null si le service ne
 * répond pas : l'écran affiche alors simplement « estimation indisponible ».
 */

export interface YieldEstimate {
  ok: true
  crop: string
  region: string | null
  irrigated: boolean
  planting_month: string
  yield_t_ha: { annee_normale: number; annee_seche: number; fourchette: [number, number] }
  water_satisfaction_pct: { annee_normale: number; annee_seche: number }
  production_t?: { annee_normale: number; annee_seche: number }
  method: {
    model: string
    ky: number
    ky_source: string
    yref_t_ha: number
    yref_status: string
    yref_source: string
    validated_locally: boolean
    limits: string[]
  }
}

export interface ParcelInput {
  crop: string | null
  region: string | null
  gps: string | null
  soilType: string | null
  irrigation: string | null
  areaHa: number | null
}

function parseGps(gps: string | null): { lat: number; lon: number } | null {
  if (!gps) return null
  const m = gps.match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const lat = Number(m[1])
  const lon = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null
}

export async function estimateParcelYield(p: ParcelInput): Promise<YieldEstimate | null> {
  const base = process.env.AGRITOGO_API_URL?.replace(/\/$/, '')
  if (!base || !p.crop) return null
  const gps = parseGps(p.gps)
  try {
    const res = await fetch(`${base}/api/v1/yield/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crop: p.crop,
        region: p.region ?? undefined,
        ...(gps ?? {}),
        soil_type: p.soilType ?? undefined,
        irrigation: p.irrigation ?? undefined,
        area_ha: p.areaHa ?? undefined,
      }),
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { ok?: boolean }
    return data.ok ? (data as YieldEstimate) : null
  } catch {
    return null
  }
}
