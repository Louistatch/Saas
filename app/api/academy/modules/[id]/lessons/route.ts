import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertTenantAccess } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/server'

const lessonSchema = z.object({
  title: z.string().trim().min(2).max(200),
  content_type: z.string().trim().min(1).max(40),
  content_body: z.string().max(50_000).optional().nullable(),
  duration_min: z.coerce.number().int().min(0).max(10_000).optional().nullable(),
  order_index: z.coerce.number().int().min(0).max(10_000).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Module introuvable' }, { status: 404 })
  const parsed = lessonSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Titre et type obligatoires' }, { status: 400 })
  const { title, content_type, content_body, duration_min, order_index } = parsed.data

  const supabase = await createClient()
  const { data: mod } = await supabase
    .from('academy_modules')
    .select('cooperative_id')
    .eq('id', id)
    .maybeSingle()
  if (!mod?.cooperative_id) return NextResponse.json({ error: 'Module introuvable' }, { status: 404 })
  // Ajouter une leçon = administrer la coopérative du module.
  const guard = await assertTenantAccess(mod.cooperative_id)
  if (!guard.ok) return guard.response

  const { data, error } = await supabase
    .from('academy_lessons')
    .insert({ module_id: id, title, content_type, content_body, duration_min, order_index: order_index ?? 0 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Création impossible' }, { status: 400 })
  return NextResponse.json({ lesson: data }, { status: 201 })
}
