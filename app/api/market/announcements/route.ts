/**
 * Marché de proximité — API publique.
 *
 * GET  : recherche ouverte, y compris aux visiteurs anonymes. C'est le point
 *        qui manquait : les annonces étaient écrites depuis /verify mais
 *        aucune page ne les lisait, donc personne ne les voyait jamais.
 * POST : publication, réservée aux comptes connectés. L'auteur est toujours
 *        pris de la session, jamais du corps de la requête.
 */

import {
  type AnnouncementType,
  resolveViewerZone,
  searchAnnouncements,
} from '@/lib/market/announcements'
import { createClient } from '@/lib/supabase/server'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const TYPES = ['job', 'prevente', 'mission', 'autre'] as const

export async function GET(request: NextRequest) {
  const limited = rateLimit(`market-search:${clientKeyFromHeaders(request.headers)}`, 60, 60_000)
  if (!limited.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })

  const url = new URL(request.url)
  const typeParam = url.searchParams.get('type')
  const type = TYPES.includes(typeParam as AnnouncementType)
    ? (typeParam as AnnouncementType)
    : undefined

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Zone explicite (l'utilisateur a choisi dans le filtre) ; à défaut, celle
  // déduite de son profil. Un visiteur anonyme n'a pas de zone : il voit les
  // annonces les plus récentes, sans tri de proximité.
  const cantonParam = url.searchParams.get('canton')
  const prefectureParam = url.searchParams.get('prefecture')
  const regionParam = url.searchParams.get('region')
  const explicitZone = cantonParam || prefectureParam || regionParam

  const zone = explicitZone
    ? { cantonId: cantonParam, prefectureId: prefectureParam, regionId: regionParam }
    : user
      ? await resolveViewerZone(supabase, user.id)
      : {}

  try {
    const announcements = await searchAnnouncements(supabase, {
      zone,
      type,
      query: url.searchParams.get('q') ?? undefined,
      limit: Number(url.searchParams.get('limit')) || 60,
    })
    return NextResponse.json(
      { announcements, zone_known: Boolean(zone.cantonId || zone.prefectureId || zone.regionId) },
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    )
  } catch {
    return NextResponse.json({ error: 'Recherche indisponible' }, { status: 503 })
  }
}

const createSchema = z.object({
  type: z.enum(TYPES),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
  culture: z.string().trim().max(80).optional(),
  quantity_kg: z.number().positive().max(10_000_000).optional(),
  price_per_kg_fcfa: z.number().positive().max(10_000_000).optional(),
  contact_phone: z.string().trim().max(30).optional(),
  canton_id: z.string().uuid().optional(),
  prefecture_id: z.string().uuid().optional(),
  region_id: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  const limited = rateLimit(`market-publish:${clientKeyFromHeaders(request.headers)}`, 10, 600_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Trop de publications. Réessayez plus tard.' },
      { status: 429 },
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Connectez-vous pour publier' }, { status: 401 })
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Annonce invalide' }, { status: 400 })
  }
  const input = parsed.data

  // author_id vient de la session : publier au nom d'autrui est impossible,
  // et la policy WITH CHECK le refuserait de toute façon.
  const { data, error } = await supabase
    .from('producer_announcements')
    .insert({
      author_id: user.id,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      culture: input.culture ?? null,
      quantity_kg: input.quantity_kg ?? null,
      price_per_kg_fcfa: input.price_per_kg_fcfa ?? null,
      contact_phone: input.contact_phone ?? null,
      canton_id: input.canton_id ?? null,
      prefecture_id: input.prefecture_id ?? null,
      region_id: input.region_id ?? null,
      status: 'active',
    })
    .select('id')
    .single<{ id: string }>()

  if (error || !data) {
    return NextResponse.json({ error: 'Publication impossible' }, { status: 502 })
  }
  return NextResponse.json({ id: data.id }, { status: 201 })
}
