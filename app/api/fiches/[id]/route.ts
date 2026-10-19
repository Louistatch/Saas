import { type CultureReader, resolveCulture } from '@/lib/fiches/culture'
import {
  COVERS_BUCKET,
  FICHES_BUCKET,
  type FicheStorage,
  storagePathOf,
  validateFichePath,
  verifyStoredFiles,
} from '@/lib/fiches/files'
import { canManageFiche } from '@/lib/fiches/publishing'
import {
  CONFIRM_FREE_REQUIRED,
  PUBLISH_NEEDS_FILE,
  fieldErrors,
  patchFicheSchema,
} from '@/lib/fiches/schema'
import type { FicheFile } from '@/lib/fiches/types'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { type NextRequest, NextResponse } from 'next/server'

const log = createLogger('api:fiches:manage')

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

interface ManagedFiche {
  id: string
  status: string
  price_non_member: number
  files: FicheFile[] | null
  cooperative_id: string | null
  cover_url: string | null
}

// Qui gère une fiche : lib/fiches/publishing.ts (super_admin ; faîtière propriétaire seulement
// si la publication des faîtières est rouverte).

const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

/** Dossier propre à une fiche : `plateforme/<id>` ou `<cooperative_id>/<id>`. */
const ficheFolder = (f: Pick<ManagedFiche, 'id' | 'cooperative_id'>) =>
  `${f.cooperative_id ?? 'plateforme'}/${f.id}`

/** Supprime des objets et journalise tout écart entre demandé et effacé. */
async function removeObjects(
  storage: FicheStorage,
  bucket: string,
  paths: string[],
  context: Record<string, unknown>,
) {
  if (paths.length === 0) return
  const { data, error } = await storage.from(bucket).remove(paths)
  if (error) {
    log.error('Storage removal failed', { ...context, bucket, paths, message: error.message })
    return
  }
  if ((data?.length ?? 0) !== paths.length)
    log.warn('Storage removal incomplete', {
      ...context,
      bucket,
      requested: paths.length,
      removed: data?.length ?? 0,
      paths,
    })
}

/** Objets du dossier propre à la fiche (sous-dossier `<id>/`). */
async function listFicheFolder(storage: FicheStorage, fiche: ManagedFiche): Promise<string[]> {
  const folder = ficheFolder(fiche)
  const { data, error } = await storage.from(FICHES_BUCKET).list(folder, { limit: 1000 })
  if (error) {
    log.warn('Fiche folder listing failed', { id: fiche.id, folder, message: error.message })
    return []
  }
  return (data ?? [])
    .filter((o) => o.name && o.name !== '.emptyFolderPlaceholder')
    .map((o) => `${folder}/${o.name}`)
}

/** PATCH /api/fiches/[id] — corriger un prix, dépublier, reclasser, remplacer les fichiers. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await assertRole('cooperative_admin')
  if (!guard.ok) return guard.response

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Fiche invalide' }, { status: 400 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 })
  }

  const parsed = patchFicheSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: fieldErrors(parsed.error) },
      { status: 400 },
    )
  }
  const { confirm_free, files, ...fields } = parsed.data
  if (Object.keys(fields).length === 0 && files === undefined) {
    return NextResponse.json({ error: 'Aucun champ à modifier' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const { data: current } = await admin
      .from('fiches_techniques')
      .select('id, status, price_non_member, files, cooperative_id, cover_url')
      .eq('id', id)
      .maybeSingle<ManagedFiche>()
    if (!current) return NextResponse.json({ error: 'Fiche introuvable' }, { status: 404 })
    if (!canManageFiche(guard.ctx, current)) return forbidden()

    // Un brouillon ne s'ouvre à personne, acheteurs compris (lib/fiches/access-policy.ts) :
    // une fiche vendue se retire de la vente (archivée), elle ne repasse pas en brouillon.
    if (fields.status === 'draft' && current.status !== 'draft') {
      const { count, error: countError } = await admin
        .from('purchases')
        .select('id', { count: 'exact', head: true })
        .eq('fiche_id', id)
        .eq('payment_status', 'completed')
      if (countError) {
        log.error('Fiche purchases count failed', countError)
        return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
      }
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              'Ce compte a été vendu : retirez-le de la vente au lieu de le repasser en brouillon. Les acheteurs gardent leur fichier.',
            purchases: count,
          },
          { status: 409 },
        )
      }
    }

    // Un compte payant ne devient pas gratuit par un champ vidé : il faut le dire.
    if (
      fields.price_non_member === 0 &&
      (current.price_non_member ?? 0) > 0 &&
      confirm_free !== true
    ) {
      return NextResponse.json(
        { error: CONFIRM_FREE_REQUIRED, details: { price_non_member: [CONFIRM_FREE_REQUIRED] } },
        { status: 400 },
      )
    }

    const update: Record<string, unknown> = { ...fields }

    if (fields.culture !== undefined) {
      const culture = await resolveCulture(admin as unknown as CultureReader, fields.culture)
      if (!culture.ok)
        return NextResponse.json(
          { error: culture.error, details: { culture: [culture.error] } },
          { status: 400 },
        )
      update.culture = culture.name
    }

    let nextFiles: FicheFile[] | null = null
    if (files !== undefined) {
      const verified = await verifyStoredFiles(
        admin.storage as unknown as FicheStorage,
        files,
        {
          platform: current.cooperative_id === null,
          cooperativeId: current.cooperative_id,
          ficheId: id,
        },
        { alreadyReferenced: current.files ?? [], log },
      )
      if (!verified.ok)
        return NextResponse.json(
          { error: verified.error, details: { files: [verified.error] } },
          { status: verified.status },
        )
      nextFiles = verified.files
      update.files = nextFiles
    }

    // Mettre en vente exige au moins un fichier, que les fichiers changent ou non.
    const nextStatus = fields.status ?? current.status
    const effectiveFiles = nextFiles ?? current.files ?? []
    if (
      nextStatus === 'published' &&
      (fields.status === 'published' || nextFiles !== null) &&
      effectiveFiles.length === 0
    ) {
      return NextResponse.json(
        { error: PUBLISH_NEEDS_FILE, details: { files: [PUBLISH_NEEDS_FILE] } },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('fiches_techniques')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, title, status, price_non_member, culture, files')
      .single()

    if (error) {
      log.error('Fiche update failed', error)
      return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
    }

    // Fichiers remplacés : les objets du dossier propre à la fiche qui ne sont
    // plus référencés sont effacés (client de service : aucune politique
    // SELECT sur le bucket, remove() échouerait en silence avec la session).
    if (nextFiles) {
      const kept = new Set(nextFiles.map((f) => storagePathOf(f.url)))
      const stale = (
        await listFicheFolder(admin.storage as unknown as FicheStorage, current)
      ).filter((p) => !kept.has(p))
      await removeObjects(admin.storage as unknown as FicheStorage, FICHES_BUCKET, stale, { id })
    }

    // Couverture remplacée : l'ancienne image est effacée, seulement si elle
    // suit le nommage propre à la fiche (`<dossier>/<id>…`) — jamais l'image
    // d'une autre fiche, même enregistrée par erreur.
    if (
      fields.cover_url !== undefined &&
      current.cover_url &&
      current.cover_url !== fields.cover_url
    ) {
      const oldPath = current.cover_url.split(`/${COVERS_BUCKET}/`)[1]?.split(/[?#]/)[0]
      if (oldPath && !oldPath.includes('..') && oldPath.startsWith(ficheFolder(current)))
        await removeObjects(admin.storage as unknown as FicheStorage, COVERS_BUCKET, [oldPath], {
          id,
        })
    }

    return NextResponse.json({ fiche: data })
  } catch (error) {
    log.error('Fiche patch error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

/**
 * DELETE /api/fiches/[id] — supprime une fiche JAMAIS vendue, et ses fichiers.
 *
 * Une fiche qui a des achats (tous statuts : un « pending » ou un « failed »
 * a pu être débité) se retire de la vente (status = 'archived') mais ne se
 * supprime pas : 409. Sinon, tout passe par le client de service :
 * remove() exige SELECT + DELETE sur storage.objects, et aucune politique
 * SELECT n'existe sur le bucket privé — avec la session, les fichiers
 * resteraient en place sans la moindre erreur.
 *
 * La ligne est supprimée AVANT les fichiers : si un achat arrive entre le
 * comptage et la suppression, la contrainte (ON DELETE RESTRICT, migration
 * 20261018_100000) fait échouer la suppression et le fichier vendu reste
 * intact. Un objet qui n'aurait pas pu être effacé est journalisé avec son
 * chemin.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await assertRole('cooperative_admin')
  if (!guard.ok) return guard.response

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Fiche invalide' }, { status: 400 })

  try {
    const admin = createAdminClient()

    const { data: fiche } = await admin
      .from('fiches_techniques')
      .select('id, status, price_non_member, files, cooperative_id, cover_url')
      .eq('id', id)
      .maybeSingle<ManagedFiche>()

    if (!fiche) {
      return NextResponse.json({ error: 'Fiche introuvable' }, { status: 404 })
    }
    if (!canManageFiche(guard.ctx, fiche)) return forbidden()

    const { count, error: countError } = await admin
      .from('purchases')
      .select('id', { count: 'exact', head: true })
      .eq('fiche_id', id)
    if (countError) {
      log.error('Fiche purchases count failed', countError)
      return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `Ce compte a ${count} achat(s) enregistré(s), même en attente : retirez-le de la vente au lieu de le supprimer. Les acheteurs gardent leur fichier.`,
          purchases: count,
        },
        { status: 409 },
      )
    }

    const { error } = await admin.from('fiches_techniques').delete().eq('id', id)
    if (error) {
      if (error.code === '23503') {
        return NextResponse.json(
          { error: 'Ce compte a des ventes : retirez-le de la vente au lieu de le supprimer' },
          { status: 409 },
        )
      }
      log.error('Fiche delete failed', error)
      return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })
    }

    const storage = admin.storage as unknown as FicheStorage
    const scope = {
      platform: fiche.cooperative_id === null,
      cooperativeId: fiche.cooperative_id,
      ficheId: id,
    }
    // Seuls les chemins du dossier du propriétaire sont effacés : un chemin
    // étranger enregistré par erreur ne doit jamais supprimer le fichier d'un autre.
    const referenced = (fiche.files ?? [])
      .map((f) => storagePathOf(f.url))
      .filter((p) => {
        const ok = validateFichePath(p, scope)
        if (!ok && p) log.warn('Fiche file outside owner folder, not removed', { id, path: p })
        return ok
      })
    const folder = await listFicheFolder(storage, fiche)
    await removeObjects(storage, FICHES_BUCKET, [...new Set([...referenced, ...folder])], { id })

    // Couverture (bucket public) : chemin tiré de cover_url, sans paramètres.
    const coverPath = fiche.cover_url?.split(`/${COVERS_BUCKET}/`)[1]?.split(/[?#]/)[0]
    if (coverPath && !coverPath.includes('..'))
      await removeObjects(storage, COVERS_BUCKET, [coverPath], { id })

    return NextResponse.json({ deleted: id })
  } catch (error) {
    log.error('Fiche delete error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
