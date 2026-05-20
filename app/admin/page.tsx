'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, ShoppingCart, CreditCard } from 'lucide-react'
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
}

interface CoopRow {
  id: string
  name: string
  created_at: string
  member_count: number
  exploitation_count: number
}

interface StatsView {
  id: string
  name: string
  created_at: string
  member_count: number | null
  exploitation_count: number | null
  active_card_count: number | null
}

interface PlatformTotals {
  total_cooperatives: number | string
  total_members: number | string
  total_exploitations: number | string
  total_active_cards: number | string
}

export default function AdminOverview() {
  const supabase = useMemo(() => createClient(), [])
  const [stats, setStats] = useState<PlatformStats>({
    totalCooperatives: 0,
    totalMembers: 0,
    totalExploitations: 0,
    totalCards: 0,
  })
  const [coops, setCoops] = useState<CoopRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    setIsLoading(true)

    const [statsView, totalsRes] = await Promise.all([
      supabase
        .from('cooperative_stats')
        .select('id, name, created_at, member_count, exploitation_count, active_card_count')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.rpc('get_platform_totals'),
    ])

    if (totalsRes.error) {
      log.warn('get_platform_totals RPC unavailable, falling back', totalsRes.error.code)
      // Fallback: per-table counts
      const [c, m, e, k] = await Promise.all([
        supabase.from('cooperatives').select('id', { count: 'exact', head: true }),
        supabase.from('members').select('id', { count: 'exact', head: true }),
        supabase.from('fiches_techniques').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('member_cards').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      ])
      setStats({
        totalCooperatives: c.count ?? 0,
        totalMembers: m.count ?? 0,
        totalExploitations: e.count ?? 0,
        totalCards: k.count ?? 0,
      })
    } else if (totalsRes.data && (totalsRes.data as PlatformTotals[])[0]) {
      const t = (totalsRes.data as PlatformTotals[])[0]
      setStats({
        totalCooperatives: Number(t.total_cooperatives),
        totalMembers: Number(t.total_members),
        totalExploitations: Number(t.total_exploitations),
        totalCards: Number(t.total_active_cards),
      })
    }

    if (!statsView.error && statsView.data) {
      setCoops(
        (statsView.data as StatsView[]).map((c) => ({
          id: c.id,
          name: c.name,
          created_at: c.created_at,
          member_count: Number(c.member_count ?? 0),
          exploitation_count: Number(c.exploitation_count ?? 0),
        })),
      )
    }

    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const statCards = [
    { title: 'Total Cooperatives', value: stats.totalCooperatives, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50', href: '/admin/cooperatives' },
    { title: 'Total Members', value: stats.totalMembers, icon: Users, color: 'text-green-600', bg: 'bg-green-50', href: '/admin/users' },
    { title: 'Fiches techniques', value: stats.totalExploitations, icon: ShoppingCart, color: 'text-purple-600', bg: 'bg-purple-50', href: '/admin/analytics' },
    { title: 'Active Cards', value: stats.totalCards, icon: CreditCard, color: 'text-orange-600', bg: 'bg-orange-50', href: '/admin/analytics' },
  ]

  return (
    <div className="space-y-8">
      <PageHeader title="Admin Dashboard" description="Platform overview and management" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Recent Cooperatives</CardTitle>
            <CardDescription>Newest registered cooperatives</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingBlock />
            ) : coops.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">No cooperatives yet</p>
            ) : (
              <div className="space-y-0">
                {coops.map((coop) => (
                  <div key={coop.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{coop.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {coop.member_count} member{coop.member_count === 1 ? '' : 's'} ·{' '}
                        {coop.exploitation_count} exploitation{coop.exploitation_count === 1 ? '' : 's'} ·{' '}
                        {timeAgo(coop.created_at)}
                      </p>
                    </div>
                    <span className="px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full ml-3 shrink-0">
                      Active
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Link href="/admin/cooperatives" className="block mt-4">
              <Button variant="outline" size="sm" className="w-full border-border">
                View All Cooperatives
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Platform Health</CardTitle>
            <CardDescription>Key platform metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {[
                {
                  label: 'Avg Members / Cooperative',
                  value:
                    stats.totalCooperatives > 0
                      ? (stats.totalMembers / stats.totalCooperatives).toFixed(1)
                      : '—',
                },
                {
                  label: 'Avg Exploitations / Cooperative',
                  value:
                    stats.totalCooperatives > 0
                      ? (stats.totalExploitations / stats.totalCooperatives).toFixed(1)
                      : '—',
                },
                {
                  label: 'Card Coverage',
                  value:
                    stats.totalMembers > 0
                      ? `${Math.round((stats.totalCards / stats.totalMembers) * 100)}%`
                      : '—',
                },
                { label: 'Total Platform Users', value: stats.totalMembers },
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
                View Full Analytics
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
