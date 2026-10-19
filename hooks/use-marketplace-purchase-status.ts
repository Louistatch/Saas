'use client'

import {
  LATE_POLL_MS,
  POLL_BASE_MS,
  type PayState,
  lateWatchActive,
  nextPollDelay,
  payStateOfReply,
  pollExpired,
} from '@/lib/fiches/payment-tracking'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Réponse de GET /api/purchases/[id] (jamais les coordonnées de l'acheteur). */
export interface PurchaseInfo {
  id: string
  fiche_id: string
  title: string | null
  seller_name?: string
  amount: number
  currency?: string
  /** État lisible calculé par le serveur (« expired » : demande restée sans réponse). */
  state?: 'pending' | 'completed' | 'failed' | 'expired' | 'refunded'
  /** Statut brut en base. */
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  /** Un nouveau paiement peut être lancé pour cette fiche. */
  can_retry?: boolean
  /** Montant réellement débité (frais inclus) et frais, relus chez FedaPay ; null si inconnus. */
  amount_debited?: number | null
  fees?: number | null
  access_granted: boolean
  paid_at: string | null
  /** Référence FedaPay (celle du reçu), quand elle existe. */
  reference?: string | null
  /** false : FedaPay n'a pas été relu (limite atteinte), état lu en base seulement. */
  refreshed?: boolean
}

export type PurchaseViewState = PayState | 'loading' | 'not-found' | 'error'

interface Options {
  /** Interroger toutes les 4 s (8 s puis 15 s après un 429) pendant 5 min au plus. */
  poll: boolean
  /** Lire l'état dès le montage (page d'achat) plutôt qu'au premier tour. */
  initialCheck?: boolean
}

/** État suivant d'après une réponse, sans faire « revenir » un état déjà mieux connu. */
function nextViewState(prev: PurchaseViewState, json: PurchaseInfo): PurchaseViewState {
  const next = payStateOfReply(json)
  // Un suivi arrêté reste arrêté tant que rien n'a changé.
  if (next === 'pending' && prev === 'timeout') return 'timeout'
  // Sans relecture FedaPay, le serveur ne sait plus distinguer « expirée » de
  // « refusée » : on garde ce que la relecture précédente avait établi.
  if (next === 'failed' && prev === 'expired' && json.refreshed === false) return 'expired'
  return next
}

/**
 * État d'un achat, relu côté serveur (?refresh=1 : le serveur interroge
 * FedaPay, dans ses propres limites). Suivi BORNÉ : au bout de 5 minutes sans
 * confirmation, l'état passe à « timeout » et seul « Vérifier le paiement »
 * relance une lecture. Un 429 espace les interrogations au lieu de les avaler.
 */
export function usePurchaseStatus(purchaseId: string | null, { poll, initialCheck }: Options) {
  const [state, setState] = useState<PurchaseViewState>(initialCheck ? 'loading' : 'pending')
  const [info, setInfo] = useState<PurchaseInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const startedAt = useRef(Date.now())
  const consecutive429 = useRef(0)
  const inFlight = useRef(false)

  /** Une lecture ; renvoie le code HTTP (0 = réseau). Ignorée si une lecture est déjà en cours. */
  const check = useCallback(async (): Promise<number> => {
    if (!purchaseId || inFlight.current) return -1
    inFlight.current = true
    setChecking(true)
    try {
      const res = await fetch(`/api/purchases/${purchaseId}?refresh=1`, { cache: 'no-store' })
      consecutive429.current = res.status === 429 ? consecutive429.current + 1 : 0
      if (res.status === 404 || res.status === 400) setState('not-found')
      else if (res.ok) {
        const json = (await res.json()) as PurchaseInfo
        setInfo(json)
        setState((prev) => nextViewState(prev, json))
      } else setState((prev) => (prev === 'loading' ? 'error' : prev))
      setLastCheckedAt(Date.now())
      return res.status
    } catch {
      setState((prev) => (prev === 'loading' ? 'error' : prev))
      return 0
    } finally {
      inFlight.current = false
      setChecking(false)
    }
  }, [purchaseId])

  // Nouvel achat suivi : tout repart de zéro.
  useEffect(() => {
    startedAt.current = Date.now()
    consecutive429.current = 0
    setInfo(null)
    setLastCheckedAt(null)
    setState(initialCheck ? 'loading' : 'pending')
    if (purchaseId && initialCheck) void check()
  }, [purchaseId, initialCheck, check])

  useEffect(() => {
    if (!poll || !purchaseId || state !== 'pending') return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      if (stopped) return
      if (pollExpired(startedAt.current)) {
        setState((prev) => (prev === 'pending' ? 'timeout' : prev))
        return
      }
      await check()
      if (!stopped) timer = setTimeout(tick, nextPollDelay(consecutive429.current))
    }
    timer = setTimeout(tick, nextPollDelay(consecutive429.current) || POLL_BASE_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [poll, purchaseId, state, check])

  return { state, info, checking, lastCheckedAt, checkNow: check }
}

export interface LateWatchEntry {
  purchaseId: string
  /** Moment (ms) où le refus ou l'expiration a été constaté. */
  since: number
}

/**
 * Paiement accepté APRÈS un refus : FedaPay peut encore approuver une
 * transaction « declined » ou « canceled ». Chaque achat de `entries` est
 * relu (?refresh=1, qui règle l'achat côté serveur) toutes les 15 s pendant
 * 10 minutes ; `onApproved` est appelé quand il est réglé. Renvoie les achats
 * encore surveillés, pour l'affichage (« nous vérifions encore… »).
 */
export function useLateApprovalWatch(
  entries: readonly LateWatchEntry[],
  onApproved: (info: PurchaseInfo) => void,
): ReadonlySet<string> {
  const callback = useRef(onApproved)
  callback.current = onApproved
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const key = entries.map((e) => `${e.purchaseId}@${e.since}`).join(',')
  const [watching, setWatching] = useState<ReadonlySet<string>>(new Set())

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` résume `entries` (lu par la ref)
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const active = () => entriesRef.current.filter((e) => lateWatchActive(e.since))
    const publish = () => {
      const ids = active().map((e) => e.purchaseId)
      setWatching((prev) =>
        prev.size === ids.length && ids.every((id) => prev.has(id)) ? prev : new Set(ids),
      )
      return ids
    }
    if (publish().length === 0) return
    const tick = async () => {
      if (stopped) return
      let limited = false
      for (const entry of active()) {
        try {
          const res = await fetch(`/api/purchases/${entry.purchaseId}?refresh=1`, {
            cache: 'no-store',
          })
          if (res.status === 429) limited = true
          if (!res.ok) continue
          const json = (await res.json()) as PurchaseInfo
          if (stopped) return
          if (payStateOfReply(json) === 'completed') callback.current(json)
        } catch {
          // Réseau coupé : nouvel essai au tour suivant.
        }
      }
      if (stopped) return
      if (publish().length > 0) timer = setTimeout(tick, limited ? LATE_POLL_MS * 2 : LATE_POLL_MS)
    }
    timer = setTimeout(tick, LATE_POLL_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [key])

  return watching
}
