import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { processPhotoFaceCrop } from '@/lib/photos/process-photo'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const { memberId } = await params
  const supabase = createClient()

  const { data: member, error } = await supabase
    .from('members')
    .select('photo_url')
    .eq('id', memberId)
    .single()

  if (error || !member?.photo_url) {
    return NextResponse.json({ error: 'member not found or no photo' }, { status: 404 })
  }

  const faceUrl = await processPhotoFaceCrop(member.photo_url, memberId)
  if (!faceUrl) {
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }

  await supabase
    .from('members')
    .update({ photo_url: faceUrl, updated_at: new Date().toISOString() })
    .eq('id', memberId)

  return NextResponse.json({ url: faceUrl })
}
