import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { assertRole } from '@/lib/security/assert-access'
import { TYPE_AGRICULTURE_KEYS } from '@/lib/fiches/types'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'

const log = createLogger('api:fiches')

/**
 * GET /api/fiches?culture=Maïs&canton_id=xxx&prefecture_id=xxx
 * Public catalog of published fiches techniques.
 * Returns metadata only (not file URLs — those require auth or purchase).
 */
export async function GET(request: NextRequest) {
  // Rate limit: 120 requests per minute per IP (generous for catalog browsing)
  const limit = rateLimit(`fiches-catalog:${clientKeyFromHeaders(request.headers)}`, 120, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const culture = searchParams.get('culture')
  const typeAgriculture = searchParams.get('type_agriculture')
  const cantonId = searchParams.get('canton_id')
  const prefectureId = searchParams.get('prefecture_id')
  const regionId = searchParams.get('region_id')
  const page = Number.parseInt(searchParams.get('page') ?? '1')
  const pageSize = Math.min(Number.parseInt(searchParams.get('limit') ?? '20'), 50)

  try {
    const supabase = await createClient()

    let query = supabase
      .from('fiches_techniques')
      .select(
        'id, title, description, culture, type_agriculture, campaign, price_non_member, currency, is_free_for_members, download_count, created_at, canton:cantons(id, name), prefecture:prefectures(id, name), region:regions(id, name)',
        { count: 'exact' },
      )
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    // Filters
    if (culture) query = query.eq('culture', culture)
    if (typeAgriculture) query = query.eq('type_agriculture', typeAgriculture)
    if (cantonId) query = query.eq('canton_id', cantonId)
    if (prefectureId) query = query.eq('prefecture_id', prefectureId)
    if (regionId) query = query.eq('region_id', regionId)

    // Pagination
    const from = (page - 1) * pageSize
    query = query.range(from, from + pageSize - 1)

    const { data, error, count } = await query

    if (error) {
      log.error('Fiches query error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({
      fiches: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    log.error('Fiches API error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

const ficheFileSchema = z.object({
  name: z.string().min(1).max(300),
  // Chemin dans le bucket privé, jamais une URL publique : le fichier n'est
  // servi que par URL signée (voir app/api/fiches/[id]/access).
  url: z.string().min(1).max(500),
  type: z.string().max(120).default(''),
  size: z.number().int().nonnegative().optional(),
})

const createFicheSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  culture: z.string().trim().min(1).max(100),
  type_agriculture: z.enum(TYPE_AGRICULTURE_KEYS as [string, ...string[]]),
  campaign: z.string().trim().max(50).optional(),
  region_id: z.string().uuid().optional(),
  prefecture_id: z.string().uuid().optional(),
  canton_id: z.string().uuid().optional(),
  files: z.array(ficheFileSchema).min(1).max(20),
  // 0 = accès libre. C'est ce que lit /access pour ouvrir la fiche sans carte
  // ni achat — la gratuité du lancement est portée par la donnée.
  price_non_member: z.number().int().nonnegative().max(1_000_000).default(0),
  is_free_for_members: z.boolean().default(true),
  status: z.enum(['draft', 'published']).default('published'),
})

/**
 * POST /api/fiches — dépose une fiche technique.
 *
 * Réservé au super_admin : c'est aujourd'hui la seule personne qui produit ces
 * fichiers. Le jour où les coopératives déposeront les leurs, c'est ce garde
 * qu'il faudra ouvrir, et lui seul.
 */
export async function POST(request: NextRequest) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 })
  }

  const parsed = createFicheSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  // `cooperative_id` est NOT NULL : on rattache la fiche à l'organisation de
  // l'auteur plutôt que de la laisser choisir, ce qui évite qu'un super_admin
  // dépose au nom d'une coopérative au hasard.
  const cooperativeId = guard.ctx.cooperativeId
  if (!cooperativeId) {
    return NextResponse.json(
      { error: "Votre compte n'est rattaché à aucune organisation." },
      { status: 400 },
    )
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('fiches_techniques')
      .insert({ ...parsed.data, cooperative_id: cooperativeId })
      .select('id, title, culture, type_agriculture, status')
      .single()

    if (error) {
      log.error('Fiche insert failed', error)
      return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 })
    }
    return NextResponse.json({ fiche: data }, { status: 201 })
  } catch (error) {
    log.error('Fiche create error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
