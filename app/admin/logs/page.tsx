'use client'

/**
 * Suivi du site pour l'admin : actions (audit_logs, existant), connexions
 * (user_login_events, § demande « qui s'est connecté, combien ») et état du
 * suivi d'erreurs (Sentry — déjà intégré au code, actif dès que
 * NEXT_PUBLIC_SENTRY_DSN est configuré côté Vercel).
 */

import { EmptyState } from '@/components/shared/empty-state'
import { LoadingBlock } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { PaginationBar } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDebounced } from '@/hooks/use-debounced'
import { useResetPageOnChange } from '@/hooks/use-reset-page'
import { createClient } from '@/lib/supabase/client'
import { timeAgo } from '@/lib/utils/time'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ExternalLink,
  Globe,
  LogIn,
  Search,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface AuditLog {
  id: string
  action: string
  resource: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
  cooperative: { name: string } | null
}

interface LoginEvent {
  id: string
  user_id: string
  full_name: string | null
  email: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
  logins_last_30d: number
}

const PAGE_SIZE = 30

function ActionsTab() {
  const supabase = useMemo(() => createClient(), [])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    let query = supabase
      .from('audit_logs')
      .select(
        'id, action, resource, details, ip_address, created_at, cooperative:cooperatives(name)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })

    if (debouncedSearch.trim()) {
      query = query.ilike('action', `%${debouncedSearch.trim()}%`)
    }

    const from = (page - 1) * PAGE_SIZE
    query = query.range(from, from + PAGE_SIZE - 1)

    const { data, count } = await query
    setLogs((data ?? []) as unknown as AuditLog[])
    setTotal(count ?? 0)
    setIsLoading(false)
  }, [supabase, debouncedSearch, page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])
  useResetPageOnChange(setPage, [debouncedSearch])

  const actionLabel = (action: string) => {
    const map: Record<string, string> = {
      'member.create.kobo': '📊 Membre créé (KoboCollect)',
      'member.create': '👤 Membre créé',
      'member.update': '✏️ Membre modifié',
      'member.delete': '🗑️ Membre supprimé',
      'card.generate': '💳 Carte générée',
      'card.revoke': '❌ Carte révoquée',
      'fiche.publish': '📄 Fiche publiée',
      'fiche.delete': '🗑️ Fiche supprimée',
    }
    return map[action] ?? `⚡ ${action}`
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Filtrer par action…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Activité récente</CardTitle>
          <CardDescription>
            {total} événement{total !== 1 ? 's' : ''} enregistré{total !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingBlock />
          ) : logs.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Aucun log"
              description="Les actions seront enregistrées ici automatiquement"
            />
          ) : (
            <>
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-4 p-3 border border-border rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {actionLabel(log.action)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {log.cooperative?.name ?? 'Plateforme'}
                        {log.resource ? ` • ${log.resource}` : ''}
                        {log.ip_address ? ` • ${log.ip_address}` : ''}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(log.created_at)}
                    </span>
                  </div>
                ))}
              </div>
              <PaginationBar
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function LoginsTab() {
  const [logins, setLogins] = useState<LoginEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  const fetchLogins = useCallback(async () => {
    setIsLoading(true)
    const res = await fetch(`/api/admin/activity/logins?page=${page}`)
    const data = await res.json().catch(() => ({}))
    setLogins(data.logins ?? [])
    setTotal(data.total ?? 0)
    setIsLoading(false)
  }, [page])

  useEffect(() => {
    fetchLogins()
  }, [fetchLogins])

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Connexions récentes</CardTitle>
        <CardDescription>
          {total} connexion{total !== 1 ? 's' : ''} enregistrée{total !== 1 ? 's' : ''} — comptage
          sur 30 jours par personne
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingBlock />
        ) : logins.length === 0 ? (
          <EmptyState
            icon={LogIn}
            title="Aucune connexion enregistrée"
            description="Les connexions seront enregistrées ici automatiquement"
          />
        ) : (
          <>
            <div className="space-y-2">
              {logins.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-4 p-3 border border-border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{l.full_name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.email ?? '—'}
                      {l.ip_address ? ` • ${l.ip_address}` : ''}
                      {` • ${l.logins_last_30d} connexion${l.logins_last_30d !== 1 ? 's' : ''} (30j)`}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {timeAgo(l.created_at)}
                  </span>
                </div>
              ))}
            </div>
            <PaginationBar page={page} pageSize={30} total={total} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

interface TrafficSummary {
  total_visits_7d: number
  unique_visitors_7d: number
  new_visitors_7d: number
  returning_visitors_7d: number
  top_pages: { path: string; views: number }[]
  top_countries: { country: string; views: number }[]
}

function TrafficTab() {
  const [summary, setSummary] = useState<TrafficSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/activity/traffic')
      .then((res) => res.json())
      .then(setSummary)
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) return <LoadingBlock />

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Visites (7 jours)</p>
            <p className="text-2xl font-bold text-foreground">{summary?.total_visits_7d ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Visiteurs uniques</p>
            <p className="text-2xl font-bold text-foreground">{summary?.unique_visitors_7d ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Nouveaux visiteurs</p>
            <p className="text-2xl font-bold text-foreground">{summary?.new_visitors_7d ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Visiteurs qui reviennent</p>
            <p className="text-2xl font-bold text-foreground">
              {summary?.returning_visitors_7d ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Pages les plus visitées</CardTitle>
            <CardDescription>7 derniers jours</CardDescription>
          </CardHeader>
          <CardContent>
            {!summary || summary.top_pages.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="Aucune visite enregistrée"
                description="Le trafic apparaîtra ici automatiquement, dès la prochaine visite du site"
              />
            ) : (
              <div className="space-y-2">
                {summary.top_pages.map((p) => (
                  <div
                    key={p.path}
                    className="flex items-center justify-between gap-4 p-3 border border-border rounded-lg"
                  >
                    <span className="text-sm text-foreground truncate">{p.path}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {p.views} vue{p.views !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Pays</CardTitle>
            <CardDescription>
              Géolocalisation par IP (Vercel Edge), 7 derniers jours
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!summary || summary.top_countries.length === 0 ? (
              <EmptyState
                icon={Globe}
                title="Aucune donnée de géolocalisation"
                description="Disponible uniquement en production (Vercel) — jamais en développement local"
              />
            ) : (
              <div className="space-y-2">
                {summary.top_countries.map((c) => (
                  <div
                    key={c.country}
                    className="flex items-center justify-between gap-4 p-3 border border-border rounded-lg"
                  >
                    <span className="text-sm text-foreground">{c.country}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {c.views} visite{c.views !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ErrorsTab() {
  const [status, setStatus] = useState<{ configured: boolean; dashboardUrl: string | null } | null>(
    null,
  )

  useEffect(() => {
    fetch('/api/admin/activity/error-tracking-status')
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, dashboardUrl: null }))
  }, [])

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          Suivi des erreurs
        </CardTitle>
        <CardDescription>
          Le suivi des erreurs (Sentry) est déjà intégré au code de la plateforme — les erreurs
          serveur et navigateur y remontent automatiquement une fois activé.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === null ? (
          <LoadingBlock />
        ) : status.configured ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-foreground">Suivi des erreurs actif.</p>
            {status.dashboardUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={status.dashboardUrl} target="_blank" rel="noopener noreferrer">
                  Ouvrir Sentry <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Pas encore activé. Créez un projet sur{' '}
            <a
              href="https://sentry.io"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              sentry.io
            </a>{' '}
            puis renseignez <code className="text-xs">NEXT_PUBLIC_SENTRY_DSN</code>,{' '}
            <code className="text-xs">SENTRY_ORG</code> et{' '}
            <code className="text-xs">SENTRY_PROJECT</code> dans les variables d'environnement
            Vercel — aucun changement de code nécessaire.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default function ActivityAdminPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Suivi du site"
        description="Trafic, actions, connexions et suivi des erreurs — tout ce qui bouge sur la plateforme"
      />

      <Tabs defaultValue="traffic" className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-4 border-b border-border bg-transparent">
          <TabsTrigger value="traffic">Trafic</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="logins">Connexions</TabsTrigger>
          <TabsTrigger value="errors">Erreurs</TabsTrigger>
        </TabsList>

        <TabsContent value="traffic" className="mt-6">
          <TrafficTab />
        </TabsContent>
        <TabsContent value="actions" className="mt-6">
          <ActionsTab />
        </TabsContent>
        <TabsContent value="logins" className="mt-6">
          <LoginsTab />
        </TabsContent>
        <TabsContent value="errors" className="mt-6">
          <ErrorsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
