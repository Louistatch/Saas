import { publicName } from '@/lib/haroolife/domain/actor'
// Membres d'une coopérative, paginés côté serveur (20 par page) et filtrables par nom.
// Réservé aux administrateurs de l'organisation ou de son arbre : un simple membre voit
// l'effectif, pas la liste. Noms publics seulement (prénom et initiale), jamais de contact.
import type { MemberCard, MembersPage } from '@/lib/haroolife/domain/cooperative'
import { computeCardStatus } from '@/lib/professionals/core'
import { getAccessContext } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cooperativeAccess } from '../route'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const PAGE = 20
const query = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  q: z.string().trim().max(60).default(''),
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.HAROOLIFE_ENABLED !== 'true')
    return NextResponse.json({ error: 'HarooLife est en préparation.' }, { status: 503, headers })
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400, headers })
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success)
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400, headers })
  const ctx = await getAccessContext()
  if (!ctx) return NextResponse.json({ error: 'Connexion requise' }, { status: 401, headers })
  if (
    !rateLimit(
      `haroolife-members:${ctx.userId}:${clientKeyFromHeaders(request.headers)}`,
      60,
      60_000,
    ).ok
  )
    return NextResponse.json({ error: 'Trop de demandes.' }, { status: 429, headers })
  const access = await cooperativeAccess(ctx, id)
  if (access !== 'admin')
    return NextResponse.json(
      { error: 'La liste des membres est réservée aux administrateurs de l’organisation.' },
      { status: 403, headers },
    )

  const { page, q } = parsed.data
  const admin = createAdminClient()
  let req = admin
    .from('members')
    .select('id, first_name, last_name, status, canton, cantons(name)', { count: 'exact' })
    .eq('cooperative_id', id)
    .is('deleted_at', null)
  if (q) {
    const safe = q.replace(/[%_,()]/g, ' ')
    req = req.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`)
  }
  const { data, count } = await req
    .order('last_name')
    .order('first_name')
    .range((page - 1) * PAGE, page * PAGE - 1)
  const rows = (data ?? []) as unknown as {
    id: string
    first_name: string
    last_name: string
    status: string
    canton: string | null
    cantons: { name: string } | null
  }[]
  const cardsByMember = new Map<
    string,
    { status: string; expiry_date: string | null; revoked_at: string | null }
  >()
  if (rows.length) {
    const { data: cards } = await admin
      .from('member_cards')
      .select('member_id, status, expiry_date, revoked_at')
      .in(
        'member_id',
        rows.map((r) => r.id),
      )
      .is('deleted_at', null)
    for (const c of (cards ?? []) as {
      member_id: string
      status: string
      expiry_date: string | null
      revoked_at: string | null
    }[])
      if (!cardsByMember.has(c.member_id)) cardsByMember.set(c.member_id, c)
  }
  const items: MemberCard[] = rows.map((r) => {
    const card = cardsByMember.get(r.id)
    return {
      id: r.id,
      name: publicName(r.first_name, r.last_name),
      status: r.status,
      canton: r.cantons?.name ?? r.canton,
      hasCard: Boolean(card),
      cardStatus: card ? computeCardStatus(card) : 'NONE',
    }
  })
  const body: MembersPage = { items, page, pageSize: PAGE, total: count ?? items.length }
  return NextResponse.json(body, { headers })
}
