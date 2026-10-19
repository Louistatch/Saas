/**
 * Dépôt d'un compte d'exploitation depuis le navigateur : nom de fichier
 * accepté par le serveur, contrôle avant envoi, traduction des erreurs de
 * stockage et validation du formulaire avec le schéma PARTAGÉ (lib/fiches/
 * schema.ts). Fonctions pures, sans client Supabase : testables telles quelles.
 */
import { FICHE_EXTENSIONS } from '@/lib/fiches/files'
import { createFicheSchema, fieldErrors } from '@/lib/fiches/schema'

/** Limite par fichier côté navigateur (le bucket accepte 25 Mo). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const UPLOAD_ACCEPT = FICHE_EXTENSIONS.map((e) => `.${e}`).join(',')

/**
 * Type MIME envoyé au stockage d'après l'extension : certains navigateurs
 * donnent `application/octet-stream` (ou rien) pour un .xlsx, que le bucket
 * refuse (« mime type … is not supported »).
 */
export const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
}

export function extensionOfName(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * Nom d'objet accepté par validateFichePath (`[A-Za-z0-9._-]+`, jamais « .. ») :
 * accents retirés, espaces et signes remplacés par « - ».
 *   « Compte Maïs 2026 (v2).XLSX » → « Compte-Mais-2026-v2.xlsx »
 */
export function sanitizeStorageName(name: string): string {
  const ext = extensionOfName(name)
  const rawBase = ext ? name.slice(0, name.length - ext.length - 1) : name
  const base =
    rawBase
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/\.{2,}/g, '.')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 80)
      .replace(/[-.]+$/g, '') || 'fichier'
  const cleanExt = ext.replace(/[^a-z0-9]/g, '')
  return cleanExt ? `${base}.${cleanExt}` : base
}

/** Nom libre dans le dossier : « compte.xlsx », sinon « compte-2.xlsx », « compte-3.xlsx »… */
export function uniqueStorageName(name: string, taken: ReadonlySet<string>): string {
  const clean = sanitizeStorageName(name)
  if (!taken.has(clean)) return clean
  const ext = extensionOfName(clean)
  const base = ext ? clean.slice(0, clean.length - ext.length - 1) : clean
  for (let i = 2; i < 1000; i++) {
    const candidate = ext ? `${base}-${i}.${ext}` : `${base}-${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now().toString(36)}${ext ? `.${ext}` : ''}`
}

/** Contrôle avant envoi : message à afficher, ou null si le fichier est accepté. */
export function checkUploadFile(file: { name: string; size: number }): string | null {
  const ext = extensionOfName(file.name)
  if (!(FICHE_EXTENSIONS as readonly string[]).includes(ext))
    return `« ${file.name} » : format non accepté. Envoyez un PDF, un Excel (.xlsx) ou un Word (.docx).`
  if (file.size > MAX_UPLOAD_BYTES)
    return `« ${file.name} » dépasse 20 Mo. Réduisez-le (enregistrez-le en PDF, retirez les images) puis réessayez.`
  if (file.size === 0) return `« ${file.name} » est vide.`
  return null
}

/** Erreur du stockage Supabase → phrase qui dit quoi faire. */
export function translateStorageError(
  message: string | null | undefined,
  fileName?: string,
): string {
  const m = String(message ?? '').toLowerCase()
  const who = fileName ? `« ${fileName} » : ` : ''
  if (m.includes('mime type') || m.includes('invalid_mime') || m.includes('not supported'))
    return `${who}format non accepté. Envoyez un PDF, un Excel (.xlsx) ou un Word (.docx).`
  if (
    m.includes('exceeded') ||
    m.includes('too large') ||
    m.includes('payload') ||
    m.includes('413')
  )
    return `${who}fichier trop volumineux (20 Mo au maximum).`
  if (m.includes('already exists') || m.includes('duplicate'))
    return `${who}un fichier du même nom existe déjà. Renommez-le puis réessayez.`
  if (m.includes('row-level security') || m.includes('unauthorized') || m.includes('403'))
    return `${who}envoi refusé. Reconnectez-vous avec un compte autorisé puis réessayez.`
  if (
    m.includes('failed to fetch') ||
    m.includes('network') ||
    m.includes('load failed') ||
    m.includes('timeout')
  )
    return `${who}connexion interrompue pendant l’envoi. Vérifiez votre réseau puis réessayez.`
  return `${who}envoi impossible (${message || 'erreur inconnue'}). Réessayez.`
}

export interface FicheDraftValues {
  title: string
  description: string
  culture: string
  type_agriculture: string
  campaign: string
  price: string
  region_id: string
  prefecture_id: string
  canton_id: string
}

/** Valeurs du formulaire → corps de POST /api/fiches (brouillon, sans fichier). */
export function draftPayload(v: FicheDraftValues) {
  const price = v.price.trim() === '' ? Number.NaN : Number(v.price)
  return {
    title: v.title.trim(),
    description: v.description.trim() || undefined,
    culture: v.culture.trim(),
    type_agriculture: v.type_agriculture,
    campaign: v.campaign.trim() || undefined,
    region_id: v.region_id || undefined,
    prefecture_id: v.prefecture_id || undefined,
    canton_id: v.canton_id || undefined,
    price_non_member: price,
  }
}

/**
 * Validation avant tout envoi, avec le schéma du serveur : une erreur par
 * champ (la première), clés = noms de champs de l'API.
 */
export function validateFicheDraft(v: FicheDraftValues): Record<string, string> {
  const payload = draftPayload(v)
  const out: Record<string, string> = {}
  if (!Number.isFinite(payload.price_non_member))
    out.price_non_member = 'Indiquez un prix (0 = gratuit)'
  const parsed = createFicheSchema.safeParse({
    ...payload,
    price_non_member: Number.isFinite(payload.price_non_member) ? payload.price_non_member : 0,
    files: [],
    status: 'draft',
  })
  if (!parsed.success)
    for (const [field, messages] of Object.entries(fieldErrors(parsed.error)))
      if (messages?.[0] && !out[field]) out[field] = messages[0]
  return out
}

/** `details` d'une réponse 400 du serveur → une erreur par champ. */
export function serverFieldErrors(details: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!details || typeof details !== 'object') return out
  for (const [field, messages] of Object.entries(details as Record<string, unknown>))
    if (Array.isArray(messages) && typeof messages[0] === 'string') out[field] = messages[0]
  return out
}
