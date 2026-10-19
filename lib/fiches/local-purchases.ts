/**
 * Achats gardés SUR L'APPAREIL (localStorage, clé `fh:achats`) : un acheteur
 * sans compte retrouve son achat après avoir fermé la fenêtre ou rechargé la
 * page. L'id d'achat sert de jeton de téléchargement : il ne quitte jamais cet
 * appareil, et rien d'autre n'est gardé (ni téléphone, ni nom, ni e-mail).
 *
 * Toute lecture ou écriture est sous try/catch : navigation privée, stockage
 * bloqué ou plein — la page fonctionne aussi sans. Fonctions pures + petites
 * enveloppes navigateur, le stockage peut être passé en paramètre (tests).
 */

export const LOCAL_PURCHASES_KEY = 'fh:achats'
/** Événement émis dans la page après chaque écriture (même onglet). */
export const LOCAL_PURCHASES_EVENT = 'fh:achats-change'
/** Un paiement en attente plus vieux que ce délai n'est plus repris automatiquement. */
export const RESUME_WINDOW_MS = 24 * 60 * 60_000
export const MAX_LOCAL_PURCHASES = 20

export interface LocalPurchase {
  purchaseId: string
  ficheId: string
  title: string
  /** ISO 8601. */
  createdAt: string
  /** « Ce n'est pas moi / nouvel achat » : gardé dans la liste, plus repris. */
  dismissed?: boolean
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function isLocalPurchase(v: unknown): v is LocalPurchase {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.purchaseId === 'string' &&
    UUID_RE.test(o.purchaseId) &&
    typeof o.ficheId === 'string' &&
    UUID_RE.test(o.ficheId) &&
    typeof o.title === 'string' &&
    typeof o.createdAt === 'string' &&
    !Number.isNaN(Date.parse(o.createdAt))
  )
}

/** Lecture tolérante : contenu illisible ou entrée malformée → ignorée. */
export function parseLocalPurchases(raw: string | null | undefined): LocalPurchase[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter(isLocalPurchase).map((p) => ({
      purchaseId: p.purchaseId,
      ficheId: p.ficheId,
      title: p.title.slice(0, 200),
      createdAt: p.createdAt,
      ...(p.dismissed ? { dismissed: true } : {}),
    }))
  } catch {
    return []
  }
}

/** Ajoute (ou rafraîchit) une entrée : la plus récente en tête, sans doublon, plafonnée. */
export function upsertLocalPurchase(list: LocalPurchase[], entry: LocalPurchase): LocalPurchase[] {
  const previous = list.find((p) => p.purchaseId === entry.purchaseId)
  const merged: LocalPurchase = previous
    ? { ...previous, ...entry, createdAt: previous.createdAt }
    : entry
  return [merged, ...list.filter((p) => p.purchaseId !== entry.purchaseId)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_LOCAL_PURCHASES)
}

/** Achat de cette fiche à reprendre : le plus récent, non écarté, de moins de 24 h. */
export function resumableFor(
  list: LocalPurchase[],
  ficheId: string,
  now: number = Date.now(),
): LocalPurchase | null {
  return (
    list
      .filter(
        (p) =>
          p.ficheId === ficheId &&
          !p.dismissed &&
          now - Date.parse(p.createdAt) >= 0 &&
          now - Date.parse(p.createdAt) < RESUME_WINDOW_MS,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  )
}

function storageOrNull(storage?: KeyValueStorage): KeyValueStorage | null {
  if (storage) return storage
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function readLocalPurchases(storage?: KeyValueStorage): LocalPurchase[] {
  try {
    return parseLocalPurchases(storageOrNull(storage)?.getItem(LOCAL_PURCHASES_KEY))
  } catch {
    return []
  }
}

function write(list: LocalPurchase[], storage?: KeyValueStorage): boolean {
  try {
    const s = storageOrNull(storage)
    if (!s) return false
    s.setItem(LOCAL_PURCHASES_KEY, JSON.stringify(list))
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_PURCHASES_EVENT))
    return true
  } catch {
    return false
  }
}

/** Garde un achat sur l'appareil. Renvoie false si le stockage est indisponible. */
export function rememberPurchase(
  entry: Omit<LocalPurchase, 'createdAt'> & { createdAt?: string },
  storage?: KeyValueStorage,
): boolean {
  if (!UUID_RE.test(entry.purchaseId) || !UUID_RE.test(entry.ficheId)) return false
  const full: LocalPurchase = {
    purchaseId: entry.purchaseId,
    ficheId: entry.ficheId,
    title: entry.title,
    createdAt: entry.createdAt ?? new Date().toISOString(),
    ...(entry.dismissed ? { dismissed: true } : {}),
  }
  return write(upsertLocalPurchase(readLocalPurchases(storage), full), storage)
}

/** « Ce n'est pas moi / nouvel achat » : l'achat reste listé mais n'est plus repris. */
export function dismissLocalPurchase(purchaseId: string, storage?: KeyValueStorage): boolean {
  const list = readLocalPurchases(storage)
  if (!list.some((p) => p.purchaseId === purchaseId)) return false
  return write(
    list.map((p) => (p.purchaseId === purchaseId ? { ...p, dismissed: true } : p)),
    storage,
  )
}

/** Retire un achat inconnu du serveur (404). */
export function forgetLocalPurchase(purchaseId: string, storage?: KeyValueStorage): boolean {
  const list = readLocalPurchases(storage)
  if (!list.some((p) => p.purchaseId === purchaseId)) return false
  return write(
    list.filter((p) => p.purchaseId !== purchaseId),
    storage,
  )
}
