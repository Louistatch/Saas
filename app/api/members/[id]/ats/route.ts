import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, cooperative_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profil introuvable' }, { status: 403 })
  }

  // Only admins or members of the same cooperative can query ATS
  if (profile.role !== 'super_admin') {
    const { data: member } = await supabase
      .from('members')
      .select('cooperative_id')
      .eq('id', id)
      .single()

    if (!member || member.cooperative_id !== profile.cooperative_id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
  }

  const { data, error } = await supabase
    .rpc('calculate_member_ats', { p_member_id: id })

  if (error || !data) {
    return NextResponse.json({ error: 'Calcul impossible' }, { status: 404 })
  }

  // Persist score asynchronously — fire-and-forget, never blocks response
  void Promise.resolve(supabase.rpc('upsert_member_ats', { p_member_id: id })).catch(() => null)

  return NextResponse.json(data)
}
