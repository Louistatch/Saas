'use client'

import { useAuth } from '@/app/context/auth-context'
import { useCooperative } from '@/app/context/cooperative-context'
import { ActivateHarooCard } from '@/components/account/layer-activation'
import { AgriScoreWidget } from '@/components/dashboard/agri-score-widget'
import { HarooLifeEntry } from '@/components/haroolife/entry'
import { HarooLifeMessagesCard } from '@/components/haroolife/messages-inbox'
import { Skeleton } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { timeAgo } from '@/lib/utils/time'
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Clock3,
  CreditCard,
  GraduationCap,
  MapPin,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

  const [stats, setStats] = useState<Stats>({
    totalMembers: 0,
    activeCards: 0,
    totalExploitations: 0,
    totalParcelles: 0,
    scansToday: 0,
  })
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

    const [statsRpcRes, recentMembersRes, recentCardsRes, recentFichesRes, recentScansRes] =
      await Promise.all([
        // Single round-trip via RPC instead of 5 separate count queries.
        // Falls back to per-table counts below if the RPC is unavailable
        // (e.g. migration not yet applied), same pattern as /admin.
        supabase.rpc('get_dashboard_stats', { p_cooperative_id: coopId }),
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
        supabase
          .from('member_access_logs')
          .select('card_number, action, created_at')
          .eq('cooperative_id', coopId)
          .in('action', ['scan', 'login'])
          .order('created_at', { ascending: false })
          .limit(3),
      ])

    if (statsRpcRes.error) {
      // Fallback: per-table counts (pre-RPC behaviour)
      const [membersRes, cardsRes, fichesRes, parcellesRes, scansTodayRes] = await Promise.all([
        supabase
          .from('members')
          .select('id', { count: 'exact', head: true })
          .eq('cooperative_id', coopId),
        supabase
          .from('member_cards')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .eq('cooperative_id', coopId),
        supabase
          .from('fiches_techniques')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'published')
          .eq('cooperative_id', coopId),
        supabase
          .from('parcelles')
          .select('id', { count: 'exact', head: true })
          .eq('cooperative_id', coopId),
        supabase
          .from('member_access_logs')
          .select('id', { count: 'exact', head: true })
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
      const row = (
        statsRpcRes.data as Array<{
          total_members: number | string
          active_cards: number | string
          total_exploitations: number | string
          total_parcelles: number | string
          scans_today: number | string
        }> | null
      )?.[0]
      setStats({
        totalMembers: Number(row?.total_members ?? 0),
        activeCards: Number(row?.active_cards ?? 0),
        totalExploitations: Number(row?.total_exploitations ?? 0),
        totalParcelles: Number(row?.total_parcelles ?? 0),
        scansToday: Number(row?.scans_today ?? 0),
      })
    }

    const activities: RecentItem[] = [
      ...(
        (recentMembersRes.data ?? []) as {
          first_name: string
          last_name: string
          created_at: string
        }[]
      ).map((m) => ({
        label: `Membre ajouté : ${m.first_name} ${m.last_name}`,
        time: timeAgo(m.created_at),
        type: 'member' as const,
        date: m.created_at,
      })),
      ...((recentCardsRes.data ?? []) as { card_number: string; created_at: string }[]).map(
        (c) => ({
          label: `Carte générée : ${c.card_number}`,
          time: timeAgo(c.created_at),
          type: 'card' as const,
          date: c.created_at,
        }),
      ),
      ...((recentFichesRes.data ?? []) as { title: string; created_at: string }[]).map((e) => ({
        label: `Fiche publiée : ${e.title}`,
        time: timeAgo(e.created_at),
        type: 'exploitation' as const,
        date: e.created_at,
      })),
      ...(
        (recentScansRes.data ?? []) as { card_number: string; action: string; created_at: string }[]
      ).map((s) => ({
        label: `${ACTION_LABEL[s.action] ?? s.action} : ${s.card_number}`,
        time: timeAgo(s.created_at),
        type: 'scan' as const,
        date: s.created_at,
      })),
    ]
    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    setRecent(activities.slice(0, 8))
    setIsLoading(false)
  }, [currentCooperative, supabase])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const fetchStatsRef = useRef(fetchStats)
  useEffect(() => {
    fetchStatsRef.current = fetchStats
  }, [fetchStats])

  // Realtime : membres, cartes, fiches, scans
  const coopId = currentCooperative?.id
  useEffect(() => {
    if (!coopId) return
    const channel = supabase
      .channel(`dashboard-realtime-${coopId}`)
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
  }, [coopId, supabase])

  const dotColor: Record<RecentType, string> = {
    member: 'bg-primary',
    card: 'bg-accent',
    exploitation: 'bg-secondary',
    scan: 'bg-secondary-foreground',
  }

  const statCards = [
    {
      title: 'Total membres',
      value: stats.totalMembers,
      icon: Users,
      color: 'text-primary',
      bg: 'bg-primary/10',
      href: '/dashboard/members',
    },
    {
      title: 'Cartes actives',
      value: stats.activeCards,
      icon: CreditCard,
      color: 'text-primary',
      bg: 'bg-primary/10',
      href: '/dashboard/cards',
    },
    {
      title: 'Fiches techniques',
      value: stats.totalExploitations,
      icon: ShoppingCart,
      color: 'text-accent-foreground',
      bg: 'bg-accent/15',
      href: '/dashboard/marketplace',
    },
    {
      title: 'Parcelles',
      value: stats.totalParcelles,
      icon: MapPin,
      color: 'text-accent-foreground',
      bg: 'bg-accent/15',
      href: '/dashboard/parcelles',
    },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <section
        className="relative overflow-hidden rounded-[1.75rem] bg-emerald-900 bg-cover bg-center p-6 text-white shadow-lg sm:p-8"
        style={{ backgroundImage: "url('/images/dashboard/cooperative-hero.webp')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/30 via-emerald-950/10 to-transparent" />
        <div className="relative max-w-2xl space-y-4">
          <p className="text-sm font-medium text-emerald-100">
            {new Intl.DateTimeFormat('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(new Date())}
          </p>
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Bonjour{user?.firstName ? ` ${user.firstName}` : ''}
            </h1>
            <p className="mt-2 text-base text-emerald-50/90 sm:text-lg">
              Voici l’essentiel de {currentCooperative?.name ?? 'votre coopérative'} aujourd’hui.
            </p>
          </div>
          <Link
            href="/dashboard/members"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-orange-500 px-5 font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-orange-600 active:translate-y-0 active:scale-[0.98]"
          >
            <Plus className="h-5 w-5" /> Ajouter un membre
          </Link>
        </div>
        <Sparkles className="absolute bottom-7 right-8 h-16 w-16 text-emerald-100/20" />
      </section>

      {/* Seconde couche du compte : ne s'affiche que si Haroo n'est pas
          déjà activé (le composant se masque lui-même). */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">À terminer</h2>
            <p className="text-sm text-slate-500">Les prochaines étapes pour bien démarrer.</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white p-2 shadow-sm transition hover:shadow-md">
          <ActivateHarooCard />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          const isClickable = stat.href !== '#'
          const inner = (
            // biome-ignore lint/correctness/useJsxKeyInIterable: la clé est portée par le Link/div retourné plus bas ; Biome ne la voit pas à travers la variable
            <Card
              className={`h-full rounded-2xl border-0 bg-white shadow-sm transition-all duration-200 ${isClickable ? 'cursor-pointer hover:-translate-y-1 hover:shadow-md active:translate-y-0 active:scale-[0.98]' : ''}`}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-1.5 rounded-md ${stat.bg}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} aria-hidden />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-950">
                  {isLoading ? <Skeleton className="h-7 w-12" /> : stat.value}
                </div>
              </CardContent>
            </Card>
          )
          return isClickable ? (
            <Link key={stat.title} href={stat.href}>
              {inner}
            </Link>
          ) : (
            <div key={stat.title}>{inner}</div>
          )
        })}
      </section>

      <HarooLifeEntry />
      <HarooLifeMessagesCard />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Agri Score Widget */}
        <AgriScoreWidget memberId={user?.id} />

        <Card className="rounded-2xl border-0 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-foreground">Actions rapides</CardTitle>
            <CardDescription>Tâches courantes pour gérer votre coopérative</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { href: '/dashboard/members', icon: Users, label: 'Ajouter un membre' },
              { href: '/dashboard/cards', icon: CreditCard, label: 'Générer des cartes membres' },
              {
                href: '/dashboard/agrimarket',
                icon: ShoppingBag,
                label: 'Publier une offre AgriMarket',
              },
              { href: '/dashboard/credit', icon: BookOpen, label: 'Gérer les crédits agricoles' },
              { href: '/dashboard/academy', icon: GraduationCap, label: 'Modules de formation' },
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

        <Card className="rounded-2xl border-0 bg-white shadow-sm lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                <Clock3 className="h-5 w-5" />
              </span>
              <CardTitle className="text-foreground">Activité récente</CardTitle>
            </div>
            <CardDescription>Membres, cartes, fiches et scans QR en temps réel</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: squelette de chargement : aucun contenu, donc aucune identité
                  <div key={i} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-2 w-2 rounded-full flex-shrink-0" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
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
                {recent.map((item) => (
                  <li
                    key={`${item.type}-${item.date}-${item.label}`}
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
