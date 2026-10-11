// Résumé « ce qui se passe » pour la console de validation : dossiers à instruire dans le
// périmètre du compte, état du pilote HarooLife et derniers événements, avec des constats
// rédigés pour décider vite. super_admin : tout ; opérateur officier : ses faîtières ;
// administrateur de la coopérative du pilote : HarooLife.
import { getMandatedFaitiereIds } from '@/lib/professionals/server'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const DAY = 86_400_000

interface HarooLifeActivity {
  enabled: boolean
  cooperative_id: string | null
  cooperative: string | null
  canton: string | null
  workers_available: number
  producers_with_account: number
  recruiters: number
  groups_open: number
  groups_ready: number
  groups_new_24h: number
  groups_expiring_12h: number
}
type Insight = { level: 'urgent' | 'attention' | 'info'; text: string; link: string }

export async function GET(request: NextRequest) {
  if (!rateLimit(`admin-activity:${clientKeyFromHeaders(request.headers)}`, 30, 60_000).ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }
  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response
  const isSuper = auth.ctx.role === 'super_admin'
  const mandated = isSuper ? null : await getMandatedFaitiereIds()
  const admin = createAdminClient()

  const { data: hl } = await admin.rpc('admin_activity_haroolife')
  const haroolife = (hl as HarooLifeActivity | null) ?? null
  const seesHarooLife =
    isSuper ||
    (auth.ctx.role === 'cooperative_admin' &&
      haroolife?.cooperative_id != null &&
      auth.ctx.cooperativeId === haroolife.cooperative_id)
  const seesDossiers = isSuper || (mandated?.length ?? 0) > 0
  if (!seesDossiers && !seesHarooLife) {
    return NextResponse.json(
      { error: 'Réservé aux validateurs et administrateurs' },
      { status: 403 },
    )
  }

  const insights: Insight[] = []
  let dossiers: {
    pending: number
    new_24h: number
    oldest_days: number
    without_faitiere: number
  } | null = null
  if (seesDossiers) {
    let query = admin
      .from('haroo_agronome_profiles')
      .select('created_at, faitiere_id')
      .eq('statut_validation', 'EN_ATTENTE')
      .order('created_at', { ascending: true })
      .limit(500)
    if (mandated) query = query.in('faitiere_id', mandated)
    const { data } =
      await query.returns<{ created_at: string | null; faitiere_id: string | null }[]>()
    const rows = data ?? []
    const now = Date.now()
    const ages = rows.map((r) => (r.created_at ? now - new Date(r.created_at).getTime() : 0))
    dossiers = {
      pending: rows.length,
      new_24h: ages.filter((a) => a < DAY).length,
      oldest_days: rows.length ? Math.floor(Math.max(...ages) / DAY) : 0,
      without_faitiere: rows.filter((r) => !r.faitiere_id).length,
    }
    if (dossiers.oldest_days >= 3) {
      insights.push({
        level: 'urgent',
        text: `Le plus ancien dossier attend depuis ${dossiers.oldest_days} jours : traitez-le en premier.`,
        link: '/operator/professionals',
      })
    }
    if (isSuper && dossiers.without_faitiere > 0) {
      insights.push({
        level: 'attention',
        text: `${dossiers.without_faitiere} dossier(s) sans faîtière : vous seul pouvez les instruire.`,
        link: '/operator/professionals',
      })
    }
  }

  if (seesHarooLife && haroolife?.enabled) {
    if (haroolife.workers_available === 0) {
      insights.push({
        level: 'attention',
        text: `Aucun ouvrier disponible à ${haroolife.canton} : les équipes HarooLife ne peuvent pas se remplir.`,
        link: '/haroolife',
      })
    }
    if (haroolife.producers_with_account === 0) {
      insights.push({
        level: 'attention',
        text: `Aucun producteur de ${haroolife.cooperative} n’a encore de compte : personne ne peut regrouper ses surfaces.`,
        link: '/haroolife',
      })
    }
    if (haroolife.groups_ready > 0) {
      insights.push({
        level: 'info',
        text: `${haroolife.groups_ready} groupe(s) HarooLife ont atteint leur objectif : à confirmer avec les participants.`,
        link: '/haroolife',
      })
    }
    if (haroolife.groups_expiring_12h > 0) {
      insights.push({
        level: 'urgent',
        text: `${haroolife.groups_expiring_12h} groupe(s) incomplet(s) expirent dans moins de 12 h.`,
        link: '/haroolife',
      })
    }
  }

  const { data: events } = await admin.rpc('admin_recent_events', {
    p_user: auth.ctx.userId,
    p_limit: 10,
  })
  const order = { urgent: 0, attention: 1, info: 2 }
  insights.sort((a, b) => order[a.level] - order[b.level])
  return NextResponse.json(
    {
      dossiers,
      haroolife: seesHarooLife ? haroolife : null,
      insights,
      events: events ?? [],
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
