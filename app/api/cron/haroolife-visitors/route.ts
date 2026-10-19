import { timingSafeEqual } from 'node:crypto'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Daily: removes the HarooLife visitors (anonymous accounts) gone for 30 days, who can no longer
 * find their game anyway. The rules (who is kept) live in the SQL function:
 * supabase/migrations/20261017_120000_haroolife_visitor_purge.sql.
 */
function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  try {
    const a = Buffer.from(authHeader.slice(7))
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
  const { data, error } = await createAdminClient().rpc('haroolife_purge_visitors', {
    p_days: 30,
    p_limit: 500,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
