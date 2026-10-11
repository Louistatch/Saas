// Envoi d'un message d'assistance (réclamation, suggestion, aide) depuis un tableau de bord.
// Destinataires : super_admin et opérateurs de la zone de l'expéditeur, jamais lui-même.
import { emailSuperAdmins, emailUser } from '@/lib/email/resend'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { SUPPORT_CATEGORIES } from '@/lib/support'
import { rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  category: z.enum(Object.keys(SUPPORT_CATEGORIES) as [keyof typeof SUPPORT_CATEGORIES]),
  subject: z.string().trim().min(3, 'Donnez un objet de 3 caractères au moins.').max(120),
  message: z
    .string()
    .trim()
    .min(10, 'Décrivez votre demande en quelques mots (10 caractères au moins).')
    .max(2000),
  page: z.string().startsWith('/').max(200).optional(),
})

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response
  if (!rateLimit(`support:${auth.ctx.userId}`, 5, 600_000).ok) {
    return NextResponse.json(
      { error: 'Vous avez envoyé plusieurs messages : patientez quelques minutes.' },
      { status: 429 },
    )
  }
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Message invalide' },
      { status: 400 },
    )
  }
  const input = parsed.data
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name, email, cooperative_id, role, haroo_type')
    .eq('id', auth.ctx.userId)
    .maybeSingle()
  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Utilisateur'
  const cooperativeId = profile?.cooperative_id ?? null
  const label = SUPPORT_CATEGORIES[input.category]
  const details = [
    input.message,
    '',
    `Compte : ${profile?.role ?? 'inconnu'}${profile?.haroo_type ? `, Haroo ${profile.haroo_type}` : ''}`,
    input.page ? `Envoyé depuis : ${input.page}` : null,
  ]
    .filter((l) => l !== null)
    .join('\n')

  const { error } = await admin.from('contact_messages').insert({
    name,
    email: profile?.email ?? 'inconnu@faitierehub.com',
    category: `support:${input.category}`,
    subject: input.subject,
    message: details,
    user_id: auth.ctx.userId,
    cooperative_id: cooperativeId,
  })
  if (error) return NextResponse.json({ error: 'Envoi impossible. Réessayez.' }, { status: 502 })

  after(async () => {
    const mail = {
      title: `${label} : ${input.subject}`,
      lines: [
        `De ${name}${profile?.email ? ` (${profile.email})` : ''}.`,
        input.message.slice(0, 600),
      ],
      cta: { label: 'Lire et répondre', path: '/admin/messages' },
    }
    await emailSuperAdmins(`${label} reçue sur FaîtiereHub`, mail)
    if (cooperativeId) {
      const { data: operators } = await admin.rpc('support_zone_operators', {
        p_coop: cooperativeId,
        p_exclude: auth.ctx.userId,
      })
      await Promise.all(
        ((operators as string[] | null) ?? []).map((id) =>
          emailUser(id, `${label} d’une organisation de votre zone`, {
            ...mail,
            cta: { label: 'Lire et répondre', path: '/operator/messages' },
          }),
        ),
      )
    }
  })

  return NextResponse.json({ ok: true, reply_to: profile?.email ?? null })
}
