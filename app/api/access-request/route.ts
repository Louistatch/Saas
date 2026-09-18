// Demande d'accès à la couche organisationnelle.
//
// Les comptes organisationnels (faîtière, union, coopérative) ne s'ouvrent pas
// en autonomie : une coopérative est une entité réelle qu'on ne s'auto-attribue
// pas. Le demandeur dépose une demande, le super_admin crée le compte.
//
// Deux entrées :
//   • visiteur non connecté  → formulaire /auth/signup
//   • compte Haroo existant  → « Rejoindre une organisation » depuis /haroo
// Dans le second cas, la demande porte l'identifiant du compte pour que
// l'admin promeuve le compte existant plutôt que d'en créer un doublon, ce qui
// ferait perdre au professionnel son profil et sa carte Haroo.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAccessContext } from '@/lib/security/assert-access'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'

const log = createLogger('api:access-request')

const schema = z.object({
  organizationName: z.string().trim().min(2, 'Nom de l\'organisation requis').max(150),
  contactName: z.string().trim().min(2, 'Nom du contact requis').max(100),
  // Aligné sur accessRequestSchema (lib/validators/schemas.ts) : une règle
  // plus stricte ici produirait un rejet serveur après une validation client
  // réussie, donc une erreur générique incompréhensible pour le demandeur.
  phone: z
    .string()
    .trim()
    .min(1, 'Le téléphone est requis')
    .max(40)
    .regex(/^[+0-9 ()\-.]*$/, 'Téléphone invalide'),
  email: z.string().trim().email('Email invalide').optional().or(z.literal('')),
  type: z.enum(['faitiere', 'union', 'cooperative']).default('cooperative'),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
})

const TYPE_LABELS: Record<string, string> = {
  faitiere: 'Faîtière',
  union: 'Union',
  cooperative: 'Coopérative',
}

export async function POST(request: NextRequest) {
  const limit = rateLimit(`access-req:${clientKeyFromHeaders(request.headers)}`, 5, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Trop de demandes. Réessayez dans une minute.' },
      { status: 429 },
    )
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    )
  }
  const data = parsed.data

  // Optionnel : la route sert aussi les visiteurs anonymes.
  const ctx = await getAccessContext()

  if (ctx && ctx.role !== 'none' && ctx.role !== 'guest') {
    return NextResponse.json(
      { error: 'Ce compte dispose déjà d\'une organisation' },
      { status: 409 },
    )
  }

  // contact_messages n'a pas de colonne d'email nullable : on retombe sur une
  // adresse technique dérivée du téléphone quand le demandeur n'en donne pas,
  // ce que fait déjà le formulaire public.
  const email = data.email || `${data.phone.replace(/\D/g, '')}@demande.faitierehub.com`

  const details = [
    `Type : ${TYPE_LABELS[data.type] ?? data.type}`,
    `Organisation : ${data.organizationName}`,
    `Contact : ${data.contactName}`,
    `Téléphone : ${data.phone}`,
    ctx ? `Compte existant à promouvoir : ${ctx.userId}` : 'Nouveau compte à créer',
    ctx?.harooType ? `Profil Haroo à conserver : ${ctx.harooType}` : null,
    data.message ? `\nMessage :\n${data.message}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const supabase = await createClient()
    const { error } = await supabase.from('contact_messages').insert({
      name: data.contactName,
      email,
      category: 'cooperative',
      subject: `Demande d'accès — ${TYPE_LABELS[data.type] ?? data.type} ${data.organizationName}`,
      message: details,
    })

    if (error) {
      log.error('Access request insert error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
  } catch (error) {
    log.error('Access request error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: 'Demande enregistrée. Notre équipe vous recontacte sous 48 h.',
    linked_account: !!ctx,
  })
}
