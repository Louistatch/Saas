/**
 * Fichiers vendus (bucket PRIVÉ `fiches-techniques`) : règles de chemin, nom de
 * téléchargement et contrôle du contenu réel. Sans `server-only` et sans
 * import de client : le client de stockage est passé en paramètre, ce qui rend
 * tout testable avec un faux stockage.
 */

import type { FicheFile } from '@/lib/fiches/types'

export const FICHES_BUCKET = 'fiches-techniques'
export const COVERS_BUCKET = 'fiches-covers'

/** Extensions vendues, et la famille de signature attendue pour chacune. */
export const FICHE_EXTENSIONS = ['pdf', 'xlsx', 'docx', 'xls', 'doc'] as const
export type FicheExtension = (typeof FICHE_EXTENSIONS)[number]

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const UUID_RE = new RegExp(`^${UUID}$`)
const NAME = '[A-Za-z0-9._-]+'

export interface FichePathScope {
  /** Fiche de la plateforme (super_admin, cooperative_id NULL). */
  platform: boolean
  /** Organisation propriétaire de la fiche (faîtière). */
  cooperativeId: string | null
  /** Id de la fiche quand il existe déjà (PATCH) : autorise le sous-dossier <ficheId>/. */
  ficheId?: string | null
}

/** Chemin de stockage d'une entrée `files` (anciennes lignes : URL complète). */
export function storagePathOf(url: string | null | undefined): string {
  const u = String(url ?? '')
  return u.includes('/storage/') ? (u.split(`/${FICHES_BUCKET}/`)[1] ?? '') : u
}

/**
 * Un chemin n'est accepté que DANS le dossier de son auteur :
 * `plateforme/…` pour une fiche plateforme, `<cooperative_id>/…` pour une
 * faîtière, éventuellement dans le sous-dossier `<ficheId>/`. Jamais de « .. »,
 * de « / » en tête, ni de dossier d'une autre organisation.
 */
export function validateFichePath(path: string, scope: FichePathScope): boolean {
  if (typeof path !== 'string' || path.length === 0 || path.length > 500) return false
  if (path.startsWith('/') || path.includes('..') || path.includes('\\')) return false
  // biome-ignore lint/suspicious/noControlCharactersInRegex: refus explicite des caractères de contrôle
  if (/[\u0000-\u001f\u007f]/.test(path)) return false
  let root: string
  if (scope.platform) root = 'plateforme'
  else if (scope.cooperativeId && UUID_RE.test(scope.cooperativeId)) root = scope.cooperativeId
  else return false
  const sub = scope.ficheId && UUID_RE.test(scope.ficheId) ? `(?:${scope.ficheId}/)?` : ''
  const escapedRoot = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escapedRoot}/${sub}${NAME}$`).test(path)
}

/** Nom proposé au téléchargement : sans « / », « \ » ni caractère de contrôle. */
export function safeDownloadName(name: string | null | undefined): string {
  const cleaned = String(name ?? '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: nettoyage des caractères de contrôle
    .replace(/[/\\\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  return cleaned || 'fichier'
}

export function extensionOf(path: string): string {
  const base = path.split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

/**
 * Le contenu correspond-il à l'extension ? Lecture des 8 premiers octets :
 *   - PDF : « %PDF » ;
 *   - xlsx / docx (Office Open XML, archive ZIP) : PK\x03\x04 ;
 *   - xls / doc (OLE2, Office 97-2003) : D0 CF 11 E0.
 */
export function checkFileSignature(ext: string, bytes: Uint8Array): boolean {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b)
  switch (ext.toLowerCase()) {
    case 'pdf':
      return starts([0x25, 0x50, 0x44, 0x46])
    case 'xlsx':
    case 'docx':
      return starts([0x50, 0x4b, 0x03, 0x04])
    case 'xls':
    case 'doc':
      return starts([0xd0, 0xcf, 0x11, 0xe0])
    default:
      return false
  }
}

/** Sous-ensemble du client de stockage Supabase utilisé ici (doublure possible en test). */
export interface FicheStorage {
  from(bucket: string): {
    list(
      path: string,
      options?: { search?: string; limit?: number },
    ): PromiseLike<{
      data: Array<{ name: string; metadata?: Record<string, unknown> | null }> | null
      error: { message: string } | null
    }>
    createSignedUrl(
      path: string,
      expiresIn: number,
      options?: { download?: string | boolean },
    ): PromiseLike<{ data: { signedUrl: string } | null; error: { message: string } | null }>
    remove(
      paths: string[],
    ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
  }
}

export type VerifyFilesResult =
  | { ok: true; files: FicheFile[] }
  | { ok: false; status: 400 | 502; error: string; field: 'files' }

/**
 * Contrôle, AVEC LE CLIENT DE SERVICE, chaque fichier déclaré par le navigateur :
 * chemin rattaché à l'auteur, objet réellement présent, taille et type repris
 * des métadonnées de stockage (jamais du client), signature réelle des
 * premiers octets. Un objet présent mais invalide est supprimé.
 *
 * `alreadyReferenced` : chemins déjà enregistrés sur la fiche — ils ne sont ni
 * recontrôlés ni supprimés (une édition ne doit jamais effacer un fichier vendu).
 */
export async function verifyStoredFiles(
  storage: FicheStorage,
  files: Array<{ name: string; url: string; type?: string; size?: number }>,
  scope: FichePathScope,
  opts: {
    alreadyReferenced?: FicheFile[]
    fetchImpl?: typeof fetch
    log?: { warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void }
  } = {},
): Promise<VerifyFilesResult> {
  const doFetch = opts.fetchImpl ?? fetch
  const known = new Map((opts.alreadyReferenced ?? []).map((f) => [storagePathOf(f.url), f]))
  const bucket = storage.from(FICHES_BUCKET)
  const out: FicheFile[] = []
  const invalid = (name: string): VerifyFilesResult => ({
    ok: false,
    status: 400,
    error: `Fichier « ${safeDownloadName(name)} » invalide ou absent`,
    field: 'files',
  })

  for (const f of files) {
    const path = storagePathOf(f.url)
    const previous = known.get(path)
    if (previous) {
      out.push({ ...previous, name: f.name || previous.name })
      continue
    }
    // Chemin hors du dossier de l'auteur : refusé, et surtout PAS supprimé
    // (il peut appartenir à quelqu'un d'autre).
    if (!validateFichePath(path, scope)) return invalid(f.name)
    const ext = extensionOf(path)
    if (!(FICHE_EXTENSIONS as readonly string[]).includes(ext)) return invalid(f.name)

    const slash = path.lastIndexOf('/')
    const folder = path.slice(0, slash)
    const objectName = path.slice(slash + 1)
    const { data: entries, error: listError } = await bucket.list(folder, {
      search: objectName,
      limit: 100,
    })
    if (listError) {
      opts.log?.error('Fiche file lookup failed', { path, message: listError.message })
      return {
        ok: false,
        status: 502,
        error: 'Vérification des fichiers impossible, réessayez.',
        field: 'files',
      }
    }
    const entry = (entries ?? []).find((e) => e.name === objectName)
    if (!entry) return invalid(f.name)

    const meta = entry.metadata ?? {}
    const size = Number(meta.size)
    const mime = typeof meta.mimetype === 'string' ? meta.mimetype : ''

    const { data: signed } = await bucket.createSignedUrl(path, 60)
    let bytes: Uint8Array | null = null
    if (signed?.signedUrl) {
      try {
        const res = await doFetch(signed.signedUrl, {
          headers: { Range: 'bytes=0-7' },
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) bytes = new Uint8Array(await res.arrayBuffer()).slice(0, 8)
      } catch {
        bytes = null
      }
    }
    if (!bytes) {
      opts.log?.error('Fiche file signature read failed', { path })
      return {
        ok: false,
        status: 502,
        error: 'Vérification des fichiers impossible, réessayez.',
        field: 'files',
      }
    }
    if (!checkFileSignature(ext, bytes)) {
      opts.log?.warn('Fiche file signature mismatch, object removed', { path, ext })
      await bucket.remove([path])
      return invalid(f.name)
    }
    out.push({
      name: f.name,
      url: path,
      type: ext,
      ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
      ...(mime ? { mime } : {}),
    })
  }
  return { ok: true, files: out }
}
