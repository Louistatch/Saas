'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BarChart3, Users, ShoppingCart, CreditCard, ArrowRight, MapPin, ScanLine } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useAuth } from '@/app/context/auth-context'
import { Spinner, LoadingBlock } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { AgriScoreWidget } from '@/components/dashboard/agri-score-widget'
import { timeAgo } from '@/lib/utils/time'

interface Stats {
  totalMembers: number
  activeCards: number
  totalExploitations: number
  totalParcelles: number
  scansToday: number
}

type RecentType = 'member' | 'card' | 'exploitation' | 'scan'

interface RecentItem {
  label: string
  time: string
  date: string
  type: RecentType
}

const ACTION_LABEL: Record<string, string> = {
  scan: 'Carte scannée',
  login: 'Connexion carte',
  download: 'Fiche téléchargée',
}

export default function DashboardPage() {
  const { currentCooperative } = useCooperative()
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const [stats, setStats] = useState<Stats>({ totalMembers: 0, activeCards: 0, totalExploitations: 0, totalParcelles: 0, scansToday: 0 })
  const [recent, setRecent] = useState<RecentItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    if (!currentCooperative) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const coopId = currentCooperative.id

    // Début de journée UTC
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [
      statsRpcRes,
      recentMembersRes,
      recentCardsRes,
      recentFichesRes,
      recentScansRes,
    ] = await Promise.all([
      // Single round-trip via RPC instead of 5 separate count queries.
      // Falls back to per-table counts below if the RPC is unavailable
      // (e.g. migration not yet applied), same pattern as /admin.
      supabase.rpc('get_dashboard_stats', { p_cooperative_id: coopId }),
      supabase.from('members').select('first_name, last_name, created_at').eq('cooperative_id', coopId).order('created_at', { ascending: false }).limit(3),
      supabase.from('member_cards').select('card_number, created_at').eq('cooperative_id', coopId).order('created_at', { ascending: false }).limit(2),
      supabase.from('fiches_techniques').select('title, created_at').eq('cooperative_id', coopId).order('created_at', { ascending: false }).limit(2),
      supabase.from('member_access_logs').select('card_number, action, created_at').eq('cooperative_id', coopId).in('action', ['scan', 'login']).order('created_at', { ascending: false }).limit(3),
    ])

    if (statsRpcRes.error) {
      // Fallback: per-table counts (pre-RPC behaviour)
      const [membersRes, cardsRes, fichesRes, parcellesRes, scansTodayRes] = await Promise.all([
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('cooperative_id', coopId),
        supabase.from('member_cards').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('cooperative_id', coopId),
        supabase.from('fiches_techniques').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('cooperative_id', coopId),
        supabase.from('parcelles').select('id', { count: 'exact', head: true }).eq('cooperative_id', coopId),
        supabase.from('member_access_logs').select('id', { count: 'exact', head: true })
          .eq('cooperative_id', coopId)
          .eq('action', 'scan')
          .gte('created_at', todayStart.toISOString()),
      ])
      setStats({
        totalMembers: membersRes.count ?? 0,
        activeCards: cardsRes.count ?? 0,
        totalExploitations: fichesRes.count ?? 0,
        totalParcelles: parcellesRes.count ?? 0,
        scansToday: scansTodayRes.count ?? 0,
      })
    } else {
      const row = (statsRpcRes.data as Array<{
        total_members: number | string
        active_cards: number | string
        total_exploitations: number | string
        total_parcelles: number | string
        scans_today: number | string
      }> | null)?.[0]
      setStats({
        totalMembers: Number(row?.total_members ?? 0),
        activeCards: Number(row?.active_cards ?? 0),
        totalExploitations: Number(row?.total_exploitations ?? 0),
        totalParcelles: Number(row?.total_parcelles ?? 0),
        scansToday: Number(row?.scans_today ?? 0),
      })
    }

    const activities: RecentItem[] = [
      ...((recentMembersRes.data ?? []) as { first_name: string; last_name: string; created_at: string }[]).map((m) => ({
        label: `Membre ajouté : ${m.first_name} ${m.last_name}`,
        time: timeAgo(m.created_at),
        type: 'member' as const,
        date: m.created_at,
      })),
      ...((recentCardsRes.data ?? []) as { card_number: string; created_at: string }[]).map((c) => ({
        label: `Carte générée : ${c.card_number}`,
        time: timeAgo(c.created_at),
        type: 'card' as const,
        date: c.created_at,
      })),
      ...((recentFichesRes.data ?? []) as { title: string; created_at: string }[]).map((e) => ({
        label: `Fiche publiée : ${e.title}`,
        time: timeAgo(e.created_at),
        type: 'exploitation' as const,
        date: e.created_at,
      })),
      ...((recentScansRes.data ?? []) as { card_number: string; action: string; created_at: string }[]).map((s) => ({
        label: `${ACTION_LABEL[s.action] ?? s.action} : ${s.card_number}`,
        time: timeAgo(s.created_at),
        type: 'scan' as const,
        date: s.created_at,
      })),
    ]
    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    setRecent(activities.slice(0, 8))
    setIsLoading(false)
  }, [currentCooperative, user?.role, supabase])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const fetchStatsRef = useRef(fetchStats)
  useEffect(() => { fetchStatsRef.current = fetchStats }, [fetchStats])

  // Realtime : membres, cartes, fiches, scans
  useEffect(() => {
    if (!currentCooperative) return
    const coopId = currentCooperative.id
    const channel = supabase
      .channel(`dashboard-realtime-${coopId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `cooperative_id=eq.${coopId}` }, () => fetchStatsRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_cards', filter: `cooperative_id=eq.${coopId}` }, () => fetchStatsRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fiches_techniques', filter: `cooperative_id=eq.${coopId}` }, () => fetchStatsRef.current())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'member_access_logs', filter: `cooperative_id=eq.${coopId}` }, () => fetchStatsRef.current())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentCooperative?.id, supabase])

  const dotColor: Record<RecentType, string> = {
    member: 'bg-primary',
    card: 'bg-accent',
    exploitation: 'bg-muted-foreground',
    scan: 'bg-orange-400',
  }

  const statCards = [
    { title: 'Total membres', value: stats.totalMembers, icon: Users, color: 'text-primary', bg: 'bg-primary/10', href: '/dashboard/members' },
    { title: 'Cartes actives', value: stats.activeCards, icon: CreditCard, color: 'text-primary', bg: 'bg-primary/15', href: '/dashboard/cards' },
    { title: 'Fiches techniques', value: stats.totalExploitations, icon: ShoppingCart, color: 'text-accent-foreground', bg: 'bg-accent/20', href: '/dashboard/marketplace' },
    { title: 'Parcelles', value: stats.totalParcelles, icon: MapPin, color: 'text-green-600', bg: 'bg-green-100', href: '/dashboard/parcelles' },
    { title: 'Scans aujourd\'hui', value: stats.scansToday, icon: ScanLine, color: 'text-orange-600', bg: 'bg-orange-100', href: '#' },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Bienvenue${user?.firstName ? `, ${user.firstName}` : ''} 👋`}
        description={`${currentCooperative?.name ?? 'Votre coopérative'} — voici ce qui se passe aujourd'hui`}
      />

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {statCards.map((stat, i) => {
          const Icon = stat.icon
          const isClickable = stat.href !== '#'
          const inner = (
            <Card className={`border-border transition-all ${isClickable ? 'hover:border-primary/40 hover:shadow-sm cursor-pointer' : ''}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
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
          )
          return isClickable
            ? <Link key={i} href={stat.href}>{inner}</Link>
            : <div key={i}>{inner}</div>
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Agri Score Widget */}
        <AgriScoreWidget memberId={user?.id} />

        <Card className="border-border bg-gradient-to-br from-primary/5 to-accent/5">
          <CardHeader>
            <CardTitle className="text-foreground">Actions rapides</CardTitle>
            <CardDescription>Tâches courantes pour gérer votre coopérative</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { href: '/dashboard/members', icon: Users, label: 'Ajouter un membre' },
              { href: '/dashboard/cards', icon: CreditCard, label: 'Générer des cartes membres' },
              { href: '/dashboard/parcelles', icon: MapPin, label: 'Consulter les parcelles' },
              { href: '/dashboard/analytics', icon: BarChart3, label: 'Voir les statistiques' },
            ].map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href} className="block">
                <Button variant="outline" className="w-full justify-start border-border text-foreground hover:bg-accent/10 gap-2">
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
            <CardDescription>Membres, cartes, fiches et scans QR en temps réel</CardDescription>
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
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${dotColor[item.type]}`} aria-hidden />
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
