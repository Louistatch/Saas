import { requirePrivateCard } from '@/lib/security/card-access'
import { estimateParcelYield } from '@/lib/yield/estimate'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ card_number: string }> },
) {
  const blocked = await applyRateLimit(request, 'verify')
  if (blocked) return blocked

  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`verify:${ip}`, 10, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans quelques instants.' },
      { status: 429 },
    )
  }

  const { card_number } = await params
  const cardNumber = decodeURIComponent(card_number).toUpperCase().trim()

  const access = await requirePrivateCard(cardNumber)
  if (!access.ok) return access.response
  const { card, supabase } = access

  if (!card?.member_id) {
    return NextResponse.json({ error: 'Carte non trouvée.' }, { status: 404 })
  }

  // ⚠️ Avec une session de CARTE (connexion par code SMS), ce client est celui de
  // service : il contourne le RLS. La requête ci-dessous est donc cantonnée
  // EXPLICITEMENT à card.member_id, lu en base par requirePrivateCard — c'est ce
  // filtre, et lui seul, qui empêche de lire les données d'un autre membre.
  // Ne jamais le retirer ni le remplacer par une valeur venue de la requête.
  const supabaseAdmin = supabase
  const { data: parcelles } = await supabaseAdmin
    .from('parcelles')
    .select(
      'id, name, culture_principale, culture_name, superficie_ha, surface_ha, soil_type, irrigation_type, gps_coordinates, campaign_year, source, created_at',
    )
    .eq('member_id', card.member_id)
    .order('created_at', { ascending: false })

  const list = parcelles ?? []
  const total_ha = list.reduce((s, p) => s + (p.superficie_ha ?? p.surface_ha ?? 0), 0)
  const cultures = [
    ...new Set(list.map((p) => p.culture_principale ?? p.culture_name).filter(Boolean)),
  ]

  // Le rendement n'est calculé que sur demande (?yield=1) : d'autres écrans
  // lisent cette route et n'ont pas à attendre le modèle.
  if (request.nextUrl.searchParams.get('yield') !== '1') {
    return NextResponse.json({ parcelles: list, total_ha, cultures })
  }

  // Rendement attendu (modèle FAO-33 d'AgriTogo) et rendement observé quand une
  // production est rattachée à la parcelle — mêmes filtres member_id.
  const { data: member } = await supabaseAdmin
    .from('members')
    .select('region')
    .eq('id', card.member_id)
    .maybeSingle<{ region: string | null }>()
  const ids = list.map((p) => p.id)
  const { data: prods } = ids.length
    ? await supabaseAdmin
        .from('productions')
        .select('parcelle_id, quantity_kg')
        .eq('member_id', card.member_id)
        .in('parcelle_id', ids)
    : { data: [] }
  const producedKg = new Map<string, number>()
  for (const pr of (prods ?? []) as { parcelle_id: string; quantity_kg: number | null }[]) {
    producedKg.set(
      pr.parcelle_id,
      (producedKg.get(pr.parcelle_id) ?? 0) + Number(pr.quantity_kg ?? 0),
    )
  }
  const enriched = await Promise.all(
    list.map(async (p) => {
      const ha = Number(p.superficie_ha ?? p.surface_ha ?? 0) || null
      const kg = producedKg.get(p.id)
      return {
        ...p,
        yield_estimate: await estimateParcelYield({
          crop: p.culture_principale ?? p.culture_name,
          region: member?.region ?? null,
          gps: p.gps_coordinates,
          soilType: p.soil_type,
          irrigation: p.irrigation_type,
          areaHa: ha,
        }),
        observed_t_ha: kg && ha ? Math.round((kg / 1000 / ha) * 100) / 100 : null,
      }
    }),
  )

  return NextResponse.json({ parcelles: enriched, total_ha, cultures })
}
