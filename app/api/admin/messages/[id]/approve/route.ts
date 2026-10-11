// Accepter une demande d'accès : crée l'organisation, crée le compte (ou promeut le compte
// existant), en fait l'administrateur, lui envoie « définir mon mot de passe », classe le message.
// super_admin uniquement ; chaque étape est journalisée. Aucune suppression.
import { parseAccessRequest } from '@/lib/admin/access-request-parse'
import { audit, checkParent, organisationSchema } from '@/lib/admin/cooperatives'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  organisation: organisationSchema,
  email: z.string().trim().toLowerCase().email().max(120),
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  // Faîtière annoncée mais pas encore inscrite : nom affiché (cartes), rattachement plus tard.
  faitiere_name: z.string().trim().max(120).optional(),
})

async function waitForProfile(admin: ReturnType<typeof createAdminClient>, userId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (data) return true
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return false
}

async function sendPasswordSetupEmail(email: string, origin: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return false
  const client = createSupabaseClient(url, anon, { auth: { persistSession: false } })
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset-password`,
  })
  return !error
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides' },
      { status: 400 },
    )
  }
  const input = parsed.data
  const admin = createAdminClient()

  const { data: msg } = await admin
    .from('contact_messages')
    .select('id, category, message, status')
    .eq('id', id)
    .maybeSingle()
  if (!msg || msg.category !== 'cooperative') {
    return NextResponse.json(
      { error: 'Ce message n’est pas une demande d’accès.' },
      { status: 404 },
    )
  }
  if (msg.status !== 'nouveau') {
    return NextResponse.json({ error: 'Cette demande a déjà été traitée.' }, { status: 409 })
  }
  const request_ = parseAccessRequest(msg.message)

  // Compte : celui qui a fait la demande s'il était connecté, sinon par e-mail (existant ou créé).
  let userId = request_.existingUserId
  let created = false
  if (!userId) {
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', input.email)
      .maybeSingle()
    userId = existing?.id ?? null
  }
  if (userId) {
    const { data: profile } = await admin
      .from('profiles')
      .select('role, deleted_at')
      .eq('id', userId)
      .maybeSingle()
    if (!profile || profile.deleted_at)
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    if (profile.role === 'super_admin' || profile.role === 'cooperative_admin') {
      return NextResponse.json(
        { error: 'Ce compte administre déjà une organisation : traitez la demande à la main.' },
        { status: 409 },
      )
    }
  }

  const parentError = await checkParent(admin, input.organisation)
  if (parentError) return NextResponse.json({ error: parentError }, { status: 422 })
  const { data: coop, error: coopError } = await admin
    .from('cooperatives')
    .insert({
      name: input.organisation.name,
      description: input.organisation.description || null,
      primary_color: input.organisation.primary_color,
      level: input.organisation.level,
      parent_id:
        input.organisation.level === 'faitiere' ? null : (input.organisation.parent_id ?? null),
      faitiere_name: input.organisation.parent_id ? null : input.faitiere_name || null,
    })
    .select('id')
    .single()
  if (coopError || !coop)
    return NextResponse.json({ error: 'Création de l’organisation impossible' }, { status: 502 })
  await audit(admin, guard.ctx.userId, 'cooperative_created', coop.id, { from_access_request: id })

  if (!userId) {
    const { data: user, error } = await admin.auth.admin.createUser({
      email: input.email,
      email_confirm: true,
      user_metadata: { first_name: input.first_name, last_name: input.last_name },
    })
    if (error || !user.user || !(await waitForProfile(admin, user.user.id))) {
      return NextResponse.json(
        {
          error:
            'L’organisation est créée, mais pas le compte (adresse peut-être déjà utilisée). Rattachez la personne depuis Utilisateurs.',
          cooperative_id: coop.id,
        },
        { status: 502 },
      )
    }
    userId = user.user.id
    created = true
  }

  const { error: roleError } = await admin
    .from('profiles')
    .update({ role: 'cooperative_admin', cooperative_id: coop.id })
    .eq('id', userId)
  if (roleError) {
    return NextResponse.json(
      { error: 'Compte prêt, mais le rôle n’a pas pu être donné : faites-le depuis Utilisateurs.' },
      { status: 502 },
    )
  }
  await admin.from('audit_logs').insert({
    user_id: guard.ctx.userId,
    action: 'access_request_approved',
    resource: 'contact_messages',
    resource_id: id,
    details: { cooperative_id: coop.id, account: userId, account_created: created },
  })
  await admin.from('contact_messages').update({ status: 'traite' }).eq('id', id)

  const emailed = created
    ? await sendPasswordSetupEmail(input.email, request.nextUrl.origin)
    : false
  return NextResponse.json({ ok: true, cooperative_id: coop.id, account_created: created, emailed })
}
