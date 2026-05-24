/**
 * GET /api/integrations/kobo/sync/progress?syncLogId={uuid}
 *
 * Server-Sent Events (SSE) endpoint for real-time sync progress.
 * Polls kobo_sync_logs every 500ms and streams updates to the client.
 *
 * Events:
 *  - { type: "progress", current, total, status: "processing" }
 *  - { type: "complete", result: SyncResult }
 *  - { type: "error", message: string }
 *
 * Connection closes on complete/error or after 120s timeout.
 *
 * @security assertAuthenticated + assertTenantAccess
 * @security No sensitive data in SSE events
 *
 * @test Happy path: valid syncLogId → SSE stream with progress events
 * @test Auth failure: unauthenticated → 401
 * @test Validation failure: invalid syncLogId → 400
 */
import { NextRequest, NextResponse } from 'next/server'
import { assertAuthenticated, assertTenantAccess } from '@/lib/security/assert-access'
import { koboSyncProgressQuerySchema } from '@/lib/validators/kobo'
import { createLogger } from '@/lib/utils/logger'
import type { KoboSyncSSEEvent } from '@/lib/kobo/types'

const log = createLogger('api:kobo:sync:progress')

// Force dynamic rendering (no caching)
export const dynamic = 'force-dynamic'

// Vercel function timeout — 120 seconds for SSE
export const maxDuration = 120

const POLL_INTERVAL_MS = 500
const MAX_DURATION_MS = 120_000

export async function GET(request: NextRequest) {
  // -------------------------------------------------------
  // Authentication
  // -------------------------------------------------------
  const authResult = await assertAuthenticated()
  if (!authResult.ok) return authResult.response

  const { ctx } = authResult
  const { supabase } = ctx

  // -------------------------------------------------------
  // Validate query params
  // -------------------------------------------------------
  const { searchParams } = new URL(request.url)
  const queryParsed = koboSyncProgressQuerySchema.safeParse({
    syncLogId: searchParams.get('syncLogId'),
  })

  if (!queryParsed.success) {
    return NextResponse.json(
      { error: 'Invalid syncLogId parameter' },
      { status: 400 },
    )
  }

  const { syncLogId } = queryParsed.data

  // -------------------------------------------------------
  // Verify sync log exists and user has access
  // -------------------------------------------------------
  const { data: syncLog } = await supabase
    .from('kobo_sync_logs')
    .select('id, cooperative_id, status')
    .eq('id', syncLogId)
    .maybeSingle()

  if (!syncLog) {
    return NextResponse.json(
      { error: 'Sync log not found' },
      { status: 404 },
    )
  }

  // Tenant access check
  const tenantResult = await assertTenantAccess(syncLog.cooperative_id)
  if (!tenantResult.ok) return tenantResult.response

  // -------------------------------------------------------
  // SSE Stream
  // -------------------------------------------------------
  const encoder = new TextEncoder()
  const startTime = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: KoboSyncSSEEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`
        controller.enqueue(encoder.encode(data))
      }

      let isActive = true

      // Listen for client disconnect
      request.signal.addEventListener('abort', () => {
        isActive = false
      })

      try {
        while (isActive) {
          // Check timeout
          if (Date.now() - startTime > MAX_DURATION_MS) {
            sendEvent({
              type: 'error',
              message: 'Timeout: sync took too long',
            })
            break
          }

          // Poll sync log status
          const { data: current } = await supabase
            .from('kobo_sync_logs')
            .select(
              'status, submissions_received, submissions_processed, submissions_matched, submissions_errors, duration_ms, error_details, completed_at',
            )
            .eq('id', syncLogId)
            .single()

          if (!current) {
            sendEvent({ type: 'error', message: 'Sync log not found' })
            break
          }

          const total = current.submissions_received ?? 0
          const processed = current.submissions_processed ?? 0

          if (current.status === 'success' || current.status === 'partial') {
            // Sync completed
            sendEvent({
              type: 'complete',
              result: {
                success: current.status === 'success',
                syncLogId,
                received: total,
                processed,
                matched: current.submissions_matched ?? 0,
                unmatched: processed - (current.submissions_matched ?? 0),
                errors: current.submissions_errors ?? 0,
                duration: current.duration_ms ?? (Date.now() - startTime),
              },
            })
            break
          }

          if (current.status === 'failed') {
            const errorDetails = current.error_details as Record<string, unknown> | null
            sendEvent({
              type: 'error',
              message: (errorDetails?.error as string) ?? 'Sync failed',
            })
            break
          }

          // Still in progress
          sendEvent({
            type: 'progress',
            current: processed,
            total: total > 0 ? total : processed + 1, // Avoid 0/0
            status: 'processing',
          })

          // Wait before next poll
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Stream error'
        log.error('SSE stream error', { error: message, syncLogId })
        try {
          sendEvent({ type: 'error', message: 'Internal error' })
        } catch {
          // Controller may already be closed
        }
      } finally {
        try {
          controller.close()
        } catch {
          // Already closed
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
