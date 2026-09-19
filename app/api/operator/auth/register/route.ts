import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { generateUniquePartnerCode } from '@/lib/utils/partner-code'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { flattenZodErrors, operatorSignupSchema } from '@/lib/validators/schemas'
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

/**
 * Crée un compte Opérateur autonome : aucune organisation et aucun profil
 * Haroo. La capacité Opérateur reste portée par partner_memberships et
 * partner_certifications, conformément à l'architecture à trois couches.
 */
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, 'auth')
  if (blocked) return blocked

  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`operator-register:${ip}`, 5, 600_000)
  if (!limit.ok) {
    return NextResponse.json(
      { success: false, error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
      { status: 429 },
    )
  }

  const parsed = operatorSignupSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Données invalides', fields: flattenZodErrors(parsed.error) },
      { status: 400 },
    )
  }

  const { firstName, lastName, displayName, phone, email, password } = parsed.data
  const admin = createAdminClient()
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { account_type: 'operator' },
    user_metadata: { first_name: firstName, last_name: lastName },
  })

  if (authError || !created.user) {
    const duplicate = authError?.message.toLowerCase().includes('already')
    return NextResponse.json(
      {
        success: false,
        error: duplicate
          ? 'Un compte existe déjà avec cette adresse email.'
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
    return NextResponse.json(
      { success: false, error: 'Initialisation du profil impossible. Réessayez.' },
      { status: 502 },
    )
  }

  // Défense en profondeur : ce chemin crée un compte exclusivement Opérateur.
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      first_name: firstName,
      last_name: lastName,
      role: 'none',
      cooperative_id: null,
      haroo_type: null,
    })
    .eq('id', userId)
  if (profileError) {
    await rollback()
    return NextResponse.json(
      { success: false, error: 'Création du profil impossible.' },
      { status: 502 },
    )
  }

  let partnerCode: string
  try {
    partnerCode = await generateUniquePartnerCode(admin, 'XX')
  } catch {
    await rollback()
    return NextResponse.json(
      { success: false, error: 'Création du code Opérateur impossible.' },
      { status: 502 },
    )
  }

  const { data: partner, error: partnerError } = await admin
    .from('partners')
    .insert({
      partner_code: partnerCode,
      display_name: displayName,
      phone,
      email,
      status: 'candidate',
    })
    .select('id, partner_code')
    .single<{ id: string; partner_code: string }>()
  if (partnerError || !partner) {
    await rollback()
    return NextResponse.json(
      { success: false, error: 'Création du dossier Opérateur impossible.' },
      { status: 502 },
    )
  }

  const { error: membershipError } = await admin.from('partner_memberships').insert({
    partner_id: partner.id,
    user_id: userId,
    membership_role: 'owner',
    status: 'active',
  })
  const { error: certificationError } = membershipError
    ? { error: membershipError }
    : await admin.from('partner_certifications').insert({
        user_id: userId,
        partner_id: partner.id,
      })

  if (membershipError || certificationError) {
    await admin.from('partners').delete().eq('id', partner.id)
    await rollback()
    return NextResponse.json(
      { success: false, error: 'Création du parcours Opérateur impossible.' },
      { status: 502 },
    )
  }

  return NextResponse.json({
    success: true,
    partner_code: partner.partner_code,
    redirect_to: '/operator',
  })
}
