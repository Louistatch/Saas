import { accentInsensitivePattern, searchLikePattern } from '@/lib/fiches/culture'
import type { FicheFile } from '@/lib/fiches/types'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const log = createLogger('api:fiches:public')

/**
 * GET /api/fiches/public
 *
 * Public endpoint listing PUBLISHED fiches techniques (comptes d'exploitation).
 * Used by the public marketplace page to show available fiches with filters.
 *
 * Query params:
 *   - id (une seule fiche : lien « Voir dans la boutique », /marketplace?fiche=<id>)
 *   - q (search, coupée à 100 caractères)
 *   - culture
 *   - type_agriculture
 *   - region_id, prefecture_id, canton_id
 *   - cooperative_id
 *   - page (default 1)
 *   - limit (default 20, max 50)
 *
 * Returns: { fiches, total, page, pageSize }
 *
 * Security:
 *   - Rate limited (120 req/min/IP)
 *   - Only returns status='published'
 *   - Aucun chemin ni nom de stockage : seul un résumé du contenu vendu
 *     (files_summary [{type, size}], files_count). Le téléchargement exige
 *     POST /api/fiches/[id]/access (gratuité, carte ou achat).
 */
export async function GET(request: NextRequest) {
  const persistentBlock = await applyRateLimit(request, 'marketplace')
  if (persistentBlock) return persistentBlock

  const limit = rateLimit(`fiches-public:${clientKeyFromHeaders(request.headers)}`, 120, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const culture = searchParams.get('culture')
  const typeAgriculture = searchParams.get('type_agriculture')
  const cantonId = searchParams.get('canton_id')
  const prefectureId = searchParams.get('prefecture_id')
  const regionId = searchParams.get('region_id')
  const cooperativeId = searchParams.get('cooperative_id')
  const search = searchParams.get('q')
  const ficheId = searchParams.get('id')
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1'))
  const pageSize = Math.min(Number.parseInt(searchParams.get('limit') ?? '20'), 50)

  try {
    const supabase = await createClient()

    let query = supabase
      .from('fiches_techniques')
      .select(
        `id, title, description, culture, type_agriculture, campaign,
         price_non_member, is_free_for_members, download_count, created_at, cooperative_id, cover_url, files,
         cooperatives(name, faitiere_name),
         region:region_id(id, name), prefecture:prefecture_id(id, name), canton:canton_id(id, name)`,
        { count: 'exact' },
      )
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    // Culture sans accent ni casse : « Mais » trouve « Maïs » (opérateur
    // PostgREST imatch, expression ancrée et échappée).
    if (culture) {
      const parsedCulture = z.string().trim().min(1).max(100).safeParse(culture)
      if (!parsedCulture.success)
        return NextResponse.json({ error: 'Invalid culture parameter' }, { status: 400 })
      query = query.filter('culture', 'imatch', accentInsensitivePattern(parsedCulture.data))
    }
    if (ficheId) {
      if (!z.string().uuid().safeParse(ficheId).success)
        return NextResponse.json({ error: 'Invalid id parameter' }, { status: 400 })
      query = query.eq('id', ficheId)
    }
    if (typeAgriculture) query = query.eq('type_agriculture', typeAgriculture)
    if (cantonId) query = query.eq('canton_id', cantonId)
    if (prefectureId) query = query.eq('prefecture_id', prefectureId)
    if (regionId) query = query.eq('region_id', regionId)
    if (cooperativeId) query = query.eq('cooperative_id', cooperativeId)

    // Jokers échappés, séparateurs PostgREST remplacés par `_` (un titre avec
    // virgules se retrouve), texte coupé à 100 caractères : lib/fiches/culture.
    if (search?.trim()) {
      const pattern = searchLikePattern(search)
      query = query.or(
        `title.ilike.${pattern},description.ilike.${pattern},culture.ilike.${pattern}`,
      )
    }

    const from = (page - 1) * pageSize
    query = query.range(from, from + pageSize - 1)

    const { data, error, count } = await query

    if (error) {
      log.error('Public fiches query error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    const fiches = (data ?? []).map((row) => {
      const { files, ...rest } = row as typeof row & { files: FicheFile[] | null }
      const list = Array.isArray(files) ? files : []
      return {
        ...rest,
        files_count: list.length,
        files_summary: list.map((f) => ({
          type: String(f.type ?? '').toLowerCase(),
          size: typeof f.size === 'number' ? f.size : null,
        })),
      }
    })

    return NextResponse.json(
      { fiches, total: count ?? 0, page, pageSize },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      },
    )
  } catch (error) {
    log.error('Public fiches API error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
