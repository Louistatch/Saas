import { timingSafeEqual } from 'node:crypto'
import { type DeliveryResult, deliverSms } from '@/lib/notifications/delivery'
import { createClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!secret || !authHeader?.startsWith('Bearer ')) return false
  const actual = Buffer.from(authHeader.slice(7))
  const expected = Buffer.from(secret)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

interface NotificationJob {
  id: string
  channel: string
  recipient_phone: string | null
  body_rendered: string | null
  attempts: number
  claim_token: string
}

// Schedule is defined once in vercel.json. Leases prevent concurrent workers claiming the same row.
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const processed = { sent: 0, failed: 0, remaining: 0 }
  const deadline = Date.now() + 45_000
  try {
    const supabase = createClient()
    const { error: expiryError } = await supabase
      .from('market_listings')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null)
    if (expiryError) throw new Error('Listing expiry failed')
    // One job per claim keeps the deadline bounded even when the provider is slow.
    for (let count = 0; count < 500 && Date.now() < deadline; count++) {
      const { data, error } = await supabase.rpc('claim_notification_batch', { p_limit: 1 })
      if (error) throw new Error('Notification claim failed')
      const job = (data as NotificationJob[] | null)?.[0]
      if (!job) break
      const result: DeliveryResult =
        job.channel === 'sms'
          ? await deliverSms(job.recipient_phone, job.body_rendered)
          : job.channel === 'in_app'
            ? { ok: true }
            : { ok: false, retryable: false, error: 'Unsupported notification channel' }
      const terminal = !result.ok && (!result.retryable || job.attempts >= 3)
      const { data: finished, error: finishError } = await supabase
        .from('notification_queue')
        .update({
          status: result.ok ? 'sent' : terminal ? 'failed' : 'pending',
          attempts: terminal ? 3 : job.attempts,
          sent_at: result.ok ? new Date().toISOString() : null,
          last_error: result.ok ? null : result.error,
          scheduled_at: new Date(Date.now() + 60_000 * 2 ** job.attempts).toISOString(),
          locked_until: null,
          claim_token: null,
        })
        .eq('id', job.id)
        .eq('claim_token', job.claim_token)
        .select('id')
      if (finishError || !finished?.length) throw new Error('Notification acknowledgement failed')
      if (result.ok) processed.sent++
      else processed.failed++
    }
    const { count, error } = await supabase
      .from('notification_queue')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'failed'])
      .lt('attempts', 3)
    if (error) throw new Error('Notification backlog check failed')
    processed.remaining = count ?? 0
    if (processed.failed || processed.remaining)
      console.error('[notifications] Delivery attention required', processed)
    return NextResponse.json(processed, { status: processed.failed ? 503 : 200 })
  } catch (error) {
    console.error(
      '[notifications] Worker failed',
      error instanceof Error ? error.message : 'Unknown error',
    )
    return NextResponse.json(
      { error: 'Notification processing failed', ...processed },
      { status: 500 },
    )
  }
}
