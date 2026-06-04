/**
 * POST /api/admin/migrate-photos
 * 
 * One-time migration: copies member photos from old Supabase project
 * (txlybwrstklyzcltkjzc) to current project (hhnswekjgbxckluqnszo).
 * 
 * Steps per member:
 *  1. Download photo from old public URL
 *  2. Upload to current project's member-photos bucket
 *  3. Update member.photo_url with new URL
 * 
 * Call once then delete this endpoint.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'

const OLD_HOST = 'txlybwrstklyzcltkjzc.supabase.co'
const NEW_HOST = 'hhnswekjgbxckluqnszo.supabase.co'

export async function POST() {
  const supabase = createClient()

  // 1. Find all members with photo_url pointing to old project
  const { data: members, error } = await supabase
    .from('members')
    .select('id, first_name, last_name, photo_url')
    .not('photo_url', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const toMigrate = (members ?? []).filter(m => 
    m.photo_url && m.photo_url.includes(OLD_HOST)
  )

  if (toMigrate.length === 0) {
    return NextResponse.json({ message: 'No photos to migrate', migrated: 0 })
  }

  const results: { id: string; name: string; status: string; newUrl?: string }[] = []

  for (const member of toMigrate) {
    const name = `${member.first_name} ${member.last_name}`
    try {
      // Download from old project (public URL)
      const res = await fetch(member.photo_url!, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) {
        results.push({ id: member.id, name, status: `download failed: ${res.status}` })
        continue
      }

      const blob = await res.blob()
      const buffer = Buffer.from(await blob.arrayBuffer())

      // Generate new storage path
      const ext = member.photo_url!.split('.').pop() ?? 'jpeg'
      const storagePath = `${member.id}/photo.${ext}`

      // Upload to new project storage
      const { error: uploadError } = await supabase.storage
        .from('member-photos')
        .upload(storagePath, buffer, {
          contentType: blob.type || 'image/jpeg',
          upsert: true,
        })

      if (uploadError) {
        results.push({ id: member.id, name, status: `upload failed: ${uploadError.message}` })
        continue
      }

      // Get new public URL
      const { data: urlData } = supabase.storage
        .from('member-photos')
        .getPublicUrl(storagePath)

      const newUrl = urlData.publicUrl

      // Update member record
      const { error: updateError } = await supabase
        .from('members')
        .update({ photo_url: newUrl })
        .eq('id', member.id)

      if (updateError) {
        results.push({ id: member.id, name, status: `update failed: ${updateError.message}` })
        continue
      }

      results.push({ id: member.id, name, status: 'migrated', newUrl })
    } catch (err) {
      results.push({ id: member.id, name, status: `error: ${err instanceof Error ? err.message : 'unknown'}` })
    }
  }

  return NextResponse.json({
    message: `Migration complete`,
    total: toMigrate.length,
    migrated: results.filter(r => r.status === 'migrated').length,
    results,
  })
}
