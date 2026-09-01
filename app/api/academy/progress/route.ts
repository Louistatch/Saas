import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { member_id, module_id, lesson_id, status, score } = await request.json()
  if (!member_id || !module_id) return NextResponse.json({ error: 'member_id et module_id requis' }, { status: 400 })

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

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ progress: data })
}
