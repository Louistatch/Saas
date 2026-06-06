'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, Users, ShoppingCart, CreditCard, TrendingUp, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useAuth } from '@/app/context/auth-context'
import { LoadingBlock } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'

interface Stats {
  totalMembers: number
  activeMembers: number
  totalExploitations: number
  activeExploitations: number
  totalCards: number
  activeCards: number
  totalParcelles: number
  totalSurfaceHa: number
}

const initial: Stats = {
  totalMembers: 0,
  activeMembers: 0,
  totalExploitations: 0,
  activeExploitations: 0,
  totalCards: 0,
  activeCards: 0,
  totalParcelles: 0,
  totalSurfaceHa: 0,
}

export default function AnalyticsPage() {
  const { currentCooperative } = useCooperative()
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [stats, setStats] = useState<Stats>(initial)
  const [isLoading, setIsLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    if (!currentCooperative) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const coopId = currentCooperative.id

    const membersQuery = supabase.from('members').select('status').eq('cooperative_id', coopId)
    const fichesQuery = supabase.from('fiches_techniques').select('status').eq('cooperative_id', coopId)
    const cardsQuery = supabase.from('member_cards').select('status').eq('cooperative_id', coopId)
    const parcellesQuery = supabase.from('parcelles').select('surface_ha').eq('cooperative_id', coopId)

    const [membersRes, fichesRes, cardsRes, parcellesRes] = await Promise.all([
      membersQuery,
      fichesQuery,
      cardsQuery,
      parcellesQuery,
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
    })
    setIsLoading(false)
  }, [currentCooperative, supabase, user])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Realtime: refresh stats when members, cards or fiches change
  const fetchStatsRef = useRef(fetchStats)
  useEffect(() => { fetchStatsRef.current = fetchStats }, [fetchStats])

  useEffect(() => {
    if (!currentCooperative) return
    const coopId = currentCooperative.id
    const channel = supabase
      .channel(`analytics-realtime-${coopId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `cooperative_id=eq.${coopId}` }, () => fetchStatsRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_cards', filter: `cooperative_id=eq.${coopId}` }, () => fetchStatsRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fiches_techniques', filter: `cooperative_id=eq.${coopId}` }, () => fetchStatsRef.current())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
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
      label: 'Taux d\'engagement',
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
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Statistiques"
        description={`Suivre l'activité des membres et la croissance de ${
          currentCooperative?.name ?? 'votre coopérative'
        }`}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
