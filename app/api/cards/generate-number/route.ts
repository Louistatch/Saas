/**
 * POST /api/cards/generate-number  (SEC-02)
 *
 * Returns a cryptographically-secure, collision-checked card number for a
 * cooperative. Replaces the client-side Math.random() generation in the cards
 * dashboard, which was both non-secure and prone to collisions at scale.
 *
 * Body: { cooperativeId: uuid }
 *
 * @security assertAuthenticated + assertTenantAccess(cooperativeId)
 * @security rate limited via the 'auth' bucket (cheap anti-spam)
 */
import { NextRequest, NextResponse } from 'next/server'
import { assertTenantAccess } from '@/lib/security/assert-access'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { cardPrefix, generateUniqueCardNumber } from '@/lib/utils/card-number'
import { createLogger } from '@/lib/utils/logger'
import { z } from 'zod'

const log = createLogger('api:cards:generate-number')

const bodySchema = z.object({
  cooperativeId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const rateLimitBlock = await applyRateLimit(request, 'auth')
  if (rateLimitBlock) return rateLimitBlock

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid cooperativeId' }, { status: 400 })
  }
  const { cooperativeId } = parsed.data

  // Authn + tenant access (also yields the user-scoped supabase client).
  const tenant = await assertTenantAccess(cooperativeId)
  if (!tenant.ok) return tenant.response
  const { supabase } = tenant.ctx

  // Resolve a prefix from the cooperative (or its faitiere) name.
  const { data: coop } = await supabase
    .from('cooperatives')
    .select('name, faitiere_name')
    .eq('id', cooperativeId)
    .maybeSingle()

  const prefix = cardPrefix(coop?.name ?? coop?.faitiere_name ?? 'COP')

  try {
    const cardNumber = await generateUniqueCardNumber(supabase, prefix)
    return NextResponse.json({ cardNumber })
  } catch (err: unknown) {
    log.error('Failed to generate unique card number', {
      cooperativeId,
      error: err instanceof Error ? err.message : 'unknown',
    })
    return NextResponse.json(
      { error: 'Impossible de générer un numéro de carte unique' },
      { status: 500 },
    )
  }
}
