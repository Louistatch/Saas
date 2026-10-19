/**
 * Vocabulaire des systèmes de production.
 *
 * La colonne `fiches_techniques.type_agriculture` est un simple `text` sans
 * contrainte CHECK, et aucune valeur n'existait encore en base : le vocabulaire
 * est donc fixé ici, du côté qui écrit, pour que le filtre de l'acheteur ait
 * quelque chose de stable à interroger. Trois orthographes libres
 * (« agroécologique », « Agro-écologique », « agroeco ») rendraient le filtre
 * inutilisable sans que rien ne casse visiblement.
 *
 * Les clés sont sans accent ni espace — elles voyagent dans des URL de filtre.
 */
export const TYPES_AGRICULTURE = {
  agroecologique: 'Agroécologique',
  conventionnel: 'Intensive (conventionnel)',
  integre: 'Intégré',
} as const

export type TypeAgriculture = keyof typeof TYPES_AGRICULTURE

export const TYPE_AGRICULTURE_KEYS = Object.keys(TYPES_AGRICULTURE) as TypeAgriculture[]

export function labelTypeAgriculture(value: string | null | undefined): string {
  if (!value) return '—'
  return TYPES_AGRICULTURE[value as TypeAgriculture] ?? value
}

/** Un fichier attaché à une fiche, tel que stocké dans la colonne jsonb `files`. */
export interface FicheFile {
  name: string
  /** Chemin dans le bucket privé `fiches-techniques`, pas une URL publique. */
  url: string
  type: string
  /** Taille relue dans les métadonnées de stockage (jamais celle du client). */
  size?: number
  /** Type MIME relu dans les métadonnées de stockage. */
  mime?: string
}

/**
 * Statut d'une fiche, libellé partagé par l'administration plateforme et le
 * tableau de bord des faîtières (un brouillon n'est jamais « Archivé »).
 */
export const FICHE_STATUS_LABEL = {
  draft: 'Brouillon',
  published: 'Publiée',
  archived: 'Retirée',
} as const

export type FicheStatus = keyof typeof FICHE_STATUS_LABEL

export function labelFicheStatus(status: string | null | undefined): string {
  return FICHE_STATUS_LABEL[status as FicheStatus] ?? String(status ?? '—')
}

/** Format d'un fichier vendu, tel que l'acheteur le reconnaît. */
const FILE_TYPE_LABEL: Record<string, string> = {
  xlsx: 'Excel (.xlsx)',
  xls: 'Excel (.xls)',
  docx: 'Word (.docx)',
  doc: 'Word (.doc)',
  pdf: 'PDF',
}

export function labelFileType(type: string | null | undefined): string {
  const t = String(type ?? '')
    .toLowerCase()
    .replace(/^\./, '')
  return FILE_TYPE_LABEL[t] ?? (t ? `.${t}` : 'fichier')
}

/** Taille lisible : « 48 Ko », « 1,2 Mo ». null si inconnue. */
export function formatFileSize(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`
  const mo = bytes / (1024 * 1024)
  return `${mo.toLocaleString('fr-FR', { maximumFractionDigits: mo < 10 ? 1 : 0 })} Mo`
}

/**
 * Contenu vendu en une ligne, d'après `files_summary` (sans chemin de stockage) :
 *   « 1 fichier Excel (.xlsx) · 48 Ko »
 *   « 2 fichiers : Excel (.xlsx), PDF · 1,2 Mo »
 * La taille n'est donnée que si elle est connue pour tous les fichiers.
 */
export function summarizeFiles(
  summary: ReadonlyArray<{ type: string; size: number | null }> | null | undefined,
): string | null {
  const list = summary ?? []
  if (list.length === 0) return null
  const labels = [...new Set(list.map((f) => labelFileType(f.type)))]
  const count = list.length === 1 ? '1 fichier' : `${list.length} fichiers`
  const what = labels.length === 1 ? `${count} ${labels[0]}` : `${count} : ${labels.join(', ')}`
  const sizes = list.map((f) => f.size)
  const total = sizes.every((s) => typeof s === 'number')
    ? formatFileSize((sizes as number[]).reduce((a, b) => a + b, 0))
    : null
  return total ? `${what} · ${total}` : what
}

/** Montant en FCFA, séparateurs français : « 1 000 FCFA ». */
export function formatFcfa(amount: number | null | undefined): string {
  return `${Math.round(Number(amount ?? 0)).toLocaleString('fr-FR')} FCFA`
}

/** Prix affiché à l'acheteur : « Gratuit » pour 0, sinon le montant formaté. */
export function priceLabel(amount: number | null | undefined): string {
  return Number(amount ?? 0) > 0 ? formatFcfa(amount) : 'Gratuit'
}
