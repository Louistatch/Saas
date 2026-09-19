// Règlement manuel d'une créance organisation (§46 du plan : jamais de
// virement automatisé prétendu). super_admin uniquement — le règlement
// réel se passe hors plateforme, cette route ne fait qu'en tracer la trace.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { settleOrganizationEarning } from '@/lib/cards/print-orders'

const bodySchema = z.object({
  settlement_method: z.enum(['bank_transfer', 'mobile_money', 'cash', 'other']),
  settlement_reference: z.string().trim().max(120).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ earningId: string }> },
) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const { earningId } = await params
  if (!z.string().uuid().safeParse(earningId).success) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  const result = await settleOrganizationEarning(admin, {
    earningId,
    settledBy: guard.ctx.userId,
    settlementMethod: parsed.data.settlement_method,
    settlementReference: parsed.data.settlement_reference,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Action impossible' }, { status: 422 })
  }
  return NextResponse.json(result)
}
