import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertTenantAccess } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/server'

const moduleSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  category: z.string().trim().min(1).max(60),
  level: z.string().trim().min(1).max(40),
  culture: z.string().trim().max(80).optional().nullable(),
  duration_min: z.coerce.number().int().min(0).max(10_000).optional().nullable(),
  cooperative_id: z.string().uuid(),
})

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const level = searchParams.get('level')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let query = supabase
    .from('academy_modules')
    .select('*, academy_lessons(id)', { count: 'exact' })
    .order('order_index')

  if (category && category !== 'tous') query = query.eq('category', category)
  if (level) query = query.eq('level', level)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  return NextResponse.json({ modules: data ?? [] })
}

export async function POST(request: NextRequest) {
  const parsed = moduleSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Champs obligatoires manquants ou invalides' }, { status: 400 })
  }
  const { title, description, category, level, culture, duration_min, cooperative_id } = parsed.data

  // Créer un module = administrer la coopérative visée (un membre ne le peut pas).
  const guard = await assertTenantAccess(cooperative_id)
  if (!guard.ok) return guard.response
  const user = { id: guard.ctx.userId }
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('academy_modules')
    .insert({ title, description, category, level, culture, duration_min, cooperative_id, is_published: false, created_by: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Création impossible' }, { status: 400 })
  return NextResponse.json({ module: data }, { status: 201 })
}
