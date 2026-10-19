/**
 * Une seule demande de paiement à la fois par compte d'exploitation et par
 * numéro Mobile Money. Fonctions PURES, partagées par la route d'achat et les
 * tests (POST /api/fiches/[id]/purchase).
 *
 * La base tranche (supabase/migrations/20261019_100000_purchases_one_pending.sql) :
 * un achat « pending » sans transaction FedaPay est unique par (fiche, numéro),
 * donc une 2e insertion simultanée échoue en 23505. Après TOUTE insertion
 * réussie, la route relit aussi les achats en cours du même numéro : une
 * insertion arrivée juste après l'enregistrement de la transaction du premier
 * (sorti de l'index) le voit alors, et cède. Seul l'achat qui reste sans rival
 * envoie la demande à FedaPay.
 */

/** Code Postgres d'une violation d'unicité. */
export const UNIQUE_VIOLATION = '23505'

/**
 * Un paiement en attente plus récent que ce délai bloque une nouvelle demande
 * pour la même fiche et le même numéro (route d'achat) ; au-delà, l'acheteur
 * peut relancer (can_retry de GET /api/purchases/[id]).
 */
export const PENDING_LOCK_MS = 15 * 60_000

/** Âge (ms) d'un achat d'après son created_at ; date illisible → tout neuf (0). */
export function pendingAgeMs(createdAt: string | null | undefined, now: number = Date.now()) {
  const t = Date.parse(String(createdAt ?? ''))
  return Number.isFinite(t) ? Math.max(0, now - t) : 0
}

/**
 * Minutes (au moins 1) avant qu'une nouvelle demande soit acceptée pour ce
 * numéro : dites à l'acheteur dans le refus 409 de la route d'achat.
 */
export function minutesBeforeNewRequest(
  createdAt: string | null | undefined,
  now: number = Date.now(),
): number {
  return Math.max(1, Math.ceil((PENDING_LOCK_MS - pendingAgeMs(createdAt, now)) / 60_000))
}

export interface PendingPurchaseRow {
  id: string
  created_at: string
  provider_transaction_id: string | null
  buyer_name: string | null
  buyer_email: string | null
  user_id: string | null
}

export const PENDING_ROW_COLS =
  'id, created_at, provider_transaction_id, buyer_name, buyer_email, user_id'

const time = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : 0
}

/** Ordre total et partagé : la plus ancienne, puis le plus petit id. */
function isBefore(a: { id: string; created_at: string }, b: { id: string; created_at: string }) {
  const ta = time(a.created_at)
  const tb = time(b.created_at)
  return ta < tb || (ta === tb && a.id < b.id)
}

/**
 * Achat en cours qui passe avant le nôtre, ou null.
 *
 * `rows` : achats « pending » récents de la même fiche et du même numéro.
 * `mine` : notre achat tout juste inséré, ou null si l'insertion a été refusée
 * (23505) — tout achat en cours est alors prioritaire.
 *
 * Un rival qui a déjà sa transaction FedaPay a pu envoyer sa demande : on lui
 * cède toujours. Deux achats encore sans transaction (base sans l'index) sont
 * départagés par isBefore, le même ordre pour les deux requêtes.
 */
export function pickRival(
  rows: readonly PendingPurchaseRow[],
  mine: { id: string; created_at: string } | null,
): PendingPurchaseRow | null {
  const rivals = rows
    .filter(
      (r) =>
        r.id !== mine?.id &&
        (mine === null || Boolean(r.provider_transaction_id) || isBefore(r, mine)),
    )
    .sort((a, b) => (isBefore(a, b) ? -1 : isBefore(b, a) ? 1 : 0))
  return rivals[0] ?? null
}

/**
 * Même acheteur (même nom, même e-mail, même compte) : la requête concurrente
 * vient de la même fenêtre ou d'un 2e onglet, on peut lui rendre l'achat. Sinon
 * on ne renvoie PAS l'id : il sert de jeton d'accès, et connaître le numéro ne
 * suffit pas pour l'obtenir.
 */
export function isSameBuyer(
  row: PendingPurchaseRow,
  buyer: { name: string; email: string | null; userId: string | null },
): boolean {
  return (
    (row.buyer_name ?? '') === buyer.name &&
    (row.buyer_email ?? null) === buyer.email &&
    (row.user_id ?? null) === buyer.userId
  )
}
