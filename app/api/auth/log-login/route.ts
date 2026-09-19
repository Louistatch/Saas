import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Enregistre une connexion — appelé par AuthProvider sur l'événement
 * SIGNED_IN (jamais sur INITIAL_SESSION/TOKEN_REFRESHED, pour ne compter
 * qu'une vraie connexion, pas chaque rechargement de page). L'identité vient
 * de la session cookie authentifiée, jamais d'une valeur envoyée par le
 * client — un appel avec une session absente ou expirée est silencieusement
 * ignoré (204), pas une erreur.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 204 })

  const forwardedFor = request.headers.get('x-forwarded-for')
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0]?.trim() : null

  const admin = createAdminClient()
  await admin.from('user_login_events').insert({
    user_id: user.id,
    ip_address: ipAddress,
    user_agent: request.headers.get('user-agent'),
  })

  return new NextResponse(null, { status: 204 })
}
