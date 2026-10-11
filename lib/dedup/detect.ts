import 'server-only'

// Détection des doublons pour la page admin « Doublons » : organisations au nom proche et
// personnes inscrites deux fois. Les paires sont proposées, jamais fusionnées sans décision.
import type { createClient } from '@/lib/supabase/admin'
import { ORG_REVIEW, organizationSimilarity, personKey, phoneKey, samePerson } from './names'

type Admin = ReturnType<typeof createClient>

export interface OrgSide {
  id: string
  name: string
  level: string | null
  created_at: string
  members: number
}
export interface MemberSide {
  id: string
  name: string
  cooperative: string | null
  phone_end: string | null
  date_of_birth: string | null
  created_at: string
  card: string | null
  has_photo: boolean
}
export interface Pair<T> {
  score: number
  keep: T
  archive: T
}

export async function findDuplicates(admin: Admin) {
  const [{ data: coops }, { data: members }, { data: cards }] = await Promise.all([
    admin
      .from('cooperatives')
      .select('id, name, level, created_at, parent_id')
      .is('deleted_at', null),
    admin
      .from('members')
      .select(
        'id, first_name, last_name, phone, date_of_birth, created_at, cooperative_id, photo_url',
      )
      .is('deleted_at', null)
      .limit(20000),
    admin.from('member_cards').select('member_id, card_number').eq('status', 'active').limit(20000),
  ])
  const orgRows = (coops ?? []) as {
    id: string
    name: string
    level: string | null
    created_at: string
  }[]
  const memberRows = (members ?? []) as {
    id: string
    first_name: string | null
    last_name: string | null
    phone: string | null
    date_of_birth: string | null
    created_at: string
    cooperative_id: string | null
    photo_url: string | null
  }[]
  const countByCoop = new Map<string, number>()
  for (const m of memberRows) {
    if (m.cooperative_id)
      countByCoop.set(m.cooperative_id, (countByCoop.get(m.cooperative_id) ?? 0) + 1)
  }
  const coopName = new Map(orgRows.map((c) => [c.id, c.name]))
  const cardOf = new Map(
    ((cards ?? []) as { member_id: string; card_number: string }[]).map((c) => [
      c.member_id,
      c.card_number,
    ]),
  )

  // Organisations : comparaison deux à deux au même niveau (quelques centaines au plus).
  const organizations: Pair<OrgSide>[] = []
  const org = (c: (typeof orgRows)[number]): OrgSide => ({
    id: c.id,
    name: c.name,
    level: c.level,
    created_at: c.created_at,
    members: countByCoop.get(c.id) ?? 0,
  })
  for (let i = 0; i < orgRows.length; i++) {
    for (let j = i + 1; j < orgRows.length; j++) {
      const a = orgRows[i]
      const b = orgRows[j]
      if ((a.level ?? '') !== (b.level ?? '')) continue
      const score = organizationSimilarity(a.name, b.name)
      if (score < ORG_REVIEW) continue
      // On propose de garder la plus fournie, puis la plus ancienne.
      const [keep, archive] =
        (countByCoop.get(a.id) ?? 0) > (countByCoop.get(b.id) ?? 0) ||
        ((countByCoop.get(a.id) ?? 0) === (countByCoop.get(b.id) ?? 0) &&
          a.created_at <= b.created_at)
          ? [a, b]
          : [b, a]
      organizations.push({ score, keep: org(keep), archive: org(archive) })
    }
  }

  // Membres : on ne compare que dans un même groupe (même téléphone, ou même nom replié).
  const buckets = new Map<string, typeof memberRows>()
  for (const m of memberRows) {
    for (const key of [phoneKey(m.phone) && `t:${phoneKey(m.phone)}`, `n:${personKey(m)}`]) {
      if (!key || key === 'n:') continue
      const list = buckets.get(key) ?? []
      list.push(m)
      buckets.set(key, list)
    }
  }
  const seen = new Set<string>()
  const memberPairs: Pair<MemberSide>[] = []
  const side = (m: (typeof memberRows)[number]): MemberSide => ({
    id: m.id,
    name: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim(),
    cooperative: m.cooperative_id ? (coopName.get(m.cooperative_id) ?? null) : null,
    phone_end: phoneKey(m.phone)?.slice(-4) ?? null,
    date_of_birth: m.date_of_birth,
    created_at: m.created_at,
    card: cardOf.get(m.id) ?? null,
    has_photo: !!m.photo_url,
  })
  for (const list of buckets.values()) {
    if (list.length < 2 || list.length > 50) continue
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        const id = [a.id, b.id].sort().join(':')
        if (seen.has(id)) continue
        seen.add(id)
        const { same, score } = samePerson(a, b)
        if (!same) continue
        const [keep, archive] = a.created_at <= b.created_at ? [a, b] : [b, a]
        memberPairs.push({ score, keep: side(keep), archive: side(archive) })
      }
    }
  }

  organizations.sort((x, y) => y.score - x.score)
  memberPairs.sort((x, y) => y.score - x.score)
  return { organizations, members: memberPairs }
}
