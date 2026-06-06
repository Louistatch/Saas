import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .rpc('calculate_member_ats', { p_member_id: id })

  if (error || !data) {
    return NextResponse.json({ error: 'Calcul impossible' }, { status: 404 })
  }

  return NextResponse.json(data)
}
