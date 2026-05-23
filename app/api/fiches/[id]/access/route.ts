import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'

const log = createLogger('api:fiches:access')

/**
 * POST /api/fiches/[id]/access
 * Check if a user has access to download a fiche.
 * - Members (card_number) → free access (fiches are locality-based, any valid member gets access)
 * - Non-members → must have a completed purchase
 * 
 * Returns signed download URLs if access is granted.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Rate limiting to prevent card_number brute-force
  const clientKey = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`fiches-access:${clientKey}`, 20, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de tentatives' }, { status: 429 })
  }

  const { id: ficheId } = await params
  let body: { card_number?: string; purchase_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Validate inputs
  if (!body.card_number && !body.purchase_id) {
    return NextResponse.json({ error: 'card_number ou purchase_id requis' }, { status: 400 })
  }

  try {
    const supabase = await createClient()

    // Get the fiche with locality info
    const { data: fiche, error: ficheError } = await supabase
      .from('fiches_techniques')
      .select('id, title, culture, files, cooperative_id, is_free_for_members, price_non_member, download_count, canton_id, prefecture_id, region_id')
      .eq('id', ficheId)
      .eq('status', 'published')
      .single()

    if (ficheError || !fiche) {
      return NextResponse.json({ error: 'Fiche non trouvée' }, { status: 404 })
    }

    // Check access: MEMBER (free) — fiches are locality-based
    // Any valid active member card grants free access to published fiches
    if (body.card_number) {
      const cardNumber = body.card_number.trim()
      if (cardNumber.length < 5) {
        return NextResponse.json({ error: 'Numéro de carte invalide' }, { status: 400 })
      }

      const { data: card } = await supabase
        .from('member_cards')
        .select('id, member_id, cooperative_id, expiry_date')
        .eq('card_number', cardNumber)
        .eq('status', 'active')
        .single()

      if (!card) {
        return NextResponse.json({ error: 'Carte invalide ou expirée' }, { status: 403 })
      }

      // Check card expiry
      if (card.expiry_date && new Date(card.expiry_date) < new Date()) {
        return NextResponse.json({ error: 'Votre carte a expiré' }, { status: 403 })
      }

      // Fiches are locality-based: any valid member gets free access
      if (fiche.is_free_for_members) {
        // Log download
        await supabase.from('member_access_logs').insert({
          card_number: cardNumber,
          member_id: card.member_id,
          cooperative_id: card.cooperative_id,
          fiche_id: ficheId,
          action: 'download',
        })

        // Increment download count atomically
        const { error: rpcError } = await supabase.rpc('increment_download_count', { target_fiche_id: ficheId })
        if (rpcError) {
          // Fallback if RPC fails
          await supabase
            .from('fiches_techniques')
            .update({ download_count: (fiche.download_count ?? 0) + 1 })
            .eq('id', ficheId)
        }

        // Generate signed URLs for files
        const files = (fiche.files as { name: string; url: string; type: string }[]) ?? []
        const signedFiles = await Promise.all(
          files.map(async (f) => {
            const path = f.url.includes('/storage/')
              ? f.url.split('/fiches-techniques/')[1]
              : f.url
            if (!path) return { name: f.name, type: f.type, url: '' }
            const { data } = await supabase.storage
              .from('fiches-techniques')
              .createSignedUrl(path, 3600) // 1 hour
            return { name: f.name, type: f.type, url: data?.signedUrl ?? '' }
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
      const purchaseId = body.purchase_id.trim()
      // Validate UUID format
      if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(purchaseId)) {
        return NextResponse.json({ error: 'ID achat invalide' }, { status: 400 })
      }

      const { data: purchase } = await supabase
        .from('purchases')
        .select('id, payment_status, access_granted')
        .eq('id', purchaseId)
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
          if (!path) return { name: f.name, type: f.type, url: '' }
          const { data } = await supabase.storage
            .from('fiches-techniques')
            .createSignedUrl(path, 3600)
          return { name: f.name, type: f.type, url: data?.signedUrl ?? '' }
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
