import { timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Vercel Cron: runs every hour
// vercel.json: { "crons": [{ "path": "/api/cron/notifications", "schedule": "0 * * * *" }] }

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const provided = authHeader.slice(7)
  try {
    const a = Buffer.from(provided)
    const b = Buffer.from(secret)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const processed = { sent: 0, failed: 0, skipped: 0 }

  // Expire overdue market_listings
  await supabase
    .from('market_listings')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString())
    .not('expires_at', 'is', null)

  // Fetch pending notifications scheduled for now or past
  const { data: pending } = await supabase
    .from('notification_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .lt('attempts', 3)
    .limit(50)
    .order('scheduled_at', { ascending: true })

  if (!pending?.length) {
    return NextResponse.json({ ...processed, message: 'Nothing to process' })
  }

  for (const notif of pending) {
    try {
      let success = false

      if (notif.channel === 'sms') {
        success = await sendSMS(notif.recipient_phone, notif.body_rendered)
      } else if (notif.channel === 'in_app') {
        // in_app already written to notifications_inapp at creation
        success = true
      } else {
        processed.skipped++
        continue
      }

      await supabase
        .from('notification_queue')
        .update({
          status: success ? 'sent' : 'failed',
          sent_at: success ? new Date().toISOString() : null,
          attempts: notif.attempts + 1,
        })
        .eq('id', notif.id)

      if (success) processed.sent++
      else processed.failed++
    } catch (e) {
      await supabase
        .from('notification_queue')
        .update({ attempts: notif.attempts + 1, last_error: String(e) })
        .eq('id', notif.id)
      processed.failed++
    }
  }

  return NextResponse.json(processed)
}

async function sendSMS(phone: string | null, body: string | null): Promise<boolean> {
  if (!phone || !body) return false

  const apiKey = process.env.AFRICAS_TALKING_API_KEY
  const username = process.env.AFRICAS_TALKING_USERNAME
  if (!apiKey || !username) return false // graceful degradation

  try {
    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        apiKey: apiKey,
      },
      body: new URLSearchParams({
        username,
        to: phone,
        message: body,
        from: 'FaîtiereHub',
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
