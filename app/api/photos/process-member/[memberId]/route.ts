import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { processPhotoFaceCrop } from '@/lib/photos/process-photo'

// Admin-only maintenance route: re-run face-crop for a specific member.
// Requires an authenticated cooperative_admin or super_admin session.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const serverClient = await createServerClient()
  const { data: { user }, error: authError } = await serverClient.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile } = await serverClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['cooperative_admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { memberId } = await params
  const supabase = createClient()

  const { data: member, error } = await supabase
    .from('members')
    .select('photo_url')
    .eq('id', memberId)
    .single()

  if (error || !member?.photo_url) {
    return NextResponse.json({ error: 'Membre introuvable ou sans photo' }, { status: 404 })
  }

  const faceUrl = await processPhotoFaceCrop(member.photo_url, memberId)
  if (!faceUrl) {
    return NextResponse.json({ error: 'Traitement échoué' }, { status: 500 })
  }

  await supabase
    .from('members')
    .update({ photo_url: faceUrl, updated_at: new Date().toISOString() })
    .eq('id', memberId)

  return NextResponse.json({ url: faceUrl })
}
