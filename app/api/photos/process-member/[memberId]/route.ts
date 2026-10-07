import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { assertRole, assertTenantAccess } from '@/lib/security/assert-access'
import { processPhotoFaceCrop } from '@/lib/photos/process-photo'

// Admin-only maintenance route: re-run face-crop for a specific member.
// Requires an authenticated cooperative_admin or super_admin session.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const guard = await assertRole('cooperative_admin')
  if (!guard.ok) return guard.response

  const { memberId } = await params
  const supabase = createClient()

  const { data: member, error } = await supabase
    .from('members')
    .select('photo_url, photo_original_url, cooperative_id')
    .eq('id', memberId)
    .single()

  if (error || !member?.photo_url) {
    return NextResponse.json({ error: 'Membre introuvable ou sans photo' }, { status: 404 })
  }

  // Le client service-role contourne la RLS : vérifier ici que le membre
  // appartient à une coopérative accessible à l'appelant.
  const tenant = await assertTenantAccess(member.cooperative_id)
  if (!tenant.ok) return tenant.response

  // Recadrer depuis l'ORIGINAL quand il existe : repartir du recadrage déjà
  // fait ne peut que perdre de l'information. `force` permet de reprendre une
  // photo déjà nommée -face.jpg, ce qui est le cas de toutes celles d'avant le
  // passage en 7:9.
  const source = member.photo_original_url ?? member.photo_url
  const faceUrl = await processPhotoFaceCrop(source, memberId, { force: true })
  if (!faceUrl) {
    return NextResponse.json({ error: 'Traitement échoué' }, { status: 500 })
  }

  await supabase
    .from('members')
    .update({
      photo_url: faceUrl,
      photo_original_url: member.photo_original_url ?? member.photo_url,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memberId)

  return NextResponse.json({ url: faceUrl })
}
