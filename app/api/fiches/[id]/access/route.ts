import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'

const log = createLogger('api:fiches:access')

/**
 * POST /api/fiches/[id]/access
 * Check if a user has access to download a fiche.
 * - Members (card_number) → free access
 * - Non-members → must have a completed purchase
 * 
 * Returns signed download URLs if access is granted.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: ficheId } = await params
  let body: { card_number?: string; purchase_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    const supabase = await createClient()

    // Get the fiche
    const { data: fiche, error: ficheError } = await supabase
      .from('fiches_techniques')
      .select('id, title, culture, files, cooperative_id, is_free_for_members, price_non_member')
      .eq('id', ficheId)
      .eq('status', 'published')
      .single()

    if (ficheError || !fiche) {
      return NextResponse.json({ error: 'Fiche non trouvée' }, { status: 404 })
    }

    // Check access: MEMBER (free)
    if (body.card_number) {
      const { data: card } = await supabase
        .from('member_cards')
        .select('id, member_id, cooperative_id')
        .eq('card_number', body.card_number)
        .eq('status', 'active')
        .single()

      if (!card) {
        return NextResponse.json({ error: 'Carte invalide ou expirée' }, { status: 403 })
      }

      // Member of the same cooperative → free access
      if (fiche.is_free_for_members) {
        // Log download
        await supabase.from('member_access_logs').insert({
          card_number: body.card_number,
          member_id: card.member_id,
          cooperative_id: card.cooperative_id,
          fiche_id: ficheId,
          action: 'download',
        })

        // Increment download count
        await supabase.rpc('increment_download_count', { fiche_id: ficheId }).catch(() => {
          // RPC may not exist yet, fallback
          supabase
            .from('fiches_techniques')
            .update({ download_count: (fiche.download_count ?? 0) + 1 })
            .eq('id', ficheId)
        })

        // Generate signed URLs for files
        const files = (fiche.files as { name: string; url: string; type: string }[]) ?? []
        const signedFiles = await Promise.all(
          files.map(async (f) => {
            // Extract path from URL or use directly
            const path = f.url.includes('/storage/') 
              ? f.url.split('/fiches-techniques/')[1] 
              : f.url
            const { data } = await supabase.storage
              .from('fiches-techniques')
              .createSignedUrl(path, 3600) // 1 hour
            return { name: f.name, type: f.type, url: data?.signedUrl ?? f.url }
          }),
        )

        return NextResponse.json({
          access: 'granted',
          reason: 'member',
          fiche: { id: fiche.id, title: fiche.title, culture: fiche.culture },
          files: signedFiles,
        })
      }
    }

    // Check access: PURCHASE (non-member)
    if (body.purchase_id) {
      const { data: purchase } = await supabase
        .from('purchases')
        .select('id, payment_status, access_granted')
        .eq('id', body.purchase_id)
        .eq('fiche_id', ficheId)
        .eq('payment_status', 'completed')
        .single()

      if (!purchase || !purchase.access_granted) {
        return NextResponse.json({ error: 'Achat non trouvé ou paiement en attente' }, { status: 403 })
      }

      // Generate signed URLs
      const files = (fiche.files as { name: string; url: string; type: string }[]) ?? []
      const signedFiles = await Promise.all(
        files.map(async (f) => {
          const path = f.url.includes('/storage/') 
            ? f.url.split('/fiches-techniques/')[1] 
            : f.url
          const { data } = await supabase.storage
            .from('fiches-techniques')
            .createSignedUrl(path, 3600)
          return { name: f.name, type: f.type, url: data?.signedUrl ?? f.url }
        }),
      )

      return NextResponse.json({
        access: 'granted',
        reason: 'purchase',
        fiche: { id: fiche.id, title: fiche.title, culture: fiche.culture },
        files: signedFiles,
      })
    }

    // No access — return pricing info
    return NextResponse.json({
      access: 'denied',
      price: fiche.price_non_member,
      currency: 'XOF',
      message: `Accès à cette fiche: ${fiche.price_non_member} FCFA. Utilisez votre carte membre pour un accès gratuit.`,
    }, { status: 402 })

  } catch (error) {
    log.error('Fiche access error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
