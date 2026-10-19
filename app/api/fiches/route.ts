import { type CultureReader, accentInsensitivePattern, resolveCulture } from '@/lib/fiches/culture'
import { type FicheStorage, verifyStoredFiles } from '@/lib/fiches/files'
import { createFicheSchema, fieldErrors } from '@/lib/fiches/schema'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

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

    // Filters — culture sans accent ni casse (« Mais » trouve « Maïs »).
    if (culture)
      query = query.filter('culture', 'imatch', accentInsensitivePattern(culture.slice(0, 100)))
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

    return NextResponse.json(
      {
        fiches: data ?? [],
        total: count ?? 0,
        page,
        pageSize,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    )
  } catch (error) {
    log.error('Fiches API error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

/** POST /api/fiches — dépose une fiche technique. */
export async function POST(request: NextRequest) {
  // Même règle qu'au stockage (fonction SQL can_upload_fiches) et qu'à l'écran
  // /dashboard/marketplace : super_admin, ou admin d'une faîtière. Trois
  // endroits, une seule règle — c'est ce qui évite qu'un dépôt passe ici pour
  // échouer plus loin sans message.
  const guard = await assertRole('cooperative_admin')
  if (!guard.ok) return guard.response
  if (guard.ctx.role !== 'super_admin' && guard.ctx.cooperativeLevel !== 'faitiere') {
    return NextResponse.json(
      { error: 'Seules les faîtières peuvent déposer des fiches techniques.' },
      { status: 403 },
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 })
  }

  const parsed = createFicheSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: fieldErrors(parsed.error) },
      { status: 400 },
    )
  }

  // `cooperative_id` est NOT NULL : on rattache la fiche à l'organisation de
  // l'auteur plutôt que de la laisser choisir, ce qui évite qu'un super_admin
  // dépose au nom d'une coopérative au hasard.
  const { platform, ...fields } = parsed.data
  const isPlatform =
    guard.ctx.role === 'super_admin' && (platform === true || !guard.ctx.cooperativeId)
  const cooperativeId = isPlatform ? null : guard.ctx.cooperativeId
  if (!isPlatform && !cooperativeId) {
    return NextResponse.json(
      { error: "Votre compte n'est rattaché à aucune organisation." },
      { status: 400 },
    )
  }

  try {
    const admin = createAdminClient()
    // Culture enregistrée sous le nom du référentiel (« Maïs » → « Mais »).
    const culture = await resolveCulture(admin as unknown as CultureReader, fields.culture)
    if (!culture.ok)
      return NextResponse.json(
        { error: culture.error, details: { culture: [culture.error] } },
        { status: 400 },
      )

    // Fichiers recontrôlés avec le client de service : dossier de l'auteur,
    // présence réelle, taille/type du stockage et signature des premiers octets.
    let files = fields.files
    if (files.length > 0) {
      const verified = await verifyStoredFiles(
        admin.storage as unknown as FicheStorage,
        files,
        { platform: isPlatform, cooperativeId },
        { log },
      )
      if (!verified.ok)
        return NextResponse.json(
          { error: verified.error, details: { files: [verified.error] } },
          { status: verified.status },
        )
      files = verified.files
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('fiches_techniques')
      .insert({ ...fields, culture: culture.name, files, cooperative_id: cooperativeId })
      .select('id, title, culture, type_agriculture, status, cooperative_id')
      .single()

    if (error) {
      // Refus de la RLS (42501) : le rôle passe le garde ci-dessus mais n'a
      // pas (encore) le droit d'écrire la fiche. On le dit, plutôt qu'un 500.
      if (error.code === '42501') {
        log.warn('Fiche insert refused by RLS', { role: guard.ctx.role })
        return NextResponse.json(
          {
            error:
              'Votre compte ne peut pas encore publier de compte d’exploitation. Contactez FaîtiereHub pour le mettre en vente.',
          },
          { status: 403 },
        )
      }
      log.error('Fiche insert failed', error)
      return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 })
    }
    return NextResponse.json({ fiche: data }, { status: 201 })
  } catch (error) {
    log.error('Fiche create error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
