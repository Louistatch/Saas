// Offres réelles du marché pour le bâtiment « marché » de HarooLife : préventes Haroo
// disponibles et annonces de prévente des producteurs. Lecture seule, compte requis,
// aucun numéro de téléphone ne sort d'ici : la mise en relation passe par Haroo.
import type { Offer } from '@/lib/haroolife/domain/services'
import { getAccessContext } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const query = z.object({
  culture: z.string().trim().max(40).default(''),
  canton: z.string().trim().max(60).default(''),
})
const safe = (s: string) => s.replace(/[%_,()]/g, ' ').trim()

export async function GET(request: NextRequest) {
  if (process.env.HAROOLIFE_ENABLED !== 'true')
    return NextResponse.json({ error: 'HarooLife est en préparation.' }, { status: 503, headers })
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success)
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400, headers })
  const ctx = await getAccessContext({ allowVisitor: true })
  if (!ctx) return NextResponse.json({ error: 'Connexion requise' }, { status: 401, headers })
  if (
    !rateLimit(
      `haroolife-market:${ctx.userId}:${clientKeyFromHeaders(request.headers)}`,
      60,
      60_000,
    ).ok
  )
    return NextResponse.json({ error: 'Trop de demandes.' }, { status: 429, headers })
  const { culture, canton } = parsed.data
  const admin = createAdminClient()

  let presales = admin
    .from('haroo_presales')
    .select(
      'id, culture, quantite_estimee, prix_par_tonne, date_recolte_prevue, description, cantons(name)',
    )
    .eq('statut', 'DISPONIBLE')
    .order('created_at', { ascending: false })
    .limit(30)
  if (culture) presales = presales.ilike('culture', `%${safe(culture)}%`)
  let announcements = admin
    .from('producer_announcements')
    .select('id, title, culture, quantity_kg, price_per_kg_fcfa, location_canton')
    .eq('type', 'prevente')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(30)
  if (culture) announcements = announcements.ilike('culture', `%${safe(culture)}%`)
  if (canton) announcements = announcements.ilike('location_canton', `%${safe(canton)}%`)
  const [{ data: pre }, { data: ann }] = await Promise.all([presales, announcements])

  const offers: Offer[] = []
  for (const p of (pre ?? []) as unknown as {
    id: string
    culture: string
    quantite_estimee: number | null
    prix_par_tonne: number | null
    date_recolte_prevue: string | null
    description: string | null
    cantons: { name: string } | null
  }[]) {
    if (canton && !(p.cantons?.name ?? '').toLowerCase().includes(canton.toLowerCase())) continue
    offers.push({
      id: `presale:${p.id}`,
      kind: 'presale',
      culture: p.culture,
      title: p.description?.trim() || `Prévente de ${p.culture}`,
      quantityKg: p.quantite_estimee == null ? null : Math.round(Number(p.quantite_estimee) * 1000),
      pricePerKg: p.prix_par_tonne == null ? null : Math.round(Number(p.prix_par_tonne) / 1000),
      canton: p.cantons?.name ?? null,
      contactPath: '/haroo#preventes',
    })
  }
  for (const a of (ann ?? []) as {
    id: string
    title: string
    culture: string | null
    quantity_kg: number | null
    price_per_kg_fcfa: number | null
    location_canton: string | null
  }[])
    offers.push({
      id: `announcement:${a.id}`,
      kind: 'announcement',
      culture: a.culture ?? 'Autre',
      title: a.title,
      quantityKg: a.quantity_kg == null ? null : Number(a.quantity_kg),
      pricePerKg: a.price_per_kg_fcfa == null ? null : Number(a.price_per_kg_fcfa),
      canton: a.location_canton,
      contactPath: '/marketplace',
    })
  return NextResponse.json(offers.slice(0, 50), { headers })
}
