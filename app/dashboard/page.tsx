'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BarChart3, Users, ShoppingCart, CreditCard, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useAuth } from '@/app/context/auth-context'
import { Spinner, LoadingBlock } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { timeAgo } from '@/lib/utils/time'

interface Stats {
  totalMembers: number
  activeCards: number
  totalExploitations: number
}

interface RecentItem {
  label: string
  time: string
  date: string
  type: 'member' | 'card' | 'exploitation'
}

export default function DashboardPage() {
  const { currentCooperative } = useCooperative()
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const [stats, setStats] = useState<Stats>({ totalMembers: 0, activeCards: 0, totalExploitations: 0 })
  const [recent, setRecent] = useState<RecentItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    if (!currentCooperative) return
    setIsLoading(true)
    const coopId = currentCooperative.id

    const [
      membersRes,
      cardsRes,
      fichesRes,
      recentMembersRes,
      recentCardsRes,
      recentFichesRes,
    ] = await Promise.all([
      supabase.from('members').select('id', { count: 'exact', head: true }).eq('cooperative_id', coopId),
      supabase
        .from('member_cards')
        .select('id', { count: 'exact', head: true })
        .eq('cooperative_id', coopId)
        .eq('status', 'active'),
      supabase.from('fiches_techniques').select('id', { count: 'exact', head: true }).eq('cooperative_id', coopId).eq('status', 'published'),
      supabase
        .from('members')
        .select('first_name, last_name, created_at')
        .eq('cooperative_id', coopId)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('member_cards')
        .select('card_number, created_at')
        .eq('cooperative_id', coopId)
        .order('created_at', { ascending: false })
        .limit(2),
      supabase
        .from('fiches_techniques')
        .select('title, created_at')
        .eq('cooperative_id', coopId)
        .order('created_at', { ascending: false })
        .limit(2),
    ])

    setStats({
      totalMembers: membersRes.count ?? 0,
      activeCards: cardsRes.count ?? 0,
      totalExploitations: fichesRes.count ?? 0,
    })

    const activities: RecentItem[] = [
      ...((recentMembersRes.data ?? []) as { first_name: string; last_name: string; created_at: string }[]).map(
        (m) => ({
          label: `Membre ajouté : ${m.first_name} ${m.last_name}`,
          time: timeAgo(m.created_at),
          type: 'member' as const,
          date: m.created_at,
        }),
      ),
      ...((recentCardsRes.data ?? []) as { card_number: string; created_at: string }[]).map((c) => ({
        label: `Carte générée : ${c.card_number}`,
        time: timeAgo(c.created_at),
        type: 'card' as const,
        date: c.created_at,
      })),
      ...((recentFichesRes.data ?? []) as { title: string; created_at: string }[]).map(
        (e) => ({
          label: `Fiche publiée: ${e.title}`,
          time: timeAgo(e.created_at),
          type: 'exploitation' as const,
          date: e.created_at,
        }),
      ),
    ]
    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    setRecent(activities.slice(0, 5))
    setIsLoading(false)
  }, [currentCooperative, supabase])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const dotColor: Record<RecentItem['type'], string> = {
    member: 'bg-blue-500',
    card: 'bg-green-500',
    exploitation: 'bg-purple-500',
  }

  const statCards = [
    { title: 'Total membres', value: stats.totalMembers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', href: '/dashboard/members' },
    { title: 'Cartes actives', value: stats.activeCards, icon: CreditCard, color: 'text-green-600', bg: 'bg-green-50', href: '/dashboard/cards' },
    { title: 'Fiches techniques', value: stats.totalExploitations, icon: ShoppingCart, color: 'text-purple-600', bg: 'bg-purple-50', href: '/dashboard/marketplace' },
    { title: 'Statistiques', value: '→', icon: BarChart3, color: 'text-orange-600', bg: 'bg-orange-50', href: '/dashboard/analytics' },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Bienvenue${user?.firstName ? `, ${user.firstName}` : ''} 👋`}
        description={`${currentCooperative?.name ?? 'Votre coopérative'} — voici ce qui se passe aujourd'hui`}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, i) => {
          const Icon = stat.icon
          return (
            <Link key={i} href={stat.href}>
              <Card className="border-border hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-1.5 rounded-md ${stat.bg}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} aria-hidden />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {isLoading ? <Spinner className="h-5 w-5" /> : stat.value}
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border bg-gradient-to-br from-primary/5 to-accent/5">
          <CardHeader>
            <CardTitle className="text-foreground">Actions rapides</CardTitle>
            <CardDescription>Tâches courantes pour gérer votre coopérative</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { href: '/dashboard/members', icon: Users, label: 'Ajouter un membre' },
              { href: '/dashboard/marketplace', icon: ShoppingCart, label: 'Ajouter une fiche' },
              { href: '/dashboard/cards', icon: CreditCard, label: 'Générer des cartes membres' },
              { href: '/dashboard/analytics', icon: BarChart3, label: 'Voir les statistiques' },
            ].map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href} className="block">
                <Button
                  variant="outline"
                  className="w-full justify-start border-border text-foreground hover:bg-accent/10 gap-2"
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </Button>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Activité récente</CardTitle>
            <CardDescription>Dernières modifications dans votre coopérative</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingBlock />
            ) : recent.length === 0 ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-muted-foreground text-sm">Aucune activité pour le moment</p>
                <Link href="/dashboard/members">
                  <Button variant="outline" size="sm" className="gap-2 border-border">
                    Ajouter votre premier membre <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            ) : (
              <ul className="space-y-0">
                {recent.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between py-2.5 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-2 w-2 rounded-full flex-shrink-0 ${dotColor[item.type]}`}
                        aria-hidden
                      />
                      <span className="text-sm text-foreground truncate">{item.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">
                      {item.time}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
