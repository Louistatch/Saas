/**
 * useKoboSync — déclenche une synchronisation Kobo REPRENABLE.
 *
 * Le serveur traite les soumissions dans un budget de temps (≈ 40 s) puis répond
 * `partial: true` + `cursor` ; ce hook rappelle POST /api/integrations/kobo/sync avec ce
 * curseur jusqu'à la fin, en cumulant les compteurs. La progression affichée est réelle
 * (soumissions traitées / estimation du total fournie par Kobo), sans flux SSE.
 *
 * Un échec (token révoqué, formulaire non partagé, Kobo injoignable…) arrête la boucle et
 * remonte le message du serveur dans `error` : jamais un faux « Synchronisation terminée ».
 *
 * Usage:
 *   const { isSyncing, progress, result, error, startSync, cancelSync } = useKoboSync(cooperativeId)
 *   startSync('incremental')
 */
'use client'

import { useState, useCallback, useRef } from 'react'
import type { SyncResult, UseKoboSyncReturn } from '@/lib/kobo/types'

/** Garde-fou : 100 appels × ~40 s couvrent largement les volumes visés. */
const MAX_CALLS = 100

interface SyncResponse {
  syncLogId?: string
  success?: boolean
  partial?: boolean
  cursor?: number | null
  remaining?: number | null
  error?: string
  sync?: {
    received: number
    processed: number
    matched: number
    unmatched: number
    skipped?: number
    errors: number
    duration: number
    errorDetails?: Array<{ instanceId: string; error: string }>
  }
}

export function useKoboSync(cooperativeId: string | null): UseKoboSyncReturn {
  const [isSyncing, setIsSyncing] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const cancelSync = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsSyncing(false)
    setProgress(null)
  }, [])

  const startSync = useCallback(
    async (mode: 'full' | 'incremental') => {
      if (!cooperativeId || isSyncing) return

      setIsSyncing(true)
      setProgress(null)
      setResult(null)
      setError(null)

      const controller = new AbortController()
      abortRef.current = controller

      const total: SyncResult = {
        success: true,
        syncLogId: '',
        received: 0,
        processed: 0,
        matched: 0,
        unmatched: 0,
        skipped: 0,
        errors: 0,
        duration: 0,
        errorDetails: [],
      }

      try {
        let cursor: number | undefined
        for (let call = 0; call < MAX_CALLS; call++) {
          const response = await fetch('/api/integrations/kobo/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cooperativeId, mode, ...(cursor !== undefined ? { cursor } : {}) }),
            signal: controller.signal,
          })

          const data = (await response.json().catch(() => ({}))) as SyncResponse

          // Échec global : message du serveur (déjà en français, sans le token).
          if (!response.ok) {
            throw new Error(data.error ?? `Erreur HTTP ${response.status}`)
          }

          const s = data.sync
          if (s) {
            total.received += s.received
            total.processed += s.processed
            total.matched += s.matched
            total.unmatched += s.unmatched
            total.skipped = (total.skipped ?? 0) + (s.skipped ?? 0)
            total.errors += s.errors
            total.duration += s.duration
            total.errorDetails = [...(total.errorDetails ?? []), ...(s.errorDetails ?? [])].slice(0, 20)
          }
          total.syncLogId = data.syncLogId ?? total.syncLogId
          total.success = total.errors === 0

          const remaining = data.remaining ?? 0
          setProgress({ current: total.received, total: total.received + (data.partial ? remaining : 0) })
          setResult({ ...total })

          if (!data.partial) {
            setIsSyncing(false)
            return
          }
          if (typeof data.cursor !== 'number') {
            throw new Error('Réponse de synchronisation incomplète (curseur manquant).')
          }
          cursor = data.cursor
        }
        throw new Error('Synchronisation interrompue : trop d’étapes. Relancez-la pour continuer.')
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Erreur de synchronisation')
        setIsSyncing(false)
      } finally {
        abortRef.current = null
      }
    },
    [cooperativeId, isSyncing],
  )

  return { isSyncing, progress, result, error, startSync, cancelSync }
}
