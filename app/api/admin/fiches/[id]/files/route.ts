import {
  FICHES_BUCKET,
  safeDownloadName,
  storagePathOf,
  validateFichePath,
} from '@/lib/fiches/files'
import type { FicheFile } from '@/lib/fiches/types'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import { type NextRequest, NextResponse } from 'next/server'

const log = createLogger('api:admin:fiches:files')

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const LINK_TTL_S = 600

/**
 * GET /api/admin/fiches/[id]/files — liens de téléchargement (10 min, nom
 * d'origine) des fichiers d'une fiche, pour son VENDEUR : super_admin, ou admin
 * de la faîtière propriétaire (cooperative_id = fiche.cooperative_id).
 *
 * Le bucket reste sans politique SELECT pour le navigateur : c'est ce serveur
 * qui signe, après ce contrôle, avec le client de service.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await assertRole('cooperative_admin')
  if (!guard.ok) return guard.response

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Fiche invalide' }, { status: 400 })

  const admin = createAdminClient()
  const { data: fiche } = await admin
    .from('fiches_techniques')
    .select('id, cooperative_id, files')
    .eq('id', id)
    .maybeSingle<{ id: string; cooperative_id: string | null; files: FicheFile[] | null }>()
  if (!fiche) return NextResponse.json({ error: 'Fiche introuvable' }, { status: 404 })

  const { ctx } = guard
  const isOwner =
    ctx.role === 'super_admin' ||
    (ctx.cooperativeLevel === 'faitiere' &&
      fiche.cooperative_id !== null &&
      ctx.cooperativeId === fiche.cooperative_id)
  if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storage = admin.storage.from(FICHES_BUCKET)
  const scope = {
    platform: fiche.cooperative_id === null,
    cooperativeId: fiche.cooperative_id,
    ficheId: id,
  }
  const files = await Promise.all(
    (fiche.files ?? []).map(async (f) => {
      const path = storagePathOf(f.url)
      const base = { name: f.name, type: f.type, size: f.size ?? null }
      if (!validateFichePath(path, scope)) {
        log.warn('Fiche file outside owner folder, not signed', { id, path })
        return { ...base, url: null, error: 'Fichier indisponible' }
      }
      const { data, error } = await storage.createSignedUrl(path, LINK_TTL_S, {
        download: safeDownloadName(f.name),
      })
      if (!data?.signedUrl) {
        log.error('Fiche file signing failed', { id, path, message: error?.message })
        return { ...base, url: null, error: 'Fichier indisponible' }
      }
      return { ...base, url: data.signedUrl }
    }),
  )
  return NextResponse.json({ files }, { headers: { 'Cache-Control': 'no-store' } })
}
