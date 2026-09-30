import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { processPhotoFaceCrop } from '@/lib/photos/process-photo'

// Admin-only maintenance route: batch re-run face-crop on all member photos.
// Requires an authenticated cooperative_admin or super_admin session.
export async function POST(req: NextRequest) {
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

  // `?force=1` reprend AUSSI les photos déjà recadrées. Sans lui la requête
  // excluait `%-face.jpg%`, c'est-à-dire précisément les photos à rattraper
  // après le passage du carré 1:1 au format 7:9 de la carte.
  const force = new URL(req.url).searchParams.get('force') === '1'

  // Deux requêtes distinctes plutôt qu'un builder réassigné : réaffecter le
  // query builder de supabase-js fait diverger l'inférence (TS2589).
  const { data: members } = force
    ? await supabase
        .from('members')
        .select('id, photo_url, photo_original_url')
        .not('photo_url', 'is', null)
    : await supabase
        .from('members')
        .select('id, photo_url, photo_original_url')
        .not('photo_url', 'is', null)
        .not('photo_url', 'like', '%-face.jpg%')

  if (!members?.length) return NextResponse.json({ processed: 0, force })

  let processed = 0
  let skipped = 0
  let failed = 0

  for (const member of members) {
    // `.not('photo_url', 'is', null)` le garantit côté requête ; le redire ici
    // met la garantie sous le contrôle du compilateur.
    if (!member.photo_url) continue
    // Toujours repartir de l'original quand il est connu : recadrer un
    // recadrage ne peut que perdre de l'information.
    const source = member.photo_original_url ?? member.photo_url
    const faceUrl = await processPhotoFaceCrop(source, member.id, { force })
    if (faceUrl && faceUrl !== source) {
      await supabase
        .from('members')
        .update({
          photo_url: faceUrl,
          photo_original_url: member.photo_original_url ?? member.photo_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', member.id)
      processed++
    } else if (faceUrl) {
      skipped++
    } else {
      failed++
    }
  }

  return NextResponse.json({ processed, skipped, failed, total: members.length, force })
}
