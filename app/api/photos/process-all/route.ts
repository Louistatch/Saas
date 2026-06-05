import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { processPhotoFaceCrop } from '@/lib/photos/process-photo'

export async function POST(_req: NextRequest) {
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
