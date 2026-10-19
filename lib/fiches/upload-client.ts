/**
 * Envoi des fichiers d'un compte d'exploitation depuis le navigateur, dans le
 * dossier PROPRE à la fiche : `<dossier>/<ficheId>/<nom-nettoyé>` (dossier =
 * `plateforme` ou l'id de la faîtière), couverture `<dossier>/<ficheId>.webp`.
 * Le client de stockage est passé en paramètre (doublure possible en test).
 *
 * Ordre voulu par les écrans : brouillon d'abord (le serveur valide les
 * champs et renvoie l'id), fichiers ensuite, PATCH enfin. Un refus du serveur
 * ne laisse donc aucun fichier orphelin hors du dossier de la fiche, et la
 * suppression du brouillon (DELETE) nettoie ce dossier.
 */
import { SERVICE_DOWN_TEXT } from '@/lib/fiches/access-error'
import { COVERS_BUCKET, FICHES_BUCKET } from '@/lib/fiches/files'
import {
  MIME_BY_EXT,
  extensionOfName,
  translateStorageError,
  uniqueStorageName,
} from '@/lib/fiches/upload'

export interface UploadStorage {
  from(bucket: string): {
    upload(
      path: string,
      body: Blob,
      options?: { upsert?: boolean; contentType?: string; cacheControl?: string },
    ): PromiseLike<{ error: { message: string } | null }>
    getPublicUrl(path: string): { data: { publicUrl: string } }
  }
}

export interface UploadedFicheFile {
  name: string
  url: string
  type: string
  size: number
}

/** Dossier racine d'une fiche : `plateforme` (fiche de la plateforme) ou l'id de la faîtière. */
export const ficheRoot = (cooperativeId: string | null | undefined) => cooperativeId || 'plateforme'

/**
 * Envoie les fichiers un par un (progression « 2/3 »). `taken` : noms d'objets
 * déjà présents dans le dossier de la fiche, pour ne jamais écraser un fichier
 * vendu. Lève une Error au message déjà traduit.
 */
export async function uploadFicheFiles(
  storage: UploadStorage,
  opts: {
    root: string
    ficheId: string
    files: File[]
    taken?: Iterable<string>
    onProgress?: (index: number, total: number, name: string) => void
  },
): Promise<UploadedFicheFile[]> {
  const taken = new Set(opts.taken ?? [])
  const out: UploadedFicheFile[] = []
  for (const [i, file] of opts.files.entries()) {
    opts.onProgress?.(i + 1, opts.files.length, file.name)
    const ext = extensionOfName(file.name)
    let objectName = uniqueStorageName(file.name, taken)
    let { error } = await storage
      .from(FICHES_BUCKET)
      .upload(`${opts.root}/${opts.ficheId}/${objectName}`, file, {
        upsert: false,
        contentType: MIME_BY_EXT[ext] ?? file.type,
      })
    // Objet resté d'un essai précédent sous ce nom : nouveau nom, jamais d'écrasement.
    if (error && /already exists|duplicate/i.test(error.message)) {
      taken.add(objectName)
      objectName = uniqueStorageName(file.name, taken)
      ;({ error } = await storage
        .from(FICHES_BUCKET)
        .upload(`${opts.root}/${opts.ficheId}/${objectName}`, file, {
          upsert: false,
          contentType: MIME_BY_EXT[ext] ?? file.type,
        }))
    }
    if (error) throw new Error(translateStorageError(error.message, file.name))
    taken.add(objectName)
    out.push({
      name: file.name,
      url: `${opts.root}/${opts.ficheId}/${objectName}`,
      type: ext,
      size: file.size,
    })
  }
  return out
}

/**
 * Envoie l'image de couverture et renvoie son URL publique. `version` : suffixe
 * pour un remplacement (le bucket n'autorise pas l'écrasement).
 */
export async function uploadFicheCover(
  storage: UploadStorage,
  opts: { root: string; ficheId: string; blob: Blob; version?: string },
): Promise<string> {
  const ext =
    opts.blob.type === 'image/jpeg' ? 'jpg' : opts.blob.type === 'image/png' ? 'png' : 'webp'
  const path = `${opts.root}/${opts.ficheId}${opts.version ? `-${opts.version}` : ''}.${ext}`
  const { error } = await storage
    .from(COVERS_BUCKET)
    .upload(path, opts.blob, { upsert: false, contentType: opts.blob.type || 'image/webp' })
  if (error) throw new Error(translateStorageError(error.message, 'image d’illustration'))
  return storage.from(COVERS_BUCKET).getPublicUrl(path).data.publicUrl
}

/** Appel JSON aux routes fiches ; ne lève jamais (réseau → status 0). */
export async function ficheApi(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, data }
  } catch {
    return {
      ok: false,
      status: 0,
      data: { error: 'Pas de réseau. Vérifiez votre connexion puis réessayez.' },
    }
  }
}

/**
 * Message d'erreur d'une réponse de route, en français. Les refus 4xx du
 * serveur disent déjà quoi corriger et passent tels quels ; une panne (5xx :
 * « Erreur serveur », passerelle 502/503/504 sans corps) devient une consigne.
 */
export function apiErrorText(
  r: { status: number; data: Record<string, unknown> },
  fallback: string,
) {
  if (r.status >= 500) return SERVICE_DOWN_TEXT
  if (r.status === 403 && r.data.error === 'Forbidden')
    return 'Action réservée à l’équipe FaîtiereHub (super-admin).'
  if (r.status === 401) return 'Session expirée : reconnectez-vous puis réessayez.'
  return typeof r.data.error === 'string' && r.data.error ? r.data.error : fallback
}

/**
 * Raison d'un échec, sans point final, pour l'insérer dans une phrase
 * (« Compte non enregistré : <raison>. Rien n’a été mis en ligne. »).
 */
export const reasonOf = (e: unknown): string =>
  String((e as Error)?.message ?? e).replace(/[\s.]+$/, '')
