/**
 * GET /auth/confirm?token_hash=…&type=signup|email|recovery|magiclink
 *
 * Lien reçu par e-mail (modèles Supabase réglés sur cette route). Vérifié côté
 * serveur avec verifyOtp, puis la personne est orientée selon son compte —
 * jamais vers une URL venue de la requête (pas de redirection ouverte).
 */

import { accountHomeUrl } from '@/lib/account/journey'
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
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, haroo_type')
    .eq('id', user.id)
    .maybeSingle()
  const home = profile
    ? accountHomeUrl({ role: profile.role, harooType: profile.haroo_type })
    : '/compte'
  return NextResponse.redirect(`${base}${home}?confirmed=1`)
}
