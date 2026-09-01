import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ modules: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await request.json()
  const { title, description, category, level, culture, duration_min, cooperative_id } = body

  if (!title || !category || !level) return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 })

  const { data, error } = await supabase
    .from('academy_modules')
    .insert({ title, description, category, level, culture, duration_min, cooperative_id, is_published: false, created_by: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ module: data }, { status: 201 })
}
