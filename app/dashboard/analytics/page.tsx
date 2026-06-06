'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, Users, ShoppingCart, CreditCard, TrendingUp, MapPin, ScanLine, Activity } from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useAuth } from '@/app/context/auth-context'
import { LoadingBlock } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { ChartCard } from '@/components/shared/chart-card'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  totalMembers: number
  activeMembers: number
  totalExploitations: number
  activeExploitations: number
  totalCards: number
  activeCards: number
  totalParcelles: number
  totalSurfaceHa: number
  totalScans: number
  scansThisWeek: number
}

export interface TimeSeriesPoint {
  month: string
  value: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const initial: Stats = {
  totalMembers: 0,
  activeMembers: 0,
  totalExploitations: 0,
  activeExploitations: 0,
  totalCards: 0,
  activeCards: 0,
  totalParcelles: 0,
  totalSurfaceHa: 0,
  totalScans: 0,
  scansThisWeek: 0,
}

const FR_MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Groups ISO date strings by month (YYYY-MM) and returns cumulative or per-month counts */
export function buildMonthlySeries(dates: string[], months: number): TimeSeriesPoint[] {
  const now = new Date()
  const series: TimeSeriesPoint[] = []

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = FR_MONTHS[d.getMonth()]
    const count = dates.filter((iso) => iso.startsWith(key)).length
    series.push({ month: label, value: count })
  }

  // Make it cumulative
  let running = 0
  return series.map((pt) => {
    running += pt.value
    return { month: pt.month, value: running }
  })
}

/** Groups ISO date strings by day (YYYY-MM-DD) for the last `days` days */
export function buildDailySeries(dates: string[], days: number): { day: string; value: number }[] {
  const now = new Date()
  const series: { day: string; value: number }[] = []

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10) // YYYY-MM-DD
    const label = `${d.getDate()}/${d.getMonth() + 1}`
    const count = dates.filter((iso) => iso.startsWith(key)).length
    series.push({ day: label, value: count })
  }

  return series
}

/** Groups cotisations by paid month, summing amounts */
function buildMonthlyAmountSeries(
  rows: { paid_date: string; amount: number }[],
  months: number,
): TimeSeriesPoint[] {
  const now = new Date()
  const series: TimeSeriesPoint[] = []

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = FR_MONTHS[d.getMonth()]
    const total = rows
      .filter((r) => r.paid_date && r.paid_date.startsWith(key))
      .reduce((acc, r) => acc + (r.amount ?? 0), 0)
    series.push({ month: label, value: total })
  }

  return series
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { currentCooperative } = useCooperative()
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [stats, setStats] = useState<Stats>(initial)
  const [isLoading, setIsLoading] = useState(true)

  // Time-series state
  const [membersOverTime, setMembersOverTime] = useState<TimeSeriesPoint[]>([])
  const [scansOverTime, setScansOverTime] = useState<{ day: string; value: number }[]>([])
  const [cotisationsOverTime, setCotisationsOverTime] = useState<TimeSeriesPoint[]>([])

  const fetchStats = useCallback(async () => {
    if (!currentCooperative) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const coopId = currentCooperative.id

    const now = new Date()
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    // Existing queries
    const membersQuery = supabase.from('members').select('status').eq('cooperative_id', coopId)
    const fichesQuery = supabase.from('fiches_techniques').select('status').eq('cooperative_id', coopId)
    const cardsQuery = supabase.from('member_cards').select('status').eq('cooperative_id', coopId)
    const parcellesQuery = supabase.from('parcelles').select('surface_ha').eq('cooperative_id', coopId)
    const scansAllQuery = supabase
      .from('member_access_logs')
      .select('id', { count: 'exact', head: true })
      .eq('cooperative_id', coopId)
      .eq('action', 'scan')
    const scansWeekQuery = supabase
      .from('member_access_logs')
      .select('id', { count: 'exact', head: true })
      .eq('cooperative_id', coopId)
      .eq('action', 'scan')
      .gte('created_at', weekAgo.toISOString())

    // New time-series queries
    const membersOverTimeQuery = supabase
      .from('members')
      .select('created_at')
      .eq('cooperative_id', coopId)
      .gte('created_at', twelveMonthsAgo.toISOString())

    const scansOverTimeQuery = supabase
      .from('member_access_logs')
      .select('created_at')
      .eq('cooperative_id', coopId)
      .eq('action', 'scan')
      .gte('created_at', thirtyDaysAgo.toISOString())

    const cotisationsOverTimeQuery = supabase
      .from('cotisations')
      .select('paid_date, amount')
      .eq('cooperative_id', coopId)
      .eq('status', 'paid')
      .not('paid_date', 'is', null)
      .gte('paid_date', twelveMonthsAgo.toISOString())

    const [
      membersRes,
      fichesRes,
      cardsRes,
      parcellesRes,
      scansAllRes,
      scansWeekRes,
      membersOverTimeRes,
      scansOverTimeRes,
      cotisationsOverTimeRes,
    ] = await Promise.all([
      membersQuery,
      fichesQuery,
      cardsQuery,
      parcellesQuery,
      scansAllQuery,
      scansWeekQuery,
      membersOverTimeQuery,
      scansOverTimeQuery,
      cotisationsOverTimeQuery,
    ])

    const members = (membersRes.data ?? []) as { status: string }[]
    const fiches = (fichesRes.data ?? []) as { status: string }[]
    const cards = (cardsRes.data ?? []) as { status: string }[]
    const parcelles = (parcellesRes.data ?? []) as { surface_ha: number }[]

    setStats({
      totalMembers: members.length,
      activeMembers: members.filter((m) => m.status === 'active').length,
      totalExploitations: fiches.length,
      activeExploitations: fiches.filter((e) => e.status === 'published').length,
      totalCards: cards.length,
      activeCards: cards.filter((c) => c.status === 'active').length,
      totalParcelles: parcelles.length,
      totalSurfaceHa: parcelles.reduce((acc, p) => acc + (p.surface_ha || 0), 0),
      totalScans: scansAllRes.count ?? 0,
      scansThisWeek: scansWeekRes.count ?? 0,
    })

    // Process time-series data
    const memberDates = ((membersOverTimeRes.data ?? []) as { created_at: string }[]).map(
      (r) => r.created_at,
    )
    setMembersOverTime(buildMonthlySeries(memberDates, 12))

    const scanDates = ((scansOverTimeRes.data ?? []) as { created_at: string }[]).map(
      (r) => r.created_at,
    )
    setScansOverTime(buildDailySeries(scanDates, 30))

    const cotisationRows = (cotisationsOverTimeRes.data ?? []) as {
      paid_date: string
      amount: number
    }[]
    setCotisationsOverTime(buildMonthlyAmountSeries(cotisationRows, 12))

    setIsLoading(false)
  }, [currentCooperative, supabase, user])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Realtime: refresh stats when members, cards or fiches change
  const fetchStatsRef = useRef(fetchStats)
  useEffect(() => {
    fetchStatsRef.current = fetchStats
  }, [fetchStats])

  useEffect(() => {
    if (!currentCooperative) return
    const coopId = currentCooperative.id
    const channel = supabase
      .channel(`analytics-realtime-${coopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `cooperative_id=eq.${coopId}` },
        () => fetchStatsRef.current(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'member_cards',
          filter: `cooperative_id=eq.${coopId}`,
        },
        () => fetchStatsRef.current(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fiches_techniques',
          filter: `cooperative_id=eq.${coopId}`,
        },
        () => fetchStatsRef.current(),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'member_access_logs',
          filter: `cooperative_id=eq.${coopId}`,
        },
        () => fetchStatsRef.current(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentCooperative?.id, supabase])

  const statCards = [
    {
      label: 'Total membres',
      value: stats.totalMembers,
      sub: `${stats.activeMembers} actif${stats.activeMembers === 1 ? '' : 's'}`,
      icon: Users,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Fiches techniques',
      value: stats.totalExploitations,
      sub: `${stats.activeExploitations} publiées`,
      icon: ShoppingCart,
      color: 'text-primary',
      bg: 'bg-primary/15',
    },
    {
      label: 'Cartes membres',
      value: stats.totalCards,
      sub: `${stats.activeCards} active${stats.activeCards === 1 ? '' : 's'}`,
      icon: CreditCard,
      color: 'text-accent-foreground',
      bg: 'bg-accent/20',
    },
    {
      label: "Taux d'engagement",
      value:
        stats.totalMembers > 0
          ? `${Math.round((stats.activeMembers / stats.totalMembers) * 100)}%`
          : '—',
      sub: 'Ratio de membres actifs',
      icon: TrendingUp,
      color: 'text-muted-foreground',
      bg: 'bg-muted',
    },
    {
      label: 'Parcelles',
      value: stats.totalParcelles,
      sub: `${stats.totalSurfaceHa.toFixed(1)} ha enregistrés`,
      icon: MapPin,
      color: 'text-green-600',
      bg: 'bg-green-100',
    },
    {
      label: 'Scans QR (total)',
      value: stats.totalScans,
      sub: `${stats.scansThisWeek} cette semaine`,
      icon: ScanLine,
      color: 'text-orange-600',
      bg: 'bg-orange-100',
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Statistiques"
        description={`Suivre l'activité des membres et la croissance de ${
          currentCooperative?.name ?? 'votre coopérative'
        }`}
      />

      {/* ── Stat cards ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((stat, i) => {
          const Icon = stat.icon
          return (
            <Card key={i} className="border-border">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} aria-hidden />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">
                  {isLoading ? '—' : stat.value}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ── Breakdown bars ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Users className="h-5 w-5" aria-hidden />
              Répartition des statuts membres
            </CardTitle>
            <CardDescription>Distribution des statuts des membres</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingBlock />
            ) : stats.totalMembers === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Aucun membre pour le moment</p>
            ) : (
              <BreakdownBars
                total={stats.totalMembers}
                items={[
                  { label: 'Actifs', value: stats.activeMembers, color: 'bg-primary' },
                  {
                    label: 'Inactifs',
                    value: stats.totalMembers - stats.activeMembers,
                    color: 'bg-border',
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <ShoppingCart className="h-5 w-5" aria-hidden />
              Vue d&apos;ensemble des comptes d&apos;exploitation
            </CardTitle>
            <CardDescription>Fiches techniques publiées vs brouillons</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingBlock />
            ) : stats.totalExploitations === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Aucune fiche technique</p>
            ) : (
              <BreakdownBars
                total={stats.totalExploitations}
                items={[
                  { label: 'Publiées', value: stats.activeExploitations, color: 'bg-primary' },
                  {
                    label: 'Non publiées',
                    value: stats.totalExploitations - stats.activeExploitations,
                    color: 'bg-border',
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Summary ── */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5" aria-hidden />
            Résumé
          </CardTitle>
          <CardDescription>Indicateurs clés en un coup d&apos;œil</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <RésuméCell
              label="Cartes par membre"
              value={
                stats.totalMembers > 0
                  ? (stats.totalCards / stats.totalMembers).toFixed(1)
                  : '—'
              }
            />
            <RésuméCell
              label="Taux d'activation des cartes"
              value={
                stats.totalCards > 0
                  ? `${Math.round((stats.activeCards / stats.totalCards) * 100)}%`
                  : '—'
              }
            />
            <RésuméCell
              label="Couverture exploitations"
              value={
                stats.totalExploitations > 0
                  ? `${stats.activeExploitations}/${stats.totalExploitations}`
                  : '—'
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Time-series charts ── */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {/* Members over time */}
        <ChartCard
          title="Évolution des membres"
          description="Cumul sur les 12 derniers mois"
          icon={Users}
          isLoading={isLoading}
        >
          {membersOverTime.every((p) => p.value === 0) ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={membersOverTime} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="membersGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.6 0.18 145)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="oklch(0.6 0.18 145)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  itemStyle={{ color: 'oklch(0.6 0.18 145)' }}
                  formatter={(v: unknown) => [v as number, 'Membres']}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="oklch(0.6 0.18 145)"
                  strokeWidth={2}
                  fill="url(#membersGrad)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Scans per day */}
        <ChartCard
          title="Activité QR — scans"
          description="Scans par jour sur 30 jours"
          icon={ScanLine}
          isLoading={isLoading}
        >
          {scansOverTime.every((p) => p.value === 0) ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scansOverTime} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  itemStyle={{ color: 'oklch(0.65 0.2 30)' }}
                  formatter={(v: unknown) => [v as number, 'Scans']}
                />
                <Bar dataKey="value" fill="oklch(0.65 0.2 30)" radius={[3, 3, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Cotisations collected */}
        <ChartCard
          title="Collecte cotisations"
          description="Montants perçus par mois (FCFA)"
          icon={Activity}
          isLoading={isLoading}
        >
          {cotisationsOverTime.every((p) => p.value === 0) ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={cotisationsOverTime}
                margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  itemStyle={{ color: 'oklch(0.55 0.18 250)' }}
                  formatter={(v: unknown) => [`${(v as number).toLocaleString('fr-FR')} FCFA`, 'Collecte']}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="oklch(0.55 0.18 250)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'oklch(0.55 0.18 250)' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyChart() {
  return (
    <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
      Aucune donnée pour la période
    </div>
  )
}

function BreakdownBars({
  total,
  items,
}: {
  total: number
  items: { label: string; value: number; color: string }[]
}) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const pct = total > 0 ? (item.value / total) * 100 : 0
        return (
          <div key={i} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-foreground">{item.label}</span>
              <span className="text-muted-foreground">
                {item.value} ({Math.round(pct)}%)
              </span>
            </div>
            <div
              className="h-2 bg-secondary rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full ${item.color} rounded-full transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RésuméCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-lg bg-secondary/30 space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  )
}
