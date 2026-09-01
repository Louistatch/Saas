import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data, error } = await supabase
    .from('academy_modules')
    .select('*, academy_lessons(*)')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  // Sort lessons by order_index
  if (data.academy_lessons) {
    (data.academy_lessons as Array<{ order_index: number }>).sort((a, b) => a.order_index - b.order_index)
  }

  return NextResponse.json({ module: data })
}
