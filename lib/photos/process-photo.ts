import 'server-only'

import sharp from 'sharp'
import { createClient } from '@/lib/supabase/admin'

const BUCKET = 'member-photos'

/**
 * Portrait geometry — MUST stay 7:9, the ratio of the card's portrait window
 * (lib/card-engine/renderer.ts, PW/PH) and of the upload frame
 * (components/shared/photo-upload.tsx).
 *
 * This used to produce a 600×600 SQUARE. The card window is 7:9, so the square
 * was cropped a second time when the card was rendered — the picture was
 * framed twice, by two different rules, and the head ended up off-centre and
 * too small. Cropping once, to the exact ratio the card uses, removes the
 * second crop entirely.
 */
const OUT_W = 700
const OUT_H = 900

/**
 * Downloads a photo from Supabase Storage, crops it to the card's 7:9 portrait
 * ratio, re-uploads it as a "-face.jpg" variant and returns the new public URL.
 *
 * ⚠️ `position: 'attention'` is sharp's SALIENCY heuristic — the region of
 * highest entropy — NOT face detection, whatever the old comment here claimed.
 * On a portrait shot against a busy background, or with a patterned shirt, it
 * can lock onto the wrong thing. The head bias below compensates: on a human
 * portrait the head sits in the upper half, so after the saliency crop we keep
 * the upper part of the frame rather than its middle.
 *
 * If the photo was already processed (URL ends with -face.jpg) returns it as-is.
 * Returns null on any failure so callers can fall back to the original.
 */
export async function processPhotoFaceCrop(
  originalUrl: string,
  memberId: string,
  opts?: {
    /**
     * Re-crop a photo that already carries the `-face.jpg` name.
     *
     * Needed because photos processed before the 7:9 change are square, and
     * the original they came from is unrecoverable: `members.photo_url` was
     * overwritten with the crop, and originals sit in per-cooperative folders
     * under `<timestamp>-<uuid>.<ext>` with nothing tying them to a member.
     * Re-cropping the square is therefore the best available repair — and the
     * sizing below makes sure it is a repair and not a downgrade.
     */
    force?: boolean
  },
): Promise<string | null> {
  try {
    if (originalUrl.includes('-face.jpg') && !opts?.force) return originalUrl

    const res = await fetch(originalUrl)
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())

    const meta = await sharp(buffer).metadata()
    const srcW = meta.width ?? 0
    const srcH = meta.height ?? 0

    // A source WIDER than 7:9 has to lose height. Cropping from the middle
    // decapitates a standing subject, so take the top instead — that is where
    // a head is. A source already taller than 7:9 loses width, where centring
    // is correct.
    const srcRatio = srcW && srcH ? srcW / srcH : 0
    const targetRatio = OUT_W / OUT_H
    const position = srcRatio > targetRatio ? sharp.gravity.north : sharp.strategy.attention

    // Never upscale. Re-cropping an old 600×600 square up to 700×900 would
    // enlarge it 1.5× and hand back a softer picture than the one it replaced —
    // a repair that makes things worse. Fit the 7:9 box inside what the source
    // actually has instead.
    let outW = OUT_W
    let outH = OUT_H
    if (srcW && srcH) {
      const maxH = Math.min(OUT_H, srcH, Math.round((srcW * OUT_H) / OUT_W))
      outH = maxH
      outW = Math.round((maxH * OUT_W) / OUT_H)
    }

    const cropped = await sharp(buffer)
      .rotate() // honour EXIF orientation: phone photos are otherwise sideways
      .resize(outW, outH, { fit: 'cover', position })
      .jpeg({ quality: 88, progressive: true })
      .toBuffer()

    const supabase = createClient()
    const path = `${memberId}-face.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, cropped, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    if (error) return null

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    // Bust the CDN cache: the path is stable (memberId-face.jpg), so a
    // reprocessed photo would otherwise keep serving the old crop.
    return `${data.publicUrl}?v=${Date.now()}`
  } catch {
    return null
  }
}
