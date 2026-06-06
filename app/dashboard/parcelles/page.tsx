'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { MapPin, Sprout, Droplets, BarChart3, Search, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'
import { LoadingBlock } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PaginationBar } from '@/components/shared/pagination'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useDebounced } from '@/hooks/use-debounced'
import type { Cooperative } from '@/app/context/cooperative-context'

interface Parcelle {
  id: string
  culture_name: string
  surface_ha: number
  soil_type: string | null
  irrigation_type: string | null
  source: string | null
  created_at: string
  cooperative_id: string | null
  member: { first_name: string; last_name: string; phone: string | null } | null
}

interface Production {
  id: string
  culture_name: string
  quantity_kg: number
  campaign_year: string
  created_at: string
  cooperative_id: string | null
  member: { first_name: string; last_name: string } | null
}

interface Stats {
  total_parcelles: number
  total_surface_ha: number
  cultures: { name: string; count: number; surface: number }[]
  irrigation_count: number
}

const PAGE_SIZE = 20

const IRRIGATION_LABELS: Record<string, string> = {
  oui: 'Irriguée',
  non: 'Pluviale',
  partielle: 'Partielle',
}

const SOL_COLORS: Record<string, string> = {
  argileux: 'bg-amber-100 text-amber-800',
  limoneux: 'bg-green-100 text-green-800',
  sableux: 'bg-yellow-100 text-yellow-800',
  laterite: 'bg-orange-100 text-orange-800',
}

/** Retourne les IDs de la coopérative sélectionnée + tous ses enfants/petits-enfants. */
function getScopeIds(current: Cooperative, all: Cooperative[]): string[] {
  const ids = new Set<string>([current.id])
  // direct children
  for (const c of all) {
    if (c.parentId === current.id) {
      ids.add(c.id)
      // grandchildren
      for (const gc of all) {
        if (gc.parentId === c.id) ids.add(gc.id)
      }
    }
  }
  return [...ids]
}

export default function ParcellesPage() {
  const { currentCooperative, cooperatives } = useCooperative()
  const supabase = useMemo(() => createClient(), [])

  // Scope IDs : la coopérative courante + ses enfants si c'est une faîtière/union
  const scopeIds = useMemo(
    () => (currentCooperative ? getScopeIds(currentCooperative, cooperatives) : []),
    [currentCooperative, cooperatives],
  )

  // Label du périmètre affiché dans le header
  const scopeLabel = useMemo(() => {
    if (!currentCooperative) return ''
    if (scopeIds.length > 1)
      return `${currentCooperative.name} · ${scopeIds.length} coopératives`
    return currentCooperative.name
  }, [currentCooperative, scopeIds])

  const [tab, setTab] = useState<'parcelles' | 'productions'>('parcelles')
  const [parcelles, setParcelles] = useState<Parcelle[]>([])
  const [productions, setProductions] = useState<Production[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCulture, setFilterCulture] = useState('all')
  const [filterIrrigation, setFilterIrrigation] = useState('all')
  const debouncedSearch = useDebounced(search, 300)

  const cultures = useMemo(
    () => stats?.cultures.map((c) => c.name) ?? [],
    [stats],
  )

  const fetchStats = useCallback(async () => {
    if (!scopeIds.length) return
    const { data } = await supabase
      .from('parcelles')
      .select('culture_name, surface_ha, irrigation_type')
      .in('cooperative_id', scopeIds)

    if (!data) return

    const totalSurface = data.reduce((acc, p) => acc + (p.surface_ha || 0), 0)
    const cultureMap: Record<string, { count: number; surface: number }> = {}
    let irrigCount = 0
    for (const p of data) {
      const c = p.culture_name || 'Inconnue'
      if (!cultureMap[c]) cultureMap[c] = { count: 0, surface: 0 }
      cultureMap[c].count++
      cultureMap[c].surface += p.surface_ha || 0
      if (p.irrigation_type && p.irrigation_type.toLowerCase() !== 'non') irrigCount++
    }
    const culturesArr = Object.entries(cultureMap)
      .map(([name, v]) => ({ name, count: v.count, surface: v.surface }))
      .sort((a, b) => b.count - a.count)

    setStats({ total_parcelles: data.length, total_surface_ha: totalSurface, cultures: culturesArr, irrigation_count: irrigCount })
  }, [scopeIds, supabase])

  const fetchParcelles = useCallback(async () => {
    if (!scopeIds.length) { setIsLoading(false); return }
    setIsLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from('parcelles')
      .select('id, culture_name, surface_ha, soil_type, irrigation_type, source, created_at, cooperative_id, member:member_id(first_name, last_name, phone)', { count: 'exact' })
      .in('cooperative_id', scopeIds)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (filterCulture !== 'all') query = query.eq('culture_name', filterCulture)
    if (filterIrrigation === 'oui') query = query.not('irrigation_type', 'eq', 'non').not('irrigation_type', 'is', null)
    if (filterIrrigation === 'non') query = query.eq('irrigation_type', 'non')
    if (debouncedSearch) query = query.ilike('culture_name', `%${debouncedSearch}%`)

    const { data, count } = await query
    setParcelles((data as unknown as Parcelle[]) ?? [])
    setTotal(count ?? 0)
    setIsLoading(false)
  }, [scopeIds, supabase, page, filterCulture, filterIrrigation, debouncedSearch])

  const fetchProductions = useCallback(async () => {
    if (!scopeIds.length) { setIsLoading(false); return }
    setIsLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from('productions')
      .select('id, culture_name, quantity_kg, campaign_year, created_at, cooperative_id, member:member_id(first_name, last_name)', { count: 'exact' })
      .in('cooperative_id', scopeIds)
      .order('campaign_year', { ascending: false })
      .range(from, to)

    if (filterCulture !== 'all') query = query.eq('culture_name', filterCulture)
    if (debouncedSearch) query = query.ilike('culture_name', `%${debouncedSearch}%`)

    const { data, count } = await query
    setProductions((data as unknown as Production[]) ?? [])
    setTotal(count ?? 0)
    setIsLoading(false)
  }, [scopeIds, supabase, page, filterCulture, debouncedSearch])

  useEffect(() => { fetchStats() }, [fetchStats])

  useEffect(() => { setPage(1) }, [debouncedSearch, filterCulture, filterIrrigation, tab])

  useEffect(() => {
    if (tab === 'parcelles') fetchParcelles()
    else fetchProductions()
  }, [tab, fetchParcelles, fetchProductions])

  // Nom de la coopérative enfant pour une ligne donnée (utile en vue faîtière)
  const coopName = useCallback(
    (coopId: string | null) => {
      if (!coopId || scopeIds.length <= 1) return null
      const c = cooperatives.find((x) => x.id === coopId)
      return c?.name ?? null
    },
    [cooperatives, scopeIds],
  )

  function exportCSV() {
    const rows = tab === 'parcelles'
      ? [
          ['Coopérative', 'Membre', 'Culture', 'Surface (ha)', 'Type de sol', 'Irrigation', 'Date'],
          ...parcelles.map((p) => [
            coopName(p.cooperative_id) ?? '',
            p.member ? `${p.member.first_name} ${p.member.last_name}` : '',
            p.culture_name, String(p.surface_ha ?? ''),
            p.soil_type ?? '', p.irrigation_type ?? '',
            new Date(p.created_at).toLocaleDateString('fr-FR'),
          ]),
        ]
      : [
          ['Coopérative', 'Membre', 'Culture', 'Quantité (kg)', 'Campagne', 'Date'],
          ...productions.map((p) => [
            coopName(p.cooperative_id) ?? '',
            p.member ? `${p.member.first_name} ${p.member.last_name}` : '',
            p.culture_name, String(p.quantity_kg ?? ''),
            p.campaign_year ?? '',
            new Date(p.created_at).toLocaleDateString('fr-FR'),
          ]),
        ]
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${tab}-${currentCooperative?.name ?? 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parcelles & Productions"
        description={`Données collectées via KoboCollect — ${scopeLabel}`}
      />

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: MapPin, color: 'green', label: 'Parcelles', value: stats.total_parcelles },
            { icon: BarChart3, color: 'blue', label: 'Hectares totaux', value: stats.total_surface_ha.toFixed(1) },
            { icon: Sprout, color: 'emerald', label: 'Cultures', value: stats.cultures.length },
            { icon: Droplets, color: 'cyan', label: 'Irriguées', value: stats.irrigation_count },
          ].map(({ icon: Icon, color, label, value }) => (
            <Card key={label}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-${color}-100`}>
                    <Icon className={`h-5 w-5 text-${color}-700`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Top cultures chip list */}
      {stats && stats.cultures.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cultures principales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.cultures.slice(0, 10).map((c) => (
                <button
                  key={c.name}
                  onClick={() => setFilterCulture(filterCulture === c.name ? 'all' : c.name)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                    filterCulture === c.name
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-foreground border-border hover:bg-accent'
                  }`}
                >
                  <Sprout className="h-3 w-3" />
                  {c.name}
                  <span className="text-xs opacity-70">{c.count}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab toggle */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
        {(['parcelles', 'productions'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'parcelles' ? 'Parcelles' : 'Productions'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une culture..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCulture} onValueChange={setFilterCulture}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Culture" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les cultures</SelectItem>
            {cultures.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {tab === 'parcelles' && (
          <Select value={filterIrrigation} onValueChange={setFilterIrrigation}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Irrigation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toute irrigation</SelectItem>
              <SelectItem value="oui">Irriguée</SelectItem>
              <SelectItem value="non">Pluviale</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2 ml-auto shrink-0">
          <Download className="h-4 w-4" />
          Exporter CSV
        </Button>
      </div>

      {/* Data table */}
      {isLoading ? (
        <LoadingBlock />
      ) : tab === 'parcelles' ? (
        parcelles.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Aucune parcelle enregistrée"
            description="Les parcelles sont collectées automatiquement via KoboCollect lors de l'enregistrement des membres."
          />
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {scopeIds.length > 1 && (
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Coopérative</th>
                    )}
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Membre</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Culture</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Surface (ha)</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Type de sol</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Irrigation</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parcelles.map((p) => {
                    const solClass = SOL_COLORS[p.soil_type?.toLowerCase() ?? ''] ?? 'bg-gray-100 text-gray-700'
                    const irrig = IRRIGATION_LABELS[p.irrigation_type?.toLowerCase() ?? ''] ?? p.irrigation_type ?? '—'
                    const childName = coopName(p.cooperative_id)
                    return (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        {scopeIds.length > 1 && (
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                            {childName ?? '—'}
                          </td>
                        )}
                        <td className="px-4 py-3 font-medium whitespace-nowrap">
                          {p.member ? `${p.member.first_name} ${p.member.last_name}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1">
                            <Sprout className="h-3.5 w-3.5 text-green-600 shrink-0" />
                            {p.culture_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {p.surface_ha?.toFixed(2) ?? '—'}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {p.soil_type ? (
                            <Badge className={`text-xs font-normal border-0 ${solClass}`}>{p.soil_type}</Badge>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className={`inline-flex items-center gap-1 text-xs ${irrig === 'Irriguée' ? 'text-blue-700' : 'text-muted-foreground'}`}>
                            {irrig === 'Irriguée' && <Droplets className="h-3 w-3" />}
                            {irrig}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">
                          {new Date(p.created_at).toLocaleDateString('fr-FR')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t bg-muted/20">
              <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </div>
          </div>
        )
      ) : (
        productions.length === 0 ? (
          <EmptyState
            icon={Sprout}
            title="Aucune production enregistrée"
            description="Les données de production sont collectées via KoboCollect lors de la synchronisation."
          />
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {scopeIds.length > 1 && (
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Coopérative</th>
                    )}
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Membre</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Culture</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Quantité (kg)</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Campagne</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {productions.map((p) => {
                    const childName = coopName(p.cooperative_id)
                    return (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        {scopeIds.length > 1 && (
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                            {childName ?? '—'}
                          </td>
                        )}
                        <td className="px-4 py-3 font-medium whitespace-nowrap">
                          {p.member ? `${p.member.first_name} ${p.member.last_name}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1">
                            <Sprout className="h-3.5 w-3.5 text-green-600 shrink-0" />
                            {p.culture_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-medium">
                          {p.quantity_kg?.toLocaleString('fr-FR') ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                          {p.campaign_year || '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">
                          {new Date(p.created_at).toLocaleDateString('fr-FR')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t bg-muted/20">
              <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </div>
          </div>
        )
      )}
    </div>
  )
}
