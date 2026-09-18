/**
 * POST /api/auth/complete-signup  (AUTH-03)
 *
 * Server-side completion of the signup flow when email confirmation is OFF
 * (session is immediately available after signUp). When email confirmation
 * is ON, this same logic runs inside GET /auth/callback after code exchange.
 *
 * @security session-authenticated + service_role for the privileged insert
 * @security rate limited via the 'auth' bucket
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { runCompleteSignup } from '@/lib/auth/complete-signup'

export async function POST(request: NextRequest) {
  const rateLimitBlock = await applyRateLimit(request, 'auth')
  if (rateLimitBlock) return rateLimitBlock

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const cooperativeName = (body as { cooperativeName?: unknown })?.cooperativeName
  if (typeof cooperativeName !== 'string') {
    return NextResponse.json({ error: 'cooperativeName is required' }, { status: 400 })
  }

  const supabase = await createServerClient()
  const result = await runCompleteSignup(supabase, cooperativeName)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true, cooperativeId: result.cooperativeId })
}
