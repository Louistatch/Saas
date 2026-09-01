import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await request.json()
  const { title, content_type, content_body, duration_min, order_index } = body

  if (!title || !content_type) return NextResponse.json({ error: 'Titre et type obligatoires' }, { status: 400 })

  const { data, error } = await supabase
    .from('academy_lessons')
    .insert({ module_id: id, title, content_type, content_body, duration_min, order_index: order_index ?? 0 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ lesson: data }, { status: 201 })
}
