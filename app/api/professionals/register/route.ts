// Inscription d'un professionnel du conseil agricole par un Opérateur
// officier (ou le super_admin), pour une faîtière de SES mandats.
//
// GET  → faîtières pour lesquelles le compte courant peut inscrire.
// POST { profession, faitiereId, firstName, lastName, phone, email, specialisations? }
//   → crée le compte auth (confirmation e-mail selon REQUIRE_EMAIL_CONFIRMATION,
//     mot de passe aléatoire jamais communiqué : le titulaire définit le sien
//     via le lien « mot de passe oublié » envoyé ici), profiles.role 'none',
//     haroo_type 'agronome', et le profil haroo_agronome_profiles rattaché à
//     la faîtière, EN_ATTENTE. Le dossier suit ensuite la validation normale.

import { randomBytes } from 'node:crypto'
import { isEmailConfirmationRequired, sendConfirmationEmail } from '@/lib/auth/email-confirmation'
import { decideRegistrationFaitiere } from '@/lib/professionals/core'
import { professionalRegisterSchema } from '@/lib/professionals/schemas'
import {
  getMandatedFaitiereIds,
  isExistingFaitiere,
  listFaitieres,
} from '@/lib/professionals/server'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { flattenZodErrors } from '@/lib/validators/schemas'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

const PROFILE_WAIT_ATTEMPTS = 8
const PROFILE_WAIT_MS = 400

async function waitForProfile(admin: ReturnType<typeof createAdminClient>, userId: string) {
  for (let attempt = 0; attempt < PROFILE_WAIT_ATTEMPTS; attempt += 1) {
    const { data } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (data) return true
    await new Promise((resolve) => setTimeout(resolve, PROFILE_WAIT_MS))
  }
  return false
}

/** Lien « définir mon mot de passe » (flux standard de réinitialisation). */
async function sendPasswordSetupEmail(email: string, origin: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return false
  const supabase = createSupabaseClient(url, anon, { auth: { persistSession: false } })
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset-password`,
  })
  return !error
}

export async function GET() {
  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response
  const admin = createAdminClient()
  const all = await listFaitieres(admin)
  if (auth.ctx.role === 'super_admin') return NextResponse.json({ faitieres: all })
  const mandated = new Set(await getMandatedFaitiereIds())
  return NextResponse.json({ faitieres: all.filter((f) => mandated.has(f.id)) })
}

export async function POST(request: NextRequest) {
  const limit = rateLimit(`pro-register:${clientKeyFromHeaders(request.headers)}`, 20, 600_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })

  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response

  const parsed = professionalRegisterSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', fields: flattenZodErrors(parsed.error) },
      { status: 400 },
    )
  }
  const input = parsed.data

  const mandated = auth.ctx.role === 'super_admin' ? [] : await getMandatedFaitiereIds()
  if (
    !decideRegistrationFaitiere({
      role: auth.ctx.role,
      requestedFaitiereId: input.faitiereId,
      mandatedFaitiereIds: mandated,
    })
  ) {
    return NextResponse.json(
      { error: 'Vous n’avez pas de mandat sur cette faîtière' },
      { status: 403 },
    )
  }

  const admin = createAdminClient()
  if (!(await isExistingFaitiere(admin, input.faitiereId))) {
    return NextResponse.json({ error: 'Faîtière inconnue' }, { status: 400 })
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    // Jamais communiqué : le titulaire choisit son mot de passe par e-mail.
    password: randomBytes(24).toString('base64url'),
    email_confirm: !isEmailConfirmationRequired(),
    app_metadata: { haroo_type: 'AGRONOME', registered_by: auth.ctx.userId },
    user_metadata: { first_name: input.firstName, last_name: input.lastName, phone: input.phone },
  })
  if (authError || !created.user) {
    const duplicate = authError?.message.toLowerCase().includes('already')
    return NextResponse.json(
      {
        error: duplicate
          ? 'Un compte existe déjà avec cette adresse e-mail.'
          : 'Création du compte impossible. Réessayez.',
      },
      { status: duplicate ? 409 : 502 },
    )
  }

  const userId = created.user.id
  const rollback = async () => {
    await admin.auth.admin.deleteUser(userId)
  }

  if (!(await waitForProfile(admin, userId))) {
    await rollback()
    return NextResponse.json({ error: 'Initialisation du profil impossible.' }, { status: 502 })
  }

  // Couche Haroo uniquement ; la couche organisationnelle reste 'none'.
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      role: 'none',
      cooperative_id: null,
      haroo_type: 'agronome',
    })
    .eq('id', userId)
  if (profileError) {
    await rollback()
    return NextResponse.json({ error: 'Création du profil impossible.' }, { status: 502 })
  }

  const { data: pro, error: proError } = await admin
    .from('haroo_agronome_profiles')
    .insert({
      user_id: userId,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      profession: input.profession,
      faitiere_id: input.faitiereId,
      specialisations: input.specialisations ?? [],
    })
    .select('id')
    .single<{ id: string }>()
  if (proError || !pro) {
    await rollback()
    return NextResponse.json({ error: 'Création du dossier impossible.' }, { status: 502 })
  }

  const verifyEmail = isEmailConfirmationRequired()
  if (verifyEmail) await sendConfirmationEmail(input.email)
  const passwordEmail = await sendPasswordSetupEmail(input.email, request.nextUrl.origin)

  return NextResponse.json({
    success: true,
    profile_id: pro.id,
    verify_email: verifyEmail,
    password_email_sent: passwordEmail,
  })
}
