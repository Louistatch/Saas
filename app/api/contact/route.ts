import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { z } from 'zod'

const log = createLogger('api:contact')

const contactSchema = z.object({
  name: z.string().min(2, 'Nom requis (min 2 caractères)').max(100),
  email: z.string().email('Email invalide'),
  category: z.enum(['cooperative', 'ouvrier', 'acheteur', 'agronome', 'autre']).default('autre'),
  subject: z.string().min(2, 'Sujet requis').max(150),
  message: z.string().min(10, 'Message trop court (min 10 caractères)').max(2000),
})

/**
 * POST /api/contact
 * Public marketing contact form (app/contact/page.tsx).
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit(`contact:${clientKeyFromHeaders(request.headers)}`, 5, 60_000)
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
      { error: 'Données invalides', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    )
  }

  try {
    const supabase = await createClient()
    const { error } = await supabase.from('contact_messages').insert(parsed.data)

    if (error) {
      log.error('Contact message insert error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Message envoyé avec succès' })
  } catch (error) {
    log.error('Contact message error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
