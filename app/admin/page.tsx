'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, ShoppingCart, CreditCard, Briefcase, Activity } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { timeAgo } from '@/lib/utils/time'
import { createLogger } from '@/lib/utils/logger'

const log = createLogger('admin')

interface PlatformStats {
  totalCooperatives: number
  totalMembers: number
  totalExploitations: number
  totalCards: number
  totalHarooPros: number
  faitiereCards: number
  totalUsers: number
}

interface CoopRow {
  id: string
  name: string
  level: string | null
  created_at: string
  member_count: number
  exploitation_count: number
  hierarchy_member_count: number
  hierarchy_card_count: number
}

interface StatsView {
  id: string
  name: string
  level: string | null
  created_at: string
  member_count: number | null
  exploitation_count: number | null
  active_card_count: number | null
  hierarchy_member_count: number | null
  hierarchy_card_count: number | null
}

interface PlatformTotals {
  total_cooperatives: number | string
  total_members: number | string
  total_exploitations: number | string
  total_active_cards: number | string
}

/** Événement de workflow (génération de carte, création de membre, inscription Haroo). */
interface ActivityItem {
  label: string
  detail: string
  date: string
  kind: 'card' | 'member' | 'haroo'
}

const LEVEL_LABEL: Record<string, string> = {
  faitiere: 'Faîtière',
  union: 'Union',
  cooperative: 'Coopérative',
}

const CARD_TYPE_LABEL: Record<string, string> = {
  FAITIERE: 'membre',
  OUVRIER: 'ouvrier Haroo',
  ACHETEUR: 'acheteur Haroo',
  AGRONOME: 'agronome Haroo',
}

export default function AdminOverview() {
  const supabase = useMemo(() => createClient(), [])
  const [stats, setStats] = useState<PlatformStats>({
    totalCooperatives: 0,
    totalMembers: 0,
    totalExploitations: 0,
    totalCards: 0,
    totalHarooPros: 0,
    faitiereCards: 0,
    totalUsers: 0,
  })
  const [coops, setCoops] = useState<CoopRow[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    setIsLoading(true)

    const [
      statsView,
      totalsRes,
      ouvriersRes,
      acheteursRes,
      agronomesRes,
      faitiereCardsRes,
      usersRes,
      recentCardsRes,
      recentMembersRes,
      recentHarooRes,
    ] = await Promise.all([
      supabase
        .from('cooperative_stats')
        .select('id, name, level, created_at, member_count, exploitation_count, active_card_count, hierarchy_member_count, hierarchy_card_count')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.rpc('get_platform_totals'),
      supabase.from('haroo_ouvrier_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('haroo_acheteur_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('haroo_agronome_profiles').select('id', { count: 'exact', head: true }),
      supabase
        .from('member_cards')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('card_type', 'FAITIERE'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      // ── Workflows récents ──────────────────────────────────────────────────
      supabase
        .from('member_cards')
        .select('card_number, card_type, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('members')
        .select('first_name, last_name, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('haroo_ouvrier_profiles')
        .select('first_name, last_name, created_at')
        .order('created_at', { ascending: false })
        .limit(3),
    ])

    let base = { totalCooperatives: 0, totalMembers: 0, totalExploitations: 0, totalCards: 0 }
    if (totalsRes.error) {
      log.warn('get_platform_totals RPC unavailable, falling back', totalsRes.error.code)
      const [c, m, e, k] = await Promise.all([
        supabase.from('cooperatives').select('id', { count: 'exact', head: true }),
        supabase.from('members').select('id', { count: 'exact', head: true }),
        supabase.from('fiches_techniques').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('member_cards').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      ])
      base = {
        totalCooperatives: c.count ?? 0,
        totalMembers: m.count ?? 0,
        totalExploitations: e.count ?? 0,
        totalCards: k.count ?? 0,
      }
    } else if (totalsRes.data && (totalsRes.data as PlatformTotals[])[0]) {
      const t = (totalsRes.data as PlatformTotals[])[0]
      base = {
        totalCooperatives: Number(t.total_cooperatives),
        totalMembers: Number(t.total_members),
        totalExploitations: Number(t.total_exploitations),
        totalCards: Number(t.total_active_cards),
      }
    }

    setStats({
      ...base,
      totalHarooPros:
        (ouvriersRes.count ?? 0) + (acheteursRes.count ?? 0) + (agronomesRes.count ?? 0),
      faitiereCards: faitiereCardsRes.count ?? 0,
      totalUsers: usersRes.count ?? 0,
    })

    if (!statsView.error && statsView.data) {
      setCoops(
        (statsView.data as StatsView[]).map((c) => ({
          id: c.id,
          name: c.name,
          level: c.level,
          created_at: c.created_at,
          member_count: Number(c.member_count ?? 0),
          exploitation_count: Number(c.exploitation_count ?? 0),
          hierarchy_member_count: Number(c.hierarchy_member_count ?? 0),
          hierarchy_card_count: Number(c.hierarchy_card_count ?? 0),
        })),
      )
    } else if (statsView.error) {
      log.warn('cooperative_stats view unavailable', statsView.error.code)
    }

    // ── Fusionner les workflows en un fil d'activité ──────────────────────────
    const items: ActivityItem[] = [
      ...((recentCardsRes.data ?? []) as { card_number: string; card_type: string; created_at: string }[]).map(
        (c) => ({
          label: `Carte ${CARD_TYPE_LABEL[c.card_type] ?? c.card_type} générée`,
          detail: c.card_number,
          date: c.created_at,
          kind: 'card' as const,
        }),
      ),
      ...((recentMembersRes.data ?? []) as { first_name: string; last_name: string; created_at: string }[]).map(
        (m) => ({
          label: 'Membre créé',
          detail: `${m.first_name} ${m.last_name}`,
          date: m.created_at,
          kind: 'member' as const,
        }),
      ),
      ...((recentHarooRes.data ?? []) as { first_name: string; last_name: string; created_at: string }[]).map(
        (h) => ({
          label: 'Inscription Haroo (ouvrier)',
          detail: `${h.first_name} ${h.last_name}`,
          date: h.created_at,
          kind: 'haroo' as const,
        }),
      ),
    ]
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    setActivity(items.slice(0, 8))

    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const statCards = [
    { title: 'Total coopératives', value: stats.totalCooperatives, icon: Building2, color: 'text-primary', bg: 'bg-primary/10', href: '/admin/cooperatives' },
    { title: 'Total membres', value: stats.totalMembers, icon: Users, color: 'text-primary', bg: 'bg-primary/15', href: '/admin/users' },
    { title: 'Professionnels Haroo', value: stats.totalHarooPros, icon: Briefcase, color: 'text-accent-foreground', bg: 'bg-accent/20', href: '/admin/haroo' },
    { title: 'Fiches techniques', value: stats.totalExploitations, icon: ShoppingCart, color: 'text-accent-foreground', bg: 'bg-accent/20', href: '/admin/analytics' },
    { title: 'Cartes actives', value: stats.totalCards, icon: CreditCard, color: 'text-muted-foreground', bg: 'bg-muted', href: '/admin/analytics' },
  ]

  const dotColor: Record<ActivityItem['kind'], string> = {
    card: 'bg-primary',
    member: 'bg-accent',
    haroo: 'bg-secondary-foreground',
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Tableau de bord admin" description="Vue d'ensemble et gestion de la plateforme" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {statCards.map((stat, i) => {
          const Icon = stat.icon
          return (
            <Link key={i} href={stat.href}>
              <Card className="border-border hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground font-medium">{stat.title}</p>
                      <p className="text-2xl font-bold text-foreground mt-2">
                        {isLoading ? <Spinner className="h-5 w-5" /> : stat.value.toLocaleString()}
                      </p>
                    </div>
                    <div className={`p-2 rounded-lg ${stat.bg}`}>
                      <Icon className={`h-6 w-6 ${stat.color}`} aria-hidden />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Coopératives récentes</CardTitle>
            <CardDescription>Dernières coopératives enregistrées</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingBlock />
            ) : coops.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Aucune coopérative pour le moment</p>
            ) : (
              <div className="space-y-0">
                {coops.map((coop) => {
                  // Pour une faîtière/union, le réseau (enfants inclus) est la
                  // vraie mesure d'activité — le compteur direct est trompeur.
                  const showHierarchy =
                    coop.level !== 'cooperative' &&
                    coop.hierarchy_member_count > coop.member_count
                  return (
                    <div key={coop.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{coop.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {showHierarchy
                            ? `${coop.hierarchy_member_count} membres (réseau) · ${coop.hierarchy_card_count} cartes`
                            : `${coop.member_count} membre${coop.member_count === 1 ? '' : 's'} · ${coop.exploitation_count} exploitation${coop.exploitation_count === 1 ? '' : 's'}`}
                          {' · '}
                          {timeAgo(coop.created_at)}
                        </p>
                      </div>
                      <span className="px-2 py-1 text-xs font-semibold text-primary bg-primary/10 rounded-full ml-3 shrink-0">
                        {LEVEL_LABEL[coop.level ?? ''] ?? 'Actif'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            <Link href="/admin/cooperatives" className="block mt-4">
              <Button variant="outline" size="sm" className="w-full border-border">
                Voir toutes les coopératives
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Activité récente
            </CardTitle>
            <CardDescription>Cartes générées, membres créés, inscriptions Haroo</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingBlock />
            ) : activity.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Aucune activité récente</p>
            ) : (
              <div className="space-y-0">
                {activity.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor[item.kind]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">
                        {item.label} : <span className="font-medium">{item.detail}</span>
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{timeAgo(item.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Santé de la plateforme</CardTitle>
            <CardDescription>Indicateurs clés de la plateforme</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {[
                {
                  label: 'Moy. membres / Coopérative',
                  value:
                    stats.totalCooperatives > 0
                      ? (stats.totalMembers / stats.totalCooperatives).toFixed(1)
                      : '—',
                },
                {
                  label: 'Moy. exploitations / Coopérative',
                  value:
                    stats.totalCooperatives > 0
                      ? (stats.totalExploitations / stats.totalCooperatives).toFixed(1)
                      : '—',
                },
                {
                  // Couverture = cartes membres (FAITIERE) uniquement : les
                  // cartes Haroo ne couvrent pas des membres de coopérative.
                  label: 'Couverture cartes membres',
                  value:
                    stats.totalMembers > 0
                      ? `${Math.round((stats.faitiereCards / stats.totalMembers) * 100)}%`
                      : '—',
                },
                { label: 'Professionnels Haroo inscrits', value: stats.totalHarooPros },
                { label: 'Total utilisateurs plateforme', value: stats.totalUsers },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-3 border-b border-border last:border-0"
                >
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="font-bold text-foreground">{isLoading ? '—' : item.value}</p>
                </div>
              ))}
            </div>
            <Link href="/admin/analytics" className="block mt-4">
              <Button variant="outline" size="sm" className="w-full border-border">
                Voir toutes les statistiques
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
