'use client'

import { useAuth } from '@/app/context/auth-context'
import {
  LOCAL_PURCHASES_EVENT,
  LOCAL_PURCHASES_KEY,
  forgetLocalPurchase,
  readLocalPurchases,
} from '@/lib/fiches/local-purchases'
import { type PurchaseStatus, payStateOf } from '@/lib/fiches/payment-tracking'
import { useCallback, useEffect, useMemo, useState } from 'react'

export interface KnownPurchase {
  id: string
  ficheId: string
  title: string
  status: PurchaseStatus
  accessGranted: boolean
  createdAt: string
  /** Rattaché au compte connecté, ou seulement gardé sur cet appareil. */
  source: 'account' | 'device'
}

/** Au plus autant d'achats de l'appareil relus à chaque visite. */
const DEVICE_LOOKUPS = 10

interface MineRow {
  id: string
  fiche_id: string
  payment_status: string
  access_granted: boolean
  created_at: string
  fiches_techniques: { title: string } | null
}

/**
 * Achats connus de ce visiteur : ceux du compte connecté (GET
 * /api/purchases/mine) et ceux gardés sur l'appareil (localStorage, relus un
 * par un via GET /api/purchases/[id]). Un même achat n'apparaît qu'une fois.
 * Sert la rubrique « Mes achats », la rubrique « Achats sur cet appareil » et
 * le badge « Acheté » des cartes.
 */
export function useMarketplacePurchases() {
  const { user } = useAuth()
  const [account, setAccount] = useState<KnownPurchase[]>([])
  const [deviceAll, setDeviceAll] = useState<KnownPurchase[]>([])
  const [version, setVersion] = useState(0)

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  // Rechargement quand la fenêtre d'achat écrit (même onglet) ou qu'un autre onglet le fait.
  useEffect(() => {
    const onLocal = () => refresh()
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_PURCHASES_KEY) refresh()
    }
    window.addEventListener(LOCAL_PURCHASES_EVENT, onLocal)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(LOCAL_PURCHASES_EVENT, onLocal)
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` relance volontairement la lecture
  useEffect(() => {
    if (!user) {
      setAccount([])
      return
    }
    let cancelled = false
    fetch('/api/purchases/mine', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { purchases: [] }))
      .then((j: { purchases?: MineRow[] }) => {
        if (cancelled) return
        setAccount(
          (j.purchases ?? []).map((p) => ({
            id: p.id,
            ficheId: p.fiche_id,
            title: p.fiches_techniques?.title ?? 'Compte d’exploitation',
            status: payStateOf(p.payment_status, p.access_granted),
            accessGranted: p.access_granted,
            createdAt: p.created_at,
            source: 'account' as const,
          })),
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user, version])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` relance volontairement la lecture
  useEffect(() => {
    const local = readLocalPurchases().slice(0, DEVICE_LOOKUPS)
    if (local.length === 0) {
      setDeviceAll([])
      return
    }
    let cancelled = false
    Promise.all(
      local.map(async (entry): Promise<KnownPurchase | null> => {
        const fallback: KnownPurchase = {
          id: entry.purchaseId,
          ficheId: entry.ficheId,
          title: entry.title || 'Compte d’exploitation',
          status: 'pending',
          accessGranted: false,
          createdAt: entry.createdAt,
          source: 'device',
        }
        try {
          const res = await fetch(`/api/purchases/${entry.purchaseId}`, { cache: 'no-store' })
          if (res.status === 404) {
            forgetLocalPurchase(entry.purchaseId)
            return null
          }
          if (!res.ok) return fallback
          const j = (await res.json()) as {
            title?: string
            status?: string
            access_granted?: boolean
          }
          return {
            ...fallback,
            title: j.title || fallback.title,
            status: payStateOf(j.status, j.access_granted),
            accessGranted: j.access_granted === true,
          }
        } catch {
          return fallback
        }
      }),
    ).then((rows) => {
      if (!cancelled) setDeviceAll(rows.filter((r): r is KnownPurchase => r !== null))
    })
    return () => {
      cancelled = true
    }
  }, [version])

  const device = useMemo(() => {
    const inAccount = new Set(account.map((p) => p.id))
    return deviceAll.filter((p) => !inAccount.has(p.id))
  }, [account, deviceAll])

  /** Fiche → achat réglé qui y donne accès (compte d'abord, puis appareil). */
  const ownedByFiche = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of [...account, ...deviceAll])
      if (p.status === 'completed' && p.accessGranted && !map.has(p.ficheId))
        map.set(p.ficheId, p.id)
    return map
  }, [account, deviceAll])

  return { account, device, ownedByFiche, refresh }
}
