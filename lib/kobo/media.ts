/**
 * Photo et signature d'un membre : téléchargement depuis Kobo puis dépôt dans Supabase Storage.
 *
 * Un SEUL chemin pour l'inscription et le rattrapage (avant : deux copies, dont celle du
 * rattrapage utilisait la session de l'utilisateur et un chemin hors convention, donc refusée
 * par les policies de stockage, avec des échecs avalés).
 *
 * Convention de stockage : `<cooperative_id du membre>/kobo/<member_id>/<type>-<pièce jointe>.<ext>`.
 * Le premier dossier est la coopérative du membre (policies « member photos … by own org ») ;
 * le chemin est déterministe par pièce jointe, donc une relance écrase au lieu de dupliquer.
 *
 * Le client passé est le client service_role : à n'appeler qu'APRÈS les contrôles d'accès du
 * tenant (route authentifiée, ou webhook authentifié par le secret de l'intégration).
 * Le token Kobo n'apparaît dans aucune valeur retournée ni journalisée.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isAllowedKoboAttachmentUrl } from './attachment-url'
import { getPayloadField } from './payload'
import { DEFAULT_KOBO_SERVER_URL, koboAttachmentHosts } from './server-url'

type Db = SupabaseClient

const DOWNLOAD_TIMEOUT_MS = 30_000
const MAX_MEDIA_BYTES = 8 * 1024 * 1024

export type MediaKind = 'photo' | 'signature'

export interface MediaError {
  field: MediaKind
  reason: string
}

export interface StoredMedia {
  photoUrl: string | null
  signatureUrl: string | null
  /** Médias ANNONCÉS par le formulaire mais non stockés (la soumission reste « matched »). */
  errors: MediaError[]
}

interface MediaSpec {
  kind: MediaKind
  bucket: 'member-photos' | 'member-signatures'
  /** Chemin du champ dans le formulaire (question_xpath de la pièce jointe). */
  xpath: string
  fieldNames: string[]
}

const SPECS: Record<MediaKind, MediaSpec> = {
  photo: {
    kind: 'photo',
    bucket: 'member-photos',
    xpath: 'S1/photo_membre',
    fieldNames: ['S1/photo_membre', 'photo_membre', 'identification/photo'],
  },
  signature: {
    kind: 'signature',
    bucket: 'member-signatures',
    xpath: 'S7/signature_membre',
    fieldNames: ['S7/signature_membre', 'signature_membre', 'signature'],
  },
}

interface Attachment {
  download_url?: string | null
  filename?: string | null
  mimetype?: string | null
  question_xpath?: string | null
  uid?: string | null
  id?: number | string | null
  is_deleted?: boolean | null
}

function announcedFilename(payload: Record<string, unknown>, spec: MediaSpec): string | null {
  for (const name of spec.fieldNames) {
    const v = getPayloadField(payload, name)
    if (v) return v
  }
  return null
}

function findAttachment(
  attachments: Attachment[],
  spec: MediaSpec,
  filename: string | null,
): Attachment | null {
  const live = attachments.filter((a) => a && !a.is_deleted)
  const leaf = spec.xpath.split('/').pop() ?? spec.xpath
  return (
    live.find((a) => a.question_xpath === spec.xpath) ??
    live.find(
      (a) => typeof a.question_xpath === 'string' && a.question_xpath.endsWith(`/${leaf}`),
    ) ??
    (filename
      ? live.find((a) => typeof a.filename === 'string' && a.filename.includes(filename))
      : null) ??
    null
  )
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file'
}

function extensionOf(att: Attachment, filename: string | null): string {
  const fromName = (filename ?? att.filename ?? '').split('.').pop() ?? ''
  if (/^[a-zA-Z0-9]{2,5}$/.test(fromName)) return fromName.toLowerCase()
  const mime = att.mimetype?.split('/')[1]
  return mime && /^[a-zA-Z0-9]{2,5}$/.test(mime) ? mime.toLowerCase() : 'png'
}

export interface StoreMediaArgs {
  payload: Record<string, unknown>
  apiToken?: string | null
  serverUrl?: string
  /** Coopérative DU MEMBRE (premier dossier du chemin, exigé par la policy de stockage). */
  cooperativeId: string
  memberId: string
  /** Médias à rapatrier (ceux que la fiche n'a pas encore). */
  want: { photo: boolean; signature: boolean }
  fetchImpl?: typeof fetch
}

export async function storeKoboMedia(db: Db, args: StoreMediaArgs): Promise<StoredMedia> {
  const result: StoredMedia = { photoUrl: null, signatureUrl: null, errors: [] }
  const attachments = (
    Array.isArray(args.payload._attachments) ? args.payload._attachments : []
  ) as Attachment[]
  const hosts = koboAttachmentHosts(args.serverUrl ?? DEFAULT_KOBO_SERVER_URL)
  const doFetch = args.fetchImpl ?? fetch

  for (const kind of ['photo', 'signature'] as const) {
    if (!args.want[kind]) continue
    const spec = SPECS[kind]
    const filename = announcedFilename(args.payload, spec)
    if (!filename) continue // le formulaire n'annonce rien : ce n'est pas un échec

    const fail = (reason: string) => result.errors.push({ field: kind, reason })
    const att = findAttachment(attachments, spec, filename)
    if (!att?.download_url) {
      fail('pièce jointe introuvable dans la soumission')
      continue
    }
    if (!isAllowedKoboAttachmentUrl(att.download_url, hosts)) {
      fail('adresse de la pièce jointe refusée (hors du serveur Kobo configuré)')
      continue
    }
    if (!args.apiToken) {
      fail('jeton API Kobo indisponible : reconfigurez l’intégration')
      continue
    }

    try {
      const resp = await doFetch(att.download_url, {
        headers: { Authorization: `Token ${args.apiToken}` },
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      })
      if (!resp.ok) {
        fail(`téléchargement refusé par Kobo (HTTP ${resp.status})`)
        continue
      }
      const buf = Buffer.from(await resp.arrayBuffer())
      if (buf.byteLength === 0 || buf.byteLength > MAX_MEDIA_BYTES) {
        fail('fichier vide ou trop volumineux')
        continue
      }
      const ext = extensionOf(att, filename)
      const attKey = safeSegment(String(att.uid ?? att.id ?? filename))
      const path = `${args.cooperativeId}/kobo/${args.memberId}/${kind}-${attKey}.${ext}`
      const contentType = att.mimetype?.startsWith('image/') ? att.mimetype : `image/${ext}`
      const { error } = await db.storage.from(spec.bucket).upload(path, buf, {
        contentType,
        upsert: true,
      })
      if (error) {
        fail(`dépôt dans le stockage impossible (${error.message})`)
        continue
      }
      const url = db.storage.from(spec.bucket).getPublicUrl(path).data?.publicUrl ?? null
      if (!url) {
        fail('adresse publique introuvable')
        continue
      }
      if (kind === 'photo') result.photoUrl = url
      else result.signatureUrl = url
    } catch {
      // Message générique : une erreur réseau brute pourrait citer l'en-tête d'autorisation.
      fail('téléchargement impossible (réseau ou délai dépassé)')
    }
  }
  return result
}
