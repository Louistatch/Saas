/**
 * GET /auth/confirm?token_hash=…&type=signup|email|recovery|magiclink
 *
 * Lien reçu par e-mail (modèles Supabase réglés sur cette route). Vérifié côté
 * serveur avec verifyOtp, puis la personne est orientée selon son compte —
 * jamais vers une URL venue de la requête (pas de redirection ouverte).
 */

import { confirmedHomePath } from '@/lib/account/confirmed-home'
import { createClient } from '@/lib/supabase/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

const TYPES: EmailOtpType[] = ['signup', 'email', 'recovery', 'magiclink', 'invite', 'email_change']

export async function GET(request: NextRequest) {
  const base = request.nextUrl.origin
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null
  if (!tokenHash || !type || !TYPES.includes(type)) {
    return NextResponse.redirect(`${base}/auth/login?error=lien_invalide`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) return NextResponse.redirect(`${base}/auth/login?error=lien_expire`)

  if (type === 'recovery') return NextResponse.redirect(`${base}/auth/reset-password`)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/auth/login?confirmed=1`)
  // Organisation, Haroo ou dossier Opérateur : la personne arrive dans SON espace.
  const home = await confirmedHomePath(supabase, user.id)
  return NextResponse.redirect(`${base}${home}?confirmed=1`)
}
