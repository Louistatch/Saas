import 'server-only'

import sharp from 'sharp'
import { createClient } from '@/lib/supabase/admin'

const BUCKET = 'member-photos'

/**
 * Downloads a photo from Supabase Storage, smart-crops it to a 1:1 square
 * centered on the face using sharp's attention strategy, re-uploads as
 * a "-face.jpg" variant, and returns the new public URL.
 *
 * If the photo was already processed (URL ends with -face.jpg) returns it as-is.
 * Returns null on any failure so callers can fall back to the original.
 */
export async function processPhotoFaceCrop(
  originalUrl: string,
  memberId: string,
): Promise<string | null> {
  try {
    if (originalUrl.includes('-face.jpg')) return originalUrl

    // Download original
    const res = await fetch(originalUrl)
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())

    // Smart crop 1:1 square centered on face/saliency
    const cropped = await sharp(buffer)
      .resize(600, 600, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 88, progressive: true })
      .toBuffer()

    // Upload to same bucket as memberId-face.jpg
    const supabase = createClient()
    const path = `${memberId}-face.jpg`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, cropped, {
        contentType: 'image/jpeg',
        upsert: true,
      })
    if (error) return null

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  } catch {
    return null
  }
}
