// Décision sur un dossier professionnel (agronome).
//
// POST { decision: 'VALIDE' | 'REJETE', reason? }
//   - super_admin : tout dossier (repli) ;
//   - Opérateur officier : dossiers rattachés à une faîtière sur laquelle il
//     détient un mandat actif portant 'professionals.validate'.
//   VALIDE → badge, traçabilité, émission automatique de la carte.
//   REJETE → motif obligatoire.

import { decideProfessional } from '@/lib/professionals/server'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  decision: z.enum(['VALIDE', 'REJETE']),
  reason: z.string().trim().max(500).optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limit = rateLimit(`pro-decision:${clientKeyFromHeaders(request.headers)}`, 30, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })

  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }

  const result = await decideProfessional({
    ctx: auth.ctx,
    profileId: id,
    decision: parsed.data.decision,
    reason: parsed.data.reason ?? null,
    defer: (task) => after(task),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true, ...result })
}
