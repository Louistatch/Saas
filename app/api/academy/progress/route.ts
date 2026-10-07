import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertTenantAccess } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/server'

const progressSchema = z.object({
  member_id: z.string().uuid(),
  module_id: z.string().uuid(),
  lesson_id: z.string().uuid().optional().nullable(),
  status: z.enum(['started', 'completed']).optional(),
  score: z.coerce.number().min(0).max(100).optional().nullable(),
})

export async function POST(request: NextRequest) {
  const parsed = progressSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'member_id et module_id requis' }, { status: 400 })
  const { member_id, module_id, lesson_id, status, score } = parsed.data

  // Une progression appartient à un membre (fiche coopérative, pas un compte) :
  // seul un administrateur de sa coopérative peut l'enregistrer, sinon n'importe
  // quel compte pourrait fabriquer des résultats de formation.
  const supabase = await createClient()
  const { data: member } = await supabase
    .from('members')
    .select('cooperative_id')
    .eq('id', member_id)
    .maybeSingle()
  if (!member?.cooperative_id) return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 })
  const guard = await assertTenantAccess(member.cooperative_id)
  if (!guard.ok) return guard.response

  const { data, error } = await supabase
    .from('academy_progress')
    .upsert({
      member_id, module_id, lesson_id: lesson_id ?? null,
      status: status ?? 'started',
      score: score ?? null,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    }, { onConflict: 'member_id,module_id,lesson_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 400 })
  return NextResponse.json({ progress: data })
}
