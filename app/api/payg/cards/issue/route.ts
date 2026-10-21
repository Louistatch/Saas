// Émission d'une carte : commerciale (1 crédit, les offerts d'abord) ou numérique gratuite
// (quota historique de la coopérative). Les garanties (droits, verrou, une commission par
// carte, aucun crédit perdu sur échec, rejeu sans second débit) sont dans
// payg_issue_member_card ; cette route vérifie l'adhésion puis traduit la réponse.

import { readJson } from '@/lib/payg/http'
import { outcomeOf } from '@/lib/payg/model'
import { issueMemberCard, requirePaygMember } from '@/lib/payg/server'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  partner_id: z.string().uuid(),
  member_id: z.string().uuid(),
  mode: z.enum(['commercial', 'free_allowance']),
  card_format: z.enum(['digital', 'plastified', 'pvc']),
  producer_price_fcfa: z.number().int().min(0).max(100_000).nullable().optional(),
  idempotency_key: z.string().min(8).max(100),
})

export async function POST(request: NextRequest) {
  const limit = rateLimit(`payg-issue:${clientKeyFromHeaders(request.headers)}`, 60, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })

  const parsed = bodySchema.safeParse(await readJson(request))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  const body = parsed.data
  // Une carte numérique gratuite n'a pas de format imprimé.
  if (body.mode === 'free_allowance' && body.card_format !== 'digital') {
    return NextResponse.json({ error: 'La carte gratuite est numérique' }, { status: 400 })
  }

  const guard = await requirePaygMember(body.partner_id)
  if (!guard.ok) return guard.response

  try {
    const result = await issueMemberCard(guard.ctx.admin, {
      actorId: guard.ctx.userId,
      partnerId: body.partner_id,
      memberId: body.member_id,
      mode: body.mode,
      cardFormat: body.card_format,
      producerPriceFcfa: body.producer_price_fcfa ?? null,
      idempotencyKey: body.idempotency_key,
    })
    const { status, message } = outcomeOf(result.outcome)
    return NextResponse.json({ ...result, message }, { status })
  } catch {
    return NextResponse.json({ error: 'Émission impossible, aucun crédit pris.' }, { status: 502 })
  }
}
