/**
 * Proxy AgriSmart → AgriTogo backend
 *
 * Routes :
 *   GET  /api/agrismart?resource=crops
 *   GET  /api/agrismart?resource=soil-types
 *   POST /api/agrismart  (body: { resource: 'calculate', ...payload })
 */
import { requirePrivateCard } from '@/lib/security/card-access'
import { createClient } from '@/lib/supabase/server'
import { effectiveHarooType } from '@/lib/utils/permissions'
import type { HarooType, UserRole } from '@/types/domain'
import { type NextRequest, NextResponse } from 'next/server'

const AGRITOGO_URL = process.env.AGRITOGO_API_URL?.replace(/\/$/, '') ?? ''

async function proxy(path: string, init: RequestInit): Promise<Response> {
  if (!AGRITOGO_URL) {
    throw new Error('AGRITOGO_API_URL non configurée')
  }
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15_000)
  try {
    return await fetch(`${AGRITOGO_URL}/api/v1/agrismart/${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function GET(req: NextRequest) {
  try {
    const resource = req.nextUrl.searchParams.get('resource') ?? 'crops'
    if (!['crops', 'soil-types'].includes(resource)) {
      return NextResponse.json({ error: 'resource invalide' }, { status: 400 })
    }
    const upstream = await proxy(resource, { method: 'GET' })
    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch {
    return NextResponse.json(
      { error: 'Service AgriSmart momentanément indisponible' },
      { status: 503 },
    )
  }
}

/**
 * Le détail du calcul (mois par mois, par culture) est réservé aux agronomes,
 * et au titulaire d'une carte membre (PIN). Vérifié ICI, côté serveur, à partir
 * de la session et de public.profiles — jamais d'un champ envoyé par le client.
 * AgriTogo ne renvoie le détail que si la clé interne accompagne l'appel.
 */
async function detailsAllowed(cardNumber: unknown): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('role, haroo_type')
      .eq('id', user.id)
      .maybeSingle<{ role: UserRole; haroo_type: HarooType | null }>()
    if (data && effectiveHarooType(data.role, data.haroo_type) === 'agronome') {
      // Agronome VALIDÉ seulement : le rapport porte son nom comme garant.
      const { data: ag } = await supabase
        .from('haroo_agronome_profiles')
        .select('badge_valide')
        .eq('user_id', user.id)
        .maybeSingle<{ badge_valide: boolean }>()
      if (ag?.badge_valide) return true
    }
  }
  // Carte : seulement pour son titulaire — session de carte ouverte avec le
  // PIN (ou le code SMS), ou compte rattaché à la carte. Connaître le numéro
  // ne suffit plus.
  if (typeof cardNumber === 'string' && cardNumber.trim()) {
    try {
      return (await requirePrivateCard(cardNumber)).ok
    } catch {
      return false
    }
  }
  return false
}

/** Bilan global seul — même forme que la réponse d'AgriTogo sans détail. */
function summaryOnly(data: Record<string, unknown>): Record<string, unknown> {
  const results = Array.isArray(data.results) ? (data.results as Record<string, unknown>[]) : []
  return {
    ...data,
    results: results.map((r) => {
      const k = (r.kpis ?? {}) as Record<string, unknown>
      return {
        crop: r.crop,
        area_m2: r.area_m2,
        planting_month: r.planting_month,
        monthly: [],
        kpis: {
          total_m3: k.total_m3,
          total_boost_m3: k.total_boost_m3,
          total_optimal_m3: k.total_optimal_m3,
        },
      }
    }),
    combined_monthly: [],
    details_locked: true,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { resource = 'calculate', card_number: cardNumber, ...payload } = body
    if (resource !== 'calculate') {
      return NextResponse.json({ error: 'resource invalide' }, { status: 400 })
    }
    const allowed = await detailsAllowed(cardNumber)
    const key = process.env.AGRISMART_INTERNAL_KEY
    const upstream = await proxy('calculate', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: allowed && key ? { 'X-Agrismart-Key': key } : {},
    })
    const data = (await upstream.json()) as Record<string, unknown>
    // Double barrière : même si AgriTogo renvoyait le détail, il ne part pas
    // vers un utilisateur qui n'y a pas droit.
    const out = allowed || data.error ? data : summaryOnly(data)
    return NextResponse.json(out, {
      status: upstream.status,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch {
    return NextResponse.json(
      { error: 'Service AgriSmart momentanément indisponible' },
      { status: 503 },
    )
  }
}
