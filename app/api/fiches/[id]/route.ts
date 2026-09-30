import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertRole } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { TYPE_AGRICULTURE_KEYS, type FicheFile } from '@/lib/fiches/types'

const log = createLogger('api:fiches:manage')

const patchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  culture: z.string().trim().min(1).max(100).optional(),
  type_agriculture: z.enum(TYPE_AGRICULTURE_KEYS as [string, ...string[]]).optional(),
  campaign: z.string().trim().max(50).nullable().optional(),
  region_id: z.string().uuid().nullable().optional(),
  prefecture_id: z.string().uuid().nullable().optional(),
  canton_id: z.string().uuid().nullable().optional(),
  price_non_member: z.number().int().nonnegative().max(1_000_000).optional(),
  is_free_for_members: z.boolean().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
})

/** PATCH /api/fiches/[id] — corriger un prix, dépublier, reclasser. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const { id } = await params

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à modifier' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('fiches_techniques')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, title, status, price_non_member')
      .single()

    if (error) {
      log.error('Fiche update failed', error)
      return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
    }
    return NextResponse.json({ fiche: data })
  } catch (error) {
    log.error('Fiche patch error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

/**
 * DELETE /api/fiches/[id] — retire la fiche ET ses fichiers.
 *
 * Les fichiers sont supprimés du bucket AVANT la ligne : l'inverse laisserait
 * des objets orphelins que plus rien ne référence, donc que personne ne
 * retrouverait pour les effacer.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const { id } = await params

  try {
    const supabase = await createClient()

    const { data: fiche } = await supabase
      .from('fiches_techniques')
      .select('id, files')
      .eq('id', id)
      .maybeSingle()

    if (!fiche) {
      return NextResponse.json({ error: 'Fiche introuvable' }, { status: 404 })
    }

    const paths = ((fiche.files as unknown as FicheFile[]) ?? [])
      .map((f) => (f.url?.includes('/fiches-techniques/') ? f.url.split('/fiches-techniques/')[1] : f.url))
      .filter((p): p is string => Boolean(p))

    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from('fiches-techniques').remove(paths)
      // Un fichier déjà absent ne doit pas empêcher de retirer la fiche du
      // catalogue : on le note et on continue.
      if (storageError) log.warn('Fiche files removal failed', { id, message: storageError.message })
    }

    const { error } = await supabase.from('fiches_techniques').delete().eq('id', id)
    if (error) {
      log.error('Fiche delete failed', error)
      return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })
    }
    return NextResponse.json({ deleted: id })
  } catch (error) {
    log.error('Fiche delete error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
