'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, Users, ShoppingCart, CreditCard, Briefcase, Activity, BarChart3, Leaf, Cpu, CheckCircle2, XCircle, RefreshCw, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
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

interface CoopStat {
  id: string
  name: string
  member_count: number
  exploitation_count: number
  card_count: number
}

interface AgriTogoHealth {
  status: string
  version: string
  agents: number
  models: string[]
}

interface AgriTogoProduit {
  id: number
  nom: string
  unite: string
  categorie: string
}

interface AgriTogoStats {
  total_produits?: number
  total_prix?: number
  total_marches?: number
  [key: string]: unknown
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
  const [coopStats, setCoopStats] = useState<CoopStat[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // AgriTogo
  const [agriHealth, setAgriHealth] = useState<AgriTogoHealth | null>(null)
  const [agriStats, setAgriStats] = useState<AgriTogoStats | null>(null)
  const [agriProduits, setAgriProduits] = useState<AgriTogoProduit[]>([])
  const [agriLoading, setAgriLoading] = useState(false)
  const [agriError, setAgriError] = useState<string | null>(null)

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
      const mapped = (statsView.data as StatsView[]).map((c) => ({
        id: c.id,
        name: c.name,
        level: c.level,
        created_at: c.created_at,
        member_count: Number(c.member_count ?? 0),
        exploitation_count: Number(c.exploitation_count ?? 0),
        hierarchy_member_count: Number(c.hierarchy_member_count ?? 0),
        hierarchy_card_count: Number(c.hierarchy_card_count ?? 0),
      }))
      setCoops(mapped)
      // also build full list for analytics tab (sorted by member count)
      const allStats = await supabase
        .from('cooperative_stats')
        .select('id, name, member_count, exploitation_count, active_card_count')
        .order('member_count', { ascending: false })
      if (!allStats.error && allStats.data) {
        setCoopStats(
          (allStats.data as StatsView[]).map((c) => ({
            id: c.id,
            name: c.name,
            member_count: Number(c.member_count ?? 0),
            exploitation_count: Number(c.exploitation_count ?? 0),
            card_count: Number(c.active_card_count ?? 0),
          })),
        )
      }
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

  const fetchAgriTogo = useCallback(async () => {
    setAgriLoading(true)
    setAgriError(null)
    try {
      const [healthRes, statsRes, produitsRes] = await Promise.all([
        fetch('/api/admin/agritogo/health'),
        fetch('/api/admin/agritogo/stats'),
        fetch('/api/admin/agritogo/produits'),
      ])
      if (!healthRes.ok) throw new Error('AgriTogo inaccessible')
      const [health, stats, produits] = await Promise.all([
        healthRes.json() as Promise<AgriTogoHealth>,
        statsRes.json() as Promise<AgriTogoStats>,
        produitsRes.json() as Promise<AgriTogoProduit[]>,
      ])
      setAgriHealth(health)
      setAgriStats(stats)
      setAgriProduits(Array.isArray(produits) ? produits : [])
    } catch (e: unknown) {
      setAgriError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
    setAgriLoading(false)
  }, [])

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

  const analyticsMetrics = [
    { title: 'Total coopératives', value: coopStats.length, icon: Building2 },
    { title: 'Total membres', value: coopStats.reduce((s, r) => s + r.member_count, 0), icon: Users },
    { title: 'Exploitations', value: coopStats.reduce((s, r) => s + r.exploitation_count, 0), icon: ShoppingCart },
    { title: 'Cartes actives', value: coopStats.reduce((s, r) => s + r.card_count, 0), icon: CreditCard },
  ]

  return (
    <div className="space-y-8">
      <PageHeader title="Tableau de bord admin" description="Vue d'ensemble et gestion de la plateforme" />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2"><Activity className="h-4 w-4" />Vue d&apos;ensemble</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2"><BarChart3 className="h-4 w-4" />Analytiques</TabsTrigger>
          <TabsTrigger value="agritogo" className="gap-2" onClick={() => { if (!agriHealth && !agriLoading) fetchAgriTogo() }}><Cpu className="h-4 w-4" />AgriTogo</TabsTrigger>
          <TabsTrigger value="agrismat" className="gap-2"><Leaf className="h-4 w-4" />Agrismat</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.title} href={stat.href}>
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
                {activity.map((item) => (
                  <div key={`${item.kind}-${item.label}-${item.detail}`} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
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
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between py-3 border-b border-border last:border-0"
                >
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="font-bold text-foreground">{isLoading ? '—' : item.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6 space-y-8">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {analyticsMetrics.map((m) => {
              const Icon = m.icon
              return (
                <Card key={m.title} className="border-border">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground font-medium">{m.title}</p>
                        <p className="text-2xl font-bold text-foreground mt-2">
                          {isLoading ? <Spinner className="h-5 w-5" /> : m.value.toLocaleString()}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icon className="h-6 w-6 text-primary" aria-hidden />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Performance des coopératives</CardTitle>
              <CardDescription>Toutes les coopératives classées par nombre de membres</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <LoadingBlock />
              ) : coopStats.length === 0 ? (
                <EmptyState title="Aucune coopérative pour le moment" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 font-semibold text-foreground">#</th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground">Coopérative</th>
                        <th className="text-right py-3 px-4 font-semibold text-foreground">Membres</th>
                        <th className="text-right py-3 px-4 font-semibold text-foreground">Exploitations</th>
                        <th className="text-right py-3 px-4 font-semibold text-foreground">Cartes actives</th>
                        <th className="text-right py-3 px-4 font-semibold text-foreground">Taux cartes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coopStats.map((coop, i) => {
                        const rate = coop.member_count > 0 ? coop.card_count / coop.member_count : 0
                        return (
                          <tr key={coop.id} className="border-b border-border hover:bg-accent/5 transition-colors">
                            <td className="py-3 px-4">
                              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-xs">
                                {i + 1}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-medium text-foreground">{coop.name}</td>
                            <td className="py-3 px-4 text-right text-foreground">{coop.member_count}</td>
                            <td className="py-3 px-4 text-right text-muted-foreground">{coop.exploitation_count}</td>
                            <td className="py-3 px-4 text-right text-muted-foreground">{coop.card_count}</td>
                            <td className="py-3 px-4 text-right">
                              <span className={`text-sm font-medium ${rate > 0.5 ? 'text-green-600' : 'text-muted-foreground'}`}>
                                {coop.member_count > 0 ? `${Math.round(rate * 100)}%` : '—'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                label: 'Moy. membres / Coopérative',
                value: coopStats.length > 0
                  ? (coopStats.reduce((s, r) => s + r.member_count, 0) / coopStats.length).toFixed(1)
                  : '—',
              },
              {
                label: 'Moy. exploitations / Coopérative',
                value: coopStats.length > 0
                  ? (coopStats.reduce((s, r) => s + r.exploitation_count, 0) / coopStats.length).toFixed(1)
                  : '—',
              },
              {
                label: 'Couverture cartes globale',
                value: (() => {
                  const totalMembers = coopStats.reduce((s, r) => s + r.member_count, 0)
                  const totalCards = coopStats.reduce((s, r) => s + r.card_count, 0)
                  return totalMembers > 0 ? `${Math.round((totalCards / totalMembers) * 100)}%` : '—'
                })(),
              },
            ].map((item) => (
              <Card key={item.label} className="border-border">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-2">{isLoading ? '—' : item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ─── AgriTogo ──────────────────────────────────────────────────────── */}
        <TabsContent value="agritogo" className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">AgriTogo — Moteur IA &amp; données marché</h2>
              <p className="text-sm text-muted-foreground">Flask 3.1 · 6 agents IA · 5 modèles ML</p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={fetchAgriTogo} disabled={agriLoading}>
              <RefreshCw className={`h-4 w-4 ${agriLoading ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
          </div>

          {agriError && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="pt-4 flex items-center gap-3">
                <XCircle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <p className="font-medium text-destructive">Service inaccessible</p>
                  <p className="text-sm text-muted-foreground">{agriError}</p>
                  <p className="text-xs text-muted-foreground mt-1">Vérifiez que <code>AGRITOGO_API_URL</code> est défini et que le service Railway est actif.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {agriLoading && !agriHealth ? (
            <LoadingBlock />
          ) : agriHealth ? (
            <>
              {/* Statut */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-border">
                  <CardContent className="pt-6 flex items-center gap-4">
                    <div className={`p-3 rounded-full ${agriHealth.status === 'ok' ? 'bg-green-100' : 'bg-destructive/10'}`}>
                      {agriHealth.status === 'ok'
                        ? <CheckCircle2 className="h-6 w-6 text-green-600" />
                        : <XCircle className="h-6 w-6 text-destructive" />}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Statut</p>
                      <p className="font-bold text-foreground capitalize">{agriHealth.status === 'ok' ? 'En ligne' : agriHealth.status}</p>
                      <p className="text-xs text-muted-foreground">v{agriHealth.version}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="pt-6 flex items-center gap-4">
                    <div className="p-3 rounded-full bg-primary/10">
                      <Cpu className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Agents IA actifs</p>
                      <p className="font-bold text-foreground">{agriHealth.agents}</p>
                      <p className="text-xs text-muted-foreground">{agriHealth.models.join(' · ')}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="pt-6 flex items-center gap-4">
                    <div className="p-3 rounded-full bg-accent/20">
                      <ShoppingCart className="h-6 w-6 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Produits suivis</p>
                      <p className="font-bold text-foreground">{agriStats?.total_produits ?? agriProduits.length}</p>
                      {agriStats?.total_prix && <p className="text-xs text-muted-foreground">{String(agriStats.total_prix)} prix enregistrés</p>}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Produits */}
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Produits agricoles</CardTitle>
                  <CardDescription>Catalogue géré par AgriTogo ({agriProduits.length} produits)</CardDescription>
                </CardHeader>
                <CardContent>
                  {agriProduits.length === 0 ? (
                    <EmptyState title="Aucun produit" />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-3 text-sm font-semibold text-foreground">Produit</th>
                            <th className="text-left py-2 px-3 text-sm font-semibold text-foreground">Catégorie</th>
                            <th className="text-left py-2 px-3 text-sm font-semibold text-foreground">Unité</th>
                          </tr>
                        </thead>
                        <tbody>
                          {agriProduits.map((p) => (
                            <tr key={p.id} className="border-b border-border hover:bg-accent/5">
                              <td className="py-2 px-3 font-medium text-foreground">{p.nom}</td>
                              <td className="py-2 px-3 text-muted-foreground">
                                <span className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">{p.categorie}</span>
                              </td>
                              <td className="py-2 px-3 text-muted-foreground text-sm">{p.unite}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Actions rapides */}
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Actions rapides</CardTitle>
                  <CardDescription>Accès direct aux fonctionnalités AgriTogo</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {[
                    { label: 'Prévision GARCH', desc: 'Volatilité des prix (IA)', icon: BarChart3, path: 'forecast' },
                    { label: 'Segmentation agriculteurs', desc: 'K-Means ML', icon: Users, path: 'segmentation' },
                    { label: 'Évaluation des risques', desc: 'Score financier IA', icon: Activity, path: 'risk' },
                    { label: 'Chat agents IA', desc: '6 agents · Gemini / Claude', icon: Cpu, path: 'agent/chat' },
                    { label: 'Calcul irrigation', desc: 'FAO-56 / AgriSmart', icon: Leaf, path: 'agrismart/calculate' },
                    { label: 'Vérifier carte Haroo', desc: 'OUVRIER / ACHETEUR / AGRONOME', icon: CreditCard, path: 'haroo/verify' },
                  ].map((action) => {
                    const Icon = action.icon
                    return (
                      <div key={action.path} className="flex items-center gap-3 p-3 border border-border rounded-lg bg-card">
                        <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{action.label}</p>
                          <p className="text-xs text-muted-foreground">{action.desc}</p>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </>
          ) : !agriError ? (
            <Card className="border-border">
              <CardContent className="pt-6 text-center py-12">
                <Cpu className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Cliquez sur &laquo;&nbsp;Actualiser&nbsp;&raquo; pour charger les données AgriTogo</p>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* ─── Agrismat ──────────────────────────────────────────────────────── */}
        <TabsContent value="agrismat" className="mt-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Agrismat — Expert irrigation FAO-56</h2>
            <p className="text-sm text-muted-foreground">Application Streamlit autonome · Calcul des besoins en eau par culture</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { label: 'Cultures supportées', value: '20+', desc: 'Maïs, riz, manioc, café, cacao…', icon: Leaf, color: 'bg-green-100 text-green-700' },
              { label: 'Types de sol', value: '6', desc: 'Argileux, limoneux, sableux…', icon: Activity, color: 'bg-amber-100 text-amber-700' },
              { label: 'Systèmes d\'irrigation', value: '5', desc: 'Goutte-à-goutte, aspersion, gravitaire…', icon: ShoppingCart, color: 'bg-blue-100 text-blue-700' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <Card key={item.label} className="border-border">
                  <CardContent className="pt-6 flex items-center gap-4">
                    <div className={`p-3 rounded-full ${item.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{item.value}</p>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Fonctionnalités Agrismat</CardTitle>
              <CardDescription>Outil expert de calcul des besoins en eau (méthode FAO-56)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { feature: 'Calcul ETP via données climatiques NASA POWER / Open-Meteo', status: true },
                { feature: 'Besoins mensuels par culture (coefficients Kc)', status: true },
                { feature: 'Ajustement selon type de sol (capacité de rétention)', status: true },
                { feature: 'Comparaison multi-cultures sur un même calendrier', status: true },
                { feature: 'Export rapport PDF automatique', status: true },
                { feature: 'API REST intégrée dans AgriTogo (/api/v1/agrismart/calculate)', status: true },
              ].map((item) => (
                <div key={item.feature} className="flex items-center gap-3">
                  <CheckCircle2 className={`h-4 w-4 shrink-0 ${item.status ? 'text-green-600' : 'text-muted-foreground'}`} />
                  <p className="text-sm text-foreground">{item.feature}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Accès à l&apos;application</CardTitle>
              <CardDescription>Agrismat tourne en Streamlit, indépendamment de cette plateforme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <p className="text-sm font-medium text-foreground mb-1">Calcul via AgriTogo (recommandé)</p>
                <p className="text-xs text-muted-foreground mb-3">
                  L&apos;API AgriTogo expose <code className="bg-muted px-1 rounded">/api/v1/agrismart/calculate</code> — utilisez-la directement depuis les tableaux de bord membres ou via le chat IA.
                </p>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                  const el = document.querySelector('[data-value="agritogo"]') as HTMLElement | null
                  el?.click()
                }}>
                  <Cpu className="h-4 w-4" /> Aller à AgriTogo
                </Button>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <p className="text-sm font-medium text-foreground mb-1">Application Streamlit standalone</p>
                <p className="text-xs text-muted-foreground mb-3">
                  L&apos;interface Streamlit est déployée séparément sur Railway/Render. Configurez <code className="bg-muted px-1 rounded">AGRISMAT_URL</code> pour ajouter un lien direct ici.
                </p>
                <Button variant="outline" size="sm" className="gap-2" disabled>
                  <ExternalLink className="h-4 w-4" /> Ouvrir Agrismat
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  )
}
