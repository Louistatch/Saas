import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { z } from 'zod'

const log = createLogger('api:contact-request')

const contactSchema = z.object({
  member_id: z.string().uuid('ID membre invalide'),
  buyer_name: z.string().min(2, 'Nom requis (min 2 caractères)').max(100),
  message: z.string().min(10, 'Message trop court (min 10 caractères)').max(1000),
  buyer_phone: z.string().max(20).optional(),
})

/**
 * POST /api/contact-request
 * Public endpoint to send a contact request to a certified supplier.
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit(`contact-req:${clientKeyFromHeaders(request.headers)}`, 5, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Trop de demandes. Réessayez dans une minute.' },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const parsed = contactSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', issues: parsed.error.issues.map(i => i.message) },
      { status: 400 },
    )
  }

  try {
    const supabase = await createClient()

    // Verify member exists and is active
    const { data: member } = await supabase
      .from('members')
      .select('id, status')
      .eq('id', parsed.data.member_id)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Fournisseur non trouvé' }, { status: 404 })
    }

    // Insert contact request
    const { error } = await supabase.from('contact_requests').insert({
      member_id: parsed.data.member_id,
      buyer_name: parsed.data.buyer_name,
      message: parsed.data.message,
      buyer_phone: parsed.data.buyer_phone ?? null,
    })

    if (error) {
      log.error('Contact request insert error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Demande envoyée avec succès' })
  } catch (error) {
    log.error('Contact request error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
