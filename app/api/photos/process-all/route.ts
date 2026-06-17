import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { processPhotoFaceCrop } from '@/lib/photos/process-photo'

// Admin-only maintenance route: batch re-run face-crop on all member photos.
// Requires an authenticated cooperative_admin or super_admin session.
export async function POST(_req: NextRequest) {
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

  const supabase = createClient()

  const { data: members } = await supabase
    .from('members')
    .select('id, photo_url')
    .not('photo_url', 'is', null)
    .not('photo_url', 'like', '%-face.jpg%')

  if (!members?.length) return NextResponse.json({ processed: 0 })

  let processed = 0
  let failed = 0

  for (const member of members) {
    const faceUrl = await processPhotoFaceCrop(member.photo_url!, member.id)
    if (faceUrl) {
      await supabase
        .from('members')
        .update({ photo_url: faceUrl, updated_at: new Date().toISOString() })
        .eq('id', member.id)
      processed++
    } else {
      failed++
    }
  }

  return NextResponse.json({ processed, failed, total: members.length })
}
