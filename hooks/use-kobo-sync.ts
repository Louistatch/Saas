/**
 * useKoboSync — SSE consumer hook for real-time sync progress.
 *
 * Triggers a sync via POST /api/integrations/kobo/sync, then connects
 * to the SSE endpoint for live progress updates.
 *
 * Usage:
 *   const { isSyncing, progress, result, error, startSync, cancelSync } = useKoboSync(cooperativeId)
 *   startSync('incremental')
 */
'use client'

import { useState, useCallback, useRef } from 'react'
import type { SyncResult, KoboSyncSSEEvent, UseKoboSyncReturn } from '@/lib/kobo/types'

export function useKoboSync(cooperativeId: string | null): UseKoboSyncReturn {
  const [isSyncing, setIsSyncing] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const cancelSync = useCallback(() => {
    cleanup()
    setIsSyncing(false)
    setProgress(null)
  }, [cleanup])

  const startSync = useCallback(
    async (mode: 'full' | 'incremental') => {
      if (!cooperativeId || isSyncing) return

      // Reset state
      setIsSyncing(true)
      setProgress(null)
      setResult(null)
      setError(null)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        // Step 1: Trigger the sync
        const response = await fetch('/api/integrations/kobo/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cooperativeId, mode }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          const message =
            (body as { error?: string }).error ?? `Erreur HTTP ${response.status}`
          throw new Error(message)
        }

        const syncResponse = (await response.json()) as {
          syncLogId?: string
          success?: boolean
          sync?: {
            received: number
            processed: number
            matched: number
            unmatched: number
            errors: number
            duration: number
          }
          message?: string
        }

        // If the sync completed immediately (small dataset), use the response directly
        if (syncResponse.sync) {
          const syncResult: SyncResult = {
            success: syncResponse.success ?? true,
            syncLogId: syncResponse.syncLogId ?? '',
            received: syncResponse.sync.received,
            processed: syncResponse.sync.processed,
            matched: syncResponse.sync.matched,
            unmatched: syncResponse.sync.unmatched,
            errors: syncResponse.sync.errors,
            duration: syncResponse.sync.duration,
          }
          setResult(syncResult)
          setProgress({ current: syncResult.processed, total: syncResult.received })
          setIsSyncing(false)
          return
        }

        // Step 2: Connect to SSE for progress (if syncLogId available)
        if (syncResponse.syncLogId) {
          connectToSSE(syncResponse.syncLogId)
        } else {
          // No syncLogId — sync completed inline
          setIsSyncing(false)
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Erreur de synchronisation'
        setError(message)
        setIsSyncing(false)
      }
    },
    [cooperativeId, isSyncing, cleanup],
  )

  const connectToSSE = useCallback(
    (syncLogId: string) => {
      const url = `/api/integrations/kobo/sync/progress?syncLogId=${encodeURIComponent(syncLogId)}`

      // Use fetch-based SSE reader (EventSource doesn't support custom headers)
      const controller = new AbortController()
      abortRef.current = controller

      fetch(url, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok || !response.body) {
            throw new Error(`SSE connection failed: ${response.status}`)
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // Parse SSE events from buffer
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? '' // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6).trim()
                if (!jsonStr) continue

                try {
                  const event = JSON.parse(jsonStr) as KoboSyncSSEEvent

                  switch (event.type) {
                    case 'progress':
                      setProgress({ current: event.current, total: event.total })
                      break

                    case 'complete':
                      setResult(event.result)
                      setProgress({
                        current: event.result.processed,
                        total: event.result.received,
                      })
                      setIsSyncing(false)
                      cleanup()
                      return

                    case 'error':
                      setError(event.message)
                      setIsSyncing(false)
                      cleanup()
                      return
                  }
                } catch {
                  // Ignore malformed SSE data
                }
              }
            }
          }

          // Stream ended without complete/error event
          setIsSyncing(false)
          cleanup()
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return
          const message = err instanceof Error ? err.message : 'SSE connection error'
          setError(message)
          setIsSyncing(false)
        })
    },
    [cleanup],
  )

  return { isSyncing, progress, result, error, startSync, cancelSync }
}
