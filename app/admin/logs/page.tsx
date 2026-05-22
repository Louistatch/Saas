'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Search, Activity } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDebounced } from '@/hooks/use-debounced'
import { LoadingBlock } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { PaginationBar } from '@/components/shared/pagination'
import { timeAgo } from '@/lib/utils/time'

interface AuditLog {
  id: string
  action: string
  entity_type: string | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
  cooperative: { name: string } | null
}

const PAGE_SIZE = 30

export default function AuditLogsPage() {
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
      .select('id, action, entity_type, metadata, ip_address, created_at, cooperative:cooperatives(name)', { count: 'exact' })
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

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useEffect(() => { setPage(1) }, [debouncedSearch])

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
    <div className="space-y-8">
      <PageHeader
        title="Logs d'audit"
        description="Historique de toutes les actions effectuées sur la plateforme"
      />

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
          <CardDescription>{total} événement{total !== 1 ? 's' : ''} enregistré{total !== 1 ? 's' : ''}</CardDescription>
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
                  <div key={log.id} className="flex items-center gap-4 p-3 border border-border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{actionLabel(log.action)}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.cooperative?.name ?? 'Plateforme'}
                        {log.entity_type ? ` • ${log.entity_type}` : ''}
                        {log.ip_address ? ` • ${log.ip_address}` : ''}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(log.created_at)}
                    </span>
                  </div>
                ))}
              </div>
              <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
