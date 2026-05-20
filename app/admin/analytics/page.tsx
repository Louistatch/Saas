'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, ShoppingCart, CreditCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'

interface CoopStat {
  id: string
  name: string
  member_count: number
  exploitation_count: number
  card_count: number
}

interface StatsView {
  id: string
  name: string
  member_count: number | null
  exploitation_count: number | null
  active_card_count: number | null
}

export default function AnalyticsAdminPage() {
  const supabase = useMemo(() => createClient(), [])
  const [isLoading, setIsLoading] = useState(true)
  const [totals, setTotals] = useState({
    cooperatives: 0,
    members: 0,
    exploitations: 0,
    cards: 0,
  })
  const [coopStats, setCoopStats] = useState<CoopStat[]>([])

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    const view = await supabase
      .from('cooperative_stats')
      .select('id, name, member_count, exploitation_count, active_card_count')
      .order('member_count', { ascending: false })

    if (!view.error && view.data) {
      const rows = (view.data as StatsView[]).map((c) => ({
        id: c.id,
        name: c.name,
        member_count: Number(c.member_count ?? 0),
        exploitation_count: Number(c.exploitation_count ?? 0),
        card_count: Number(c.active_card_count ?? 0),
      }))
      setCoopStats(rows)
      setTotals({
        cooperatives: rows.length,
        members: rows.reduce((s, r) => s + r.member_count, 0),
        exploitations: rows.reduce((s, r) => s + r.exploitation_count, 0),
        cards: rows.reduce((s, r) => s + r.card_count, 0),
      })
    } else {
      // Fallback path — should rarely run after the stats view is in place.
      const [coopsRes, membersRes, exploitationsRes, cardsRes] = await Promise.all([
        supabase.from('cooperatives').select('id, name').order('name'),
        supabase.from('members').select('id', { count: 'exact', head: true }),
        supabase.from('fiches_techniques').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase
          .from('member_cards')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active'),
      ])
      setTotals({
        cooperatives: coopsRes.data?.length ?? 0,
        members: membersRes.count ?? 0,
        exploitations: exploitationsRes.count ?? 0,
        cards: cardsRes.count ?? 0,
      })
      setCoopStats([])
    }
    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const metrics = [
    { title: 'Total Cooperatives', value: totals.cooperatives, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Total Members', value: totals.members, icon: Users, color: 'text-green-600', bg: 'bg-green-50' },
    { title: 'Fiches techniques', value: totals.exploitations, icon: ShoppingCart, color: 'text-purple-600', bg: 'bg-purple-50' },
    { title: 'Active Cards', value: totals.cards, icon: CreditCard, color: 'text-orange-600', bg: 'bg-orange-50' },
  ]

  return (
    <div className="space-y-8">
      <PageHeader title="Analytics" description="Platform-wide analytics and reporting" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, i) => {
          const Icon = metric.icon
          return (
            <Card key={i} className="border-border">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground font-medium">{metric.title}</p>
                    <p className="text-2xl font-bold text-foreground mt-2">
                      {isLoading ? <Spinner className="h-5 w-5" /> : metric.value.toLocaleString()}
                    </p>
                  </div>
                  <div className={`p-2 rounded-lg ${metric.bg}`}>
                    <Icon className={`h-6 w-6 ${metric.color}`} aria-hidden />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Cooperative Performance</CardTitle>
          <CardDescription>All cooperatives ranked by member count</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingBlock />
          ) : coopStats.length === 0 ? (
            <EmptyState title="No cooperatives yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-foreground">#</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Cooperative</th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground">Members</th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground">Exploitations</th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground">Active Cards</th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground">Card Rate</th>
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
                        <td className="py-3 px-4 text-right text-muted-foreground">
                          {coop.exploitation_count}
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground">{coop.card_count}</td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`text-sm font-medium ${
                              rate > 0.5 ? 'text-green-600' : 'text-muted-foreground'
                            }`}
                          >
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
            label: 'Avg Members / Cooperative',
            value:
              totals.cooperatives > 0 ? (totals.members / totals.cooperatives).toFixed(1) : '—',
          },
          {
            label: 'Avg Exploitations / Cooperative',
            value:
              totals.cooperatives > 0
                ? (totals.exploitations / totals.cooperatives).toFixed(1)
                : '—',
          },
          {
            label: 'Overall Card Coverage',
            value:
              totals.members > 0 ? `${Math.round((totals.cards / totals.members) * 100)}%` : '—',
          },
        ].map((item, i) => (
          <Card key={i} className="border-border">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="text-3xl font-bold text-foreground mt-2">{isLoading ? '—' : item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
