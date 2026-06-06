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

  // Persist score asynchronously — fire-and-forget, never blocks response
  void Promise.resolve(supabase.rpc('upsert_member_ats', { p_member_id: id })).catch(() => null)

  return NextResponse.json(data)
}
