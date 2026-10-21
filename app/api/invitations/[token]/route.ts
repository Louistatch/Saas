// Invitation d'un agent (ou d'un gérant) dans une institution. Le lien porte un jeton à usage
// unique dont seule l'empreinte est stockée. Accepter : depuis un compte déjà connecté (même
// e-mail que l'invitation) ou en créant le compte. Le nouvel agent rejoint le portefeuille de
// l'institution ; il n'en reçoit pas un à lui, ni crédits offerts.

import { isEmailConfirmationRequired, sendConfirmationEmail } from '@/lib/auth/email-confirmation'
import { hashToken, readJson } from '@/lib/payg/http'
import { ensureTrainingAccount, logActivity } from '@/lib/payg/server'
import { getAccessContext } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

type Admin = ReturnType<typeof createAdminClient>

async function findInvitation(admin: Admin, token: string) {
  if (token.length < 20 || token.length > 100) return null
  const { data } = await admin
    .from('partner_agent_invitations')
    .select(
      'id, partner_id, email, full_name, membership_role, expires_at, accepted_at, revoked_at, partners(display_name, operator_kind, status)',
    )
    .eq('token_hash', hashToken(token))
    .maybeSingle<{
      id: string
      partner_id: string
      email: string
      full_name: string | null
      membership_role: 'owner' | 'manager' | 'agent'
      expires_at: string
      accepted_at: string | null
      revoked_at: string | null
      partners: { display_name: string; operator_kind: string; status: string } | null
    }>()
  return data
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const invitation = await findInvitation(createAdminClient(), token)
  if (!invitation || invitation.revoked_at) {
    return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 })
  }
  return NextResponse.json({
    institution: invitation.partners?.display_name ?? '',
    full_name: invitation.full_name,
    email: maskEmail(invitation.email),
    role: invitation.membership_role,
    accepted: Boolean(invitation.accepted_at),
    expired: new Date(invitation.expires_at) <= new Date(),
  })
}

const signupSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128),
})

async function waitForProfile(admin: Admin, userId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (data) return true
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return false
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const limit = rateLimit(`invitation-accept:${clientKeyFromHeaders(request.headers)}`, 10, 600_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de tentatives' }, { status: 429 })
  const { token } = await params
  const admin = createAdminClient()
  const invitation = await findInvitation(admin, token)
  if (!invitation || invitation.revoked_at || invitation.accepted_at) {
    return NextResponse.json({ error: 'Invitation introuvable ou déjà utilisée' }, { status: 404 })
  }
  if (new Date(invitation.expires_at) <= new Date()) {
    return NextResponse.json(
      { error: 'Invitation expirée : demandez-en une nouvelle' },
      { status: 410 },
    )
  }

  let userId: string
  let created = false
  const access = await getAccessContext()
  if (access) {
    const { data: auth } = await access.supabase.auth.getUser()
    if (auth.user?.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Connectez-vous avec l’adresse e-mail qui a reçu l’invitation.' },
        { status: 403 },
      )
    }
    userId = access.userId
  } else {
    const parsed = signupSchema.safeParse(await readJson(request))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Nom, prénom et mot de passe (8 caractères) requis' },
        { status: 400 },
      )
    }
    const { data: account, error } = await admin.auth.admin.createUser({
      email: invitation.email,
      password: parsed.data.password,
      email_confirm: !isEmailConfirmationRequired(),
      app_metadata: { account_type: 'operator' },
      user_metadata: { first_name: parsed.data.first_name, last_name: parsed.data.last_name },
    })
    if (error || !account.user) {
      const duplicate = error?.message.toLowerCase().includes('already')
      return NextResponse.json(
        {
          error: duplicate
            ? 'Un compte existe déjà avec cette adresse : connectez-vous puis rouvrez le lien.'
            : 'Création du compte impossible. Réessayez.',
        },
        { status: duplicate ? 409 : 502 },
      )
    }
    userId = account.user.id
    created = true
    if (!(await waitForProfile(admin, userId))) {
      await admin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: 'Initialisation du profil impossible' }, { status: 502 })
    }
    await admin
      .from('profiles')
      .update({ first_name: parsed.data.first_name, last_name: parsed.data.last_name })
      .eq('id', userId)
  }

  // Adhésion (réactivée si l'agent avait été retiré), dossier de formation, compte de frais.
  const { error: membershipError } = await admin.from('partner_memberships').upsert(
    {
      partner_id: invitation.partner_id,
      user_id: userId,
      membership_role: invitation.membership_role,
      status: 'active',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'partner_id,user_id' },
  )
  if (membershipError) {
    return NextResponse.json({ error: 'Adhésion impossible' }, { status: 502 })
  }
  const { data: existingCert } = await admin
    .from('partner_certifications')
    .select('partner_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (!existingCert) {
    await admin
      .from('partner_certifications')
      .insert({ user_id: userId, partner_id: invitation.partner_id })
  }
  await ensureTrainingAccount(admin, userId, invitation.partner_id, 'institution')
  await admin
    .from('partner_agent_invitations')
    .update({ accepted_by: userId, accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)
    .is('accepted_at', null)
  await logActivity(admin, {
    partnerId: invitation.partner_id,
    actorId: userId,
    action: 'agent.joined',
    details: { role: invitation.membership_role },
  })

  const verifyEmail = created && isEmailConfirmationRequired()
  if (verifyEmail) await sendConfirmationEmail(invitation.email)
  return NextResponse.json({
    ok: true,
    created,
    verify_email: verifyEmail,
    // Un compte déjà certifié pour un autre opérateur garde ce dossier : il devra être
    // certifié pour l'institution par l'équipe FaîtièreHub (un dossier par compte).
    certification_elsewhere: Boolean(
      existingCert && existingCert.partner_id !== invitation.partner_id,
    ),
    redirect_to: '/console',
  })
}
