/**
 * GET /api/parcelles/[id]/yield — rendement attendu d'une parcelle (modèle
 * FAO-33 d'AgriTogo) et rendement observé si une production y est rattachée.
 * Lecture avec le client de SESSION : le RLS ne laisse voir que les parcelles
 * du périmètre de l'utilisateur (sa coopérative et ses descendantes).
 */

import { createClient } from '@/lib/supabase/server'
import { estimateParcelYield } from '@/lib/yield/estimate'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

interface ParcelRow {
  id: string
  culture_principale: string | null
  culture_name: string | null
  superficie_ha: number | null
  surface_ha: number | null
  soil_type: string | null
  irrigation_type: string | null
  gps_coordinates: string | null
  members: { region: string | null } | null
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Parcelle introuvable' }, { status: 404 })
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: p } = await supabase
    .from('parcelles')
    .select(
      'id, culture_principale, culture_name, superficie_ha, surface_ha, soil_type, irrigation_type, gps_coordinates, members(region)',
    )
    .eq('id', id)
    .maybeSingle<ParcelRow>()
  if (!p) return NextResponse.json({ error: 'Parcelle introuvable' }, { status: 404 })

  const ha = Number(p.superficie_ha ?? p.surface_ha ?? 0) || null
  const { data: prods } = await supabase
    .from('productions')
    .select('quantity_kg')
    .eq('parcelle_id', id)
  const kg = (prods ?? []).reduce(
    (s, r: { quantity_kg: number | null }) => s + Number(r.quantity_kg ?? 0),
    0,
  )

  const estimate = await estimateParcelYield({
    crop: p.culture_principale ?? p.culture_name,
    region: p.members?.region ?? null,
    gps: p.gps_coordinates,
    soilType: p.soil_type,
    irrigation: p.irrigation_type,
    areaHa: ha,
  })
  return NextResponse.json(
    { estimate, observed_t_ha: kg && ha ? Math.round((kg / 1000 / ha) * 100) / 100 : null },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
