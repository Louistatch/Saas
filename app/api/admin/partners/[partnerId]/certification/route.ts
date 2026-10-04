// Validation manuelle de la certification Opérateur — mécanisme pilote
// (§9 du plan), super_admin uniquement.
//
// `assertRole` RETOURNE { ok, response } — ne lève pas. Voir la mise en
// garde dans app/api/admin/agritogo/[...path]/route.ts : un
// `await assertRole('super_admin')` dont le résultat n'est pas exploité
// n'est pas une garde, c'est une route ouverte à tout le monde.
//
// N'exécute jamais la transition elle-même : délègue à lib/partners/
// certification.ts, la même fonction qu'un futur moteur d'examen
// appellerait (§10 du plan).

import { emailUser } from '@/lib/email/resend'
import {
  activatePartnerOperator,
  markPartnerTrainingCompleted,
  recordPartnerExamResult,
} from '@/lib/partners/certification'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mark_training_completed'),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('record_exam'),
    exam_score: z.number().int().min(0).max(100),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({ action: z.literal('activate'), note: z.string().trim().max(500).optional() }),
])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> },
) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const { partnerId } = await params
  if (!z.string().uuid().safeParse(partnerId).success) {
    return NextResponse.json({ error: 'Identifiant Partenaire invalide' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  const validatorId = guard.ctx.userId

  // Statut avant action : l'activation est idempotente, on ne prévient
  // l'Opérateur que lors de la vraie transition vers 'active'.
  const { data: before } = await admin
    .from('partners')
    .select('status')
    .eq('id', partnerId)
    .maybeSingle<{ status: string }>()

  const result = await (async () => {
    switch (parsed.data.action) {
      case 'mark_training_completed':
        return markPartnerTrainingCompleted(admin, {
          partnerId,
          validatorId,
          note: parsed.data.note,
        })
      case 'record_exam':
        return recordPartnerExamResult(admin, {
          partnerId,
          validatorId,
          examScore: parsed.data.exam_score,
          note: parsed.data.note,
        })
      case 'activate':
        return activatePartnerOperator(admin, { partnerId, validatorId, note: parsed.data.note })
    }
  })()

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Action impossible' }, { status: 422 })
  }

  if (parsed.data.action === 'activate' && before && before.status !== 'active') {
    after(async () => {
      const { data: owners } = await admin
        .from('partner_memberships')
        .select('user_id')
        .eq('partner_id', partnerId)
        .eq('membership_role', 'owner')
        .eq('status', 'active')
      await Promise.all(
        (owners ?? []).map((o) =>
          emailUser(o.user_id, 'Votre compte Opérateur est activé', {
            title: 'Bienvenue parmi les Opérateurs FaîtiereHub',
            lines: [
              'Bonjour,',
              'Votre certification Opérateur a été validée et votre compte est désormais actif.',
              'Vous pouvez dès maintenant accéder à votre espace Opérateur.',
            ],
            cta: { label: 'Ouvrir mon espace Opérateur', path: '/operator' },
          }),
        ),
      )
    })
  }

  return NextResponse.json(result)
}
