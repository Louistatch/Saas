// Règlement manuel d'une créance organisation (§46 du plan : jamais de
// virement automatisé prétendu). super_admin uniquement — le règlement
// réel se passe hors plateforme, cette route ne fait qu'en tracer la trace.

import { settleOrganizationEarning } from '@/lib/cards/print-orders'
import { emailCooperativeAdmins } from '@/lib/email/resend'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'

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
  // La garde `status = 'available'` de settleOrganizationEarning garantit un
  // seul règlement réussi, donc un seul e-mail aux administrateurs bénéficiaires.
  after(async () => {
    const { data: earning } = await admin
      .from('organization_earnings')
      .select('cooperative_id, amount_fcfa, currency, settlement_reference')
      .eq('id', earningId)
      .maybeSingle()
    if (!earning) return
    await emailCooperativeAdmins(earning.cooperative_id, 'Règlement de votre créance effectué', {
      title: 'Votre créance a été réglée',
      lines: [
        'Bonjour,',
        `Le règlement de ${Number(earning.amount_fcfa).toLocaleString('fr-FR')} ${earning.currency} a été effectué.`,
        earning.settlement_reference ? `Référence : ${earning.settlement_reference}` : '',
      ].filter(Boolean),
      cta: { label: 'Ouvrir mon tableau de bord', path: '/dashboard' },
    })
  })

  return NextResponse.json(result)
}
