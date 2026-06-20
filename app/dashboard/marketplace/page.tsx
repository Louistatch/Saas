'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Plus, Upload, Search, FileText, Download, Trash2, Eye, EyeOff,
  ChevronDown, ChevronRight, MapPin, List,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useAuth } from '@/app/context/auth-context'
import { useToast } from '@/hooks/use-toast'
import { useDebounced } from '@/hooks/use-debounced'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { PaginationBar } from '@/components/shared/pagination'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { errorMessage } from '@/lib/utils/errors'
import { useCascadingLocations } from '@/hooks/use-cascading-locations'

interface FicheTechnique {
  id: string
  title: string
  description: string | null
  culture: string
  type_agriculture: string
  canton_id: string | null
  prefecture_id: string | null
  campaign: string | null
  files: FicheFile[]
  price_non_member: number
  is_free_for_members: boolean
  status: string
  download_count: number
  created_at: string
}

interface FicheFile {
  name: string
  url: string
  type: string
  size?: number
}

interface LocalityFiche {
  id: string
  title: string
  description: string | null
  culture: string
  type_agriculture: string
  campaign: string | null
  files: FicheFile[]
  price_non_member: number
  is_free_for_members: boolean
  download_count: number
  region: { name: string } | null
  prefecture: { name: string } | null
  canton: { name: string } | null
}

interface Culture {
  id: string
  name: string
  icon: string | null
  category: string
}

// Nested locality tree
type CantonMap = Record<string, LocalityFiche[]>
type PrefectureMap = Record<string, CantonMap>
type RegionTree = Record<string, PrefectureMap>

const PAGE_SIZE = 15
const TYPES_AGRICULTURE = [
  { value: 'conventionnel', label: 'Conventionnel' },
  { value: 'biologique', label: 'Biologique' },
  { value: 'agroforesterie', label: 'Agroforesterie' },
  { value: 'maraîchage', label: 'Maraîchage' },
  { value: 'élevage', label: 'Élevage' },
  { value: 'pisciculture', label: 'Pisciculture' },
  { value: 'autre', label: 'Autre' },
]

const FILE_ICON: Record<string, string> = {
  xlsx: '📊', xls: '📊', docx: '📄', doc: '📄', pdf: '📕',
}

function fileIcon(type: string) {
  return FILE_ICON[type] ?? '📎'
}

export default function MarketplacePage() {
  const { currentCooperative, cooperatives, switchCooperative } = useCooperative()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm, confirmNode } = useConfirm()
  const supabase = useMemo(() => createClient(), [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // List view state
  const [fiches, setFiches] = useState<FicheTechnique[]>([])
  const [allCultures, setAllCultures] = useState<Culture[]>([])
  const {
    selection: location,
    setLevel: setLocationLevel,
    setSelection: setLocationSelection,
    options: locationOptions,
  } = useCascadingLocations({
    levels: ['region_id', 'prefecture_id', 'canton_id'],
    mode: 'prefetch-filter',
    prefetchLevels: ['region_id', 'prefecture_id'],
  })
  const regions = locationOptions.region_id
  const prefectures = locationOptions.prefecture_id
  const cantons = locationOptions.canton_id
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 200)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'locality'>('list')

  // Locality view state
  const [localityFiches, setLocalityFiches] = useState<LocalityFiche[]>([])
  const [loadingLocality, setLoadingLocality] = useState(false)
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set())
  const [expandedPrefectures, setExpandedPrefectures] = useState<Set<string>>(new Set())

  // Dialog state
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    culture: '',
    type_agriculture: 'maraîchage',
    campaign: '',
    price_non_member: 500,
  })
  const [pendingFiles, setPendingFiles] = useState<{ name: string; url: string; type: string; size: number }[]>([])

  // Only show faitieres in the cooperative switcher for super_admin
  const faitiereCooperatives = useMemo(() => {
    if (user?.role !== 'super_admin') return cooperatives
    return cooperatives.filter((c) => c.level === 'faitiere')
  }, [cooperatives, user?.role])

  const cultures = allCultures

  // Cache scope IDs per cooperative to avoid re-fetching on every render.
  // Both child+grandchild queries run in parallel instead of sequentially.
  const scopeIdsCache = useRef<{ id: string; ids: string[] } | null>(null)

  const buildScopeIds = useCallback(async (coopId: string, level: string): Promise<string[]> => {
    if (scopeIdsCache.current?.id === coopId) return scopeIdsCache.current.ids

    let ids: string[]
    if (level === 'faitiere' || level === 'union') {
      const { data: childCoops } = await supabase
        .from('cooperatives')
        .select('id')
        .or(`id.eq.${coopId},parent_id.eq.${coopId}`)
      const childIds = (childCoops ?? []).map((c) => c.id)
      if (childIds.length > 0) {
        const { data: grandChildCoops } = await supabase
          .from('cooperatives')
          .select('id')
          .in('parent_id', childIds)
        ids = [...new Set([...childIds, ...(grandChildCoops ?? []).map((c) => c.id)])]
      } else {
        ids = [coopId]
      }
    } else {
      ids = [coopId]
    }

    scopeIdsCache.current = { id: coopId, ids }
    return ids
  }, [supabase])

  // Load reference data
  useEffect(() => {
    supabase.from('cultures').select('id, name, icon, category').order('name').then(({ data }) => setAllCultures(data ?? []))
  }, [supabase])

  // Load list-view fiches
  const fetchFiches = useCallback(async () => {
    if (!currentCooperative) {
      setFiches([]); setTotal(0); setIsLoading(false); return
    }
    setIsLoading(true)

    const scopeIds = await buildScopeIds(currentCooperative.id, currentCooperative.level ?? '')

    let query = supabase
      .from('fiches_techniques')
      .select('*', { count: 'exact' })
      .in('cooperative_id', scopeIds)
      .order('created_at', { ascending: false })

    if (debouncedSearch.trim()) {
      query = query.or(`title.ilike.%${debouncedSearch.trim()}%,culture.ilike.%${debouncedSearch.trim()}%`)
    }

    const from = (page - 1) * PAGE_SIZE
    query = query.range(from, from + PAGE_SIZE - 1)

    const { data, error, count } = await query
    if (error) {
      setFiches([]); setTotal(0)
    } else {
      setFiches((data ?? []) as FicheTechnique[])
      setTotal(count ?? 0)
    }
    setIsLoading(false)
  }, [currentCooperative, supabase, debouncedSearch, page, buildScopeIds])

  // Load locality-view fiches (with region/prefecture/canton names)
  const fetchLocalityFiches = useCallback(async () => {
    if (!currentCooperative) { setLocalityFiches([]); return }
    setLoadingLocality(true)

    const scopeIds = await buildScopeIds(currentCooperative.id, currentCooperative.level ?? '')

    const { data } = await supabase
      .from('fiches_techniques')
      .select('id, title, description, culture, type_agriculture, campaign, files, price_non_member, is_free_for_members, download_count, region:region_id(name), prefecture:prefecture_id(name), canton:canton_id(name)')
      .in('cooperative_id', scopeIds)
      .eq('status', 'published')
      .order('title')

    setLocalityFiches((data ?? []) as unknown as LocalityFiche[])
    setLoadingLocality(false)
  }, [currentCooperative, supabase, buildScopeIds])

  useEffect(() => { fetchFiches() }, [fetchFiches])
  useEffect(() => { setPage(1) }, [debouncedSearch])
  useEffect(() => {
    if (viewMode === 'locality') fetchLocalityFiches()
  }, [viewMode, fetchLocalityFiches])

  // Build locality tree: region → prefecture → canton → fiches
  const localityTree = useMemo((): RegionTree => {
    const tree: RegionTree = {}
    for (const f of localityFiches) {
      const r = f.region?.name ?? 'Toutes régions'
      const p = f.prefecture?.name ?? 'Toutes préfectures'
      const c = f.canton?.name ?? 'Tous cantons'
      if (!tree[r]) tree[r] = {}
      if (!tree[r][p]) tree[r][p] = {}
      if (!tree[r][p][c]) tree[r][p][c] = []
      tree[r][p][c].push(f)
    }
    return tree
  }, [localityFiches])

  const totalLocalityFiches = localityFiches.length

  function toggleRegion(r: string) {
    setExpandedRegions((prev) => {
      const next = new Set(prev)
      next.has(r) ? next.delete(r) : next.add(r)
      return next
    })
  }

  function togglePrefecture(key: string) {
    setExpandedPrefectures((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Download file via signed URL
  const handleDownload = useCallback(async (file: FicheFile) => {
    const { data, error } = await supabase.storage.from('fiches-techniques').createSignedUrl(file.url, 3600)
    if (error || !data?.signedUrl) {
      toast({ title: 'Erreur de téléchargement', description: error?.message ?? 'Lien expiré', variant: 'destructive' })
      return
    }
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = file.name
    a.click()
  }, [supabase, toast])

  // File upload
  const handleFileUpload = async (files: FileList) => {
    if (!currentCooperative) {
      toast({ title: 'Erreur', description: 'Aucune coopérative sélectionnée', variant: 'destructive' })
      return
    }
    if (user?.role !== 'super_admin' && currentCooperative.level !== 'faitiere') {
      toast({ title: 'Accès refusé', description: 'Seules les faîtières peuvent uploader des fiches', variant: 'destructive' })
      return
    }
    setUploadingFiles(true)
    const uploaded: typeof pendingFiles = []
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast({ title: `Fichier trop volumineux: ${file.name}`, description: 'Maximum 20 Mo', variant: 'destructive' })
        continue
      }
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
      if (!['pdf', 'docx', 'doc', 'xlsx', 'xls'].includes(ext)) {
        toast({ title: `Type non supporté: ${file.name}`, description: 'Formats acceptés: PDF, DOCX, XLSX', variant: 'destructive' })
        continue
      }
      const path = `${currentCooperative.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
      try {
        const { error } = await supabase.storage.from('fiches-techniques').upload(path, file, { cacheControl: '3600', upsert: false })
        if (error) {
          toast({ title: `Échec upload: ${file.name}`, description: error.message || 'Erreur de téléversement', variant: 'destructive' })
          continue
        }
        uploaded.push({ name: file.name, url: path, type: ext, size: file.size })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur réseau'
        toast({ title: `Échec upload: ${file.name}`, description: msg, variant: 'destructive' })
      }
    }
    setPendingFiles((prev) => [...prev, ...uploaded])
    setUploadingFiles(false)
    if (uploaded.length > 0) toast({ title: `${uploaded.length} fichier(s) uploadé(s)` })
    else if (Array.from(files).length > 0) toast({ title: 'Aucun fichier uploadé', description: 'Vérifiez le format et la taille', variant: 'destructive' })
  }

  // Save fiche
  const handleSave = async () => {
    if (!currentCooperative) return
    if (!form.title || !form.culture) {
      toast({ title: 'Titre et culture sont obligatoires', variant: 'destructive' })
      return
    }
    if (pendingFiles.length === 0) {
      toast({ title: 'Ajoutez au moins un fichier', variant: 'destructive' })
      return
    }
    setSaving(true)
    const { error } = await supabase.from('fiches_techniques').insert({
      cooperative_id: currentCooperative.id,
      title: form.title,
      description: form.description || null,
      culture: form.culture,
      type_agriculture: form.type_agriculture,
      canton_id: location.canton_id || null,
      prefecture_id: location.prefecture_id || null,
      region_id: location.region_id || null,
      campaign: form.campaign || null,
      price_non_member: form.price_non_member,
      files: pendingFiles,
      status: 'published',
      is_free_for_members: true,
    })
    setSaving(false)
    if (error) {
      toast({ title: 'Erreur', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Fiche publiée', description: form.title })
    setShowAdd(false)
    setForm({ title: '', description: '', culture: '', type_agriculture: 'maraîchage', campaign: '', price_non_member: 500 })
    setLocationSelection({ region_id: '', prefecture_id: '', canton_id: '' })
    setPendingFiles([])
    fetchFiches()
    if (viewMode === 'locality') fetchLocalityFiches()
  }

  const toggleStatus = async (fiche: FicheTechnique) => {
    const newStatus = fiche.status === 'published' ? 'archived' : 'published'
    const { error } = await supabase.from('fiches_techniques').update({ status: newStatus }).eq('id', fiche.id)
    if (error) { toast({ title: 'Erreur', description: errorMessage(error), variant: 'destructive' }); return }
    toast({ title: newStatus === 'published' ? 'Publiée' : 'Archivée' })
    fetchFiches()
    if (viewMode === 'locality') fetchLocalityFiches()
  }

  const handleDelete = async (fiche: FicheTechnique) => {
    const ok = await confirm({
      title: 'Supprimer cette fiche ?',
      description: `"${fiche.title}" sera définitivement supprimée avec ses fichiers.`,
      destructive: true,
      confirmLabel: 'Supprimer',
    })
    if (!ok) return
    const paths = fiche.files.map((f) => f.url)
    if (paths.length > 0) await supabase.storage.from('fiches-techniques').remove(paths)
    await supabase.from('fiches_techniques').delete().eq('id', fiche.id)
    toast({ title: 'Fiche supprimée' })
    fetchFiches()
    if (viewMode === 'locality') fetchLocalityFiches()
  }

  const isAdmin = user?.role === 'super_admin' || currentCooperative?.level === 'faitiere'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Comptes d'exploitation"
        description="Fiches techniques et itinéraires de culture classés par canton, préfecture et région"
        action={
          isAdmin ? (
            <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              Nouvelle fiche
            </Button>
          ) : null
        }
      />

      {/* Faitiere switcher for super_admin */}
      {user?.role === 'super_admin' && faitiereCooperatives.length > 0 && (
        <div className="flex items-center gap-3">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">Faîtière :</Label>
          <select
            className="border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
            value={currentCooperative?.id || ''}
            onChange={(e) => switchCooperative(e.target.value)}
          >
            {faitiereCooperatives.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total fiches</p>
            <p className="text-2xl font-bold text-foreground">{viewMode === 'locality' ? totalLocalityFiches : total}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Régions couvertes</p>
            <p className="text-2xl font-bold text-primary">{Object.keys(localityTree).filter(r => r !== 'Toutes régions').length || '—'}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Téléchargements</p>
            <p className="text-2xl font-bold text-foreground">{localityFiches.reduce((s, f) => s + f.download_count, 0) || fiches.reduce((s, f) => s + f.download_count, 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Cultures</p>
            <p className="text-2xl font-bold text-foreground">{new Set([...localityFiches.map(f => f.culture), ...fiches.map(f => f.culture)]).size || '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* View mode toggle + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* View toggle */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted shrink-0">
          <button
            onClick={() => setViewMode('locality')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'locality' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <MapPin className="h-3.5 w-3.5" />
            Par localité
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <List className="h-3.5 w-3.5" />
            Liste
          </button>
        </div>

        {/* Search (list view only) */}
        {viewMode === 'list' && (
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Rechercher par titre ou culture…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* ── LOCALITY VIEW ──────────────────────────────────────────── */}
      {viewMode === 'locality' && (
        loadingLocality ? (
          <LoadingBlock />
        ) : localityFiches.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Aucune fiche publiée"
            description="Les comptes d'exploitation apparaîtront ici organisés par région, préfecture et canton."
            action={
              isAdmin ? (
                <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setShowAdd(true)}>
                  <Upload className="h-4 w-4" />
                  Ajouter une fiche
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="space-y-3">
            {Object.entries(localityTree).sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([region, prefectureMap]) => {
              const isOpen = expandedRegions.has(region)
              const regionTotal = Object.values(prefectureMap).flatMap((pm) => Object.values(pm)).flat().length
              return (
                <div key={region} className="border border-border rounded-xl overflow-hidden shadow-sm">
                  {/* Region header */}
                  <button
                    onClick={() => toggleRegion(region)}
                    className="w-full flex items-center justify-between px-5 py-4 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-primary/10">
                        <MapPin className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <span className="font-semibold text-foreground">{region}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {regionTotal} fiche{regionTotal > 1 ? 's' : ''} · {Object.keys(prefectureMap).length} préfecture{Object.keys(prefectureMap).length > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Prefectures */}
                  {isOpen && (
                    <div className="divide-y divide-border/60">
                      {Object.entries(prefectureMap).sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([prefecture, cantonMap]) => {
                        const prefKey = `${region}__${prefecture}`
                        const isPrefOpen = expandedPrefectures.has(prefKey)
                        const prefTotal = Object.values(cantonMap).flat().length
                        return (
                          <div key={prefecture}>
                            {/* Prefecture header */}
                            <button
                              onClick={() => togglePrefecture(prefKey)}
                              className="w-full flex items-center justify-between px-6 py-3 bg-background hover:bg-muted/20 transition-colors text-left"
                            >
                              <div className="flex items-center gap-2">
                                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isPrefOpen ? 'rotate-90' : ''}`} />
                                <span className="text-sm font-medium text-foreground">{prefecture}</span>
                                <span className="text-xs text-muted-foreground">({prefTotal} fiche{prefTotal > 1 ? 's' : ''})</span>
                              </div>
                            </button>

                            {/* Cantons + fiches */}
                            {isPrefOpen && (
                              <div className="px-8 pb-4 pt-2 bg-background space-y-5">
                                {Object.entries(cantonMap).sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([canton, fichesInCanton]) => (
                                  <div key={canton}>
                                    {canton !== 'Tous cantons' && (
                                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 pl-0.5">
                                        Canton {canton}
                                      </p>
                                    )}
                                    <div className="space-y-2">
                                      {fichesInCanton.map((fiche) => {
                                        const icon = cultures.find((c) => c.name === fiche.culture)?.icon ?? '🌿'
                                        return (
                                          <div
                                            key={fiche.id}
                                            className="flex items-start gap-3 p-3.5 border border-border rounded-lg bg-card hover:bg-accent/5 transition-colors"
                                          >
                                            <span className="text-2xl shrink-0 leading-tight">{icon}</span>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium text-foreground text-sm">{fiche.title}</span>
                                                {fiche.is_free_for_members ? (
                                                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Gratuit membres</span>
                                                ) : (
                                                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{fiche.price_non_member} FCFA</span>
                                                )}
                                              </div>
                                              <p className="text-xs text-muted-foreground mt-0.5">
                                                {fiche.culture} · {fiche.type_agriculture}
                                                {fiche.campaign ? ` · Campagne ${fiche.campaign}` : ''}
                                              </p>
                                              {fiche.description && (
                                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{fiche.description}</p>
                                              )}
                                              <div className="flex flex-wrap gap-1.5 mt-2">
                                                {fiche.files.map((f, i) => (
                                                  <button
                                                    key={i}
                                                    onClick={() => handleDownload(f)}
                                                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                                                  >
                                                    <Download className="h-3 w-3" />
                                                    {fileIcon(f.type)} {f.name}
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground shrink-0 text-right">
                                              <span>{fiche.download_count}</span>
                                              <Download className="h-3 w-3 inline ml-0.5" />
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── LIST VIEW ──────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Fiches techniques</CardTitle>
            <CardDescription>Comptes d'exploitation et itinéraires techniques uploadés</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingBlock />
            ) : fiches.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={search ? 'Aucune fiche trouvée' : 'Aucune fiche technique'}
                description={search ? 'Essayez un autre terme' : "Uploadez vos premiers comptes d'exploitation (DOCX, Excel)"}
                action={
                  !search && isAdmin ? (
                    <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setShowAdd(true)}>
                      <Upload className="h-4 w-4" />
                      Ajouter une fiche
                    </Button>
                  ) : null
                }
              />
            ) : (
              <>
                <div className="space-y-3">
                  {fiches.map((fiche) => (
                    <div
                      key={fiche.id}
                      className="flex items-start gap-4 p-4 border border-border rounded-lg hover:bg-accent/5 transition-colors"
                    >
                      <div className="text-3xl shrink-0">
                        {cultures.find((c) => c.name === fiche.culture)?.icon ?? '🌿'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground">{fiche.title}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${fiche.status === 'published' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            {fiche.status === 'published' ? 'Publiée' : 'Archivée'}
                          </span>
                          {fiche.is_free_for_members && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Gratuit membres</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {fiche.culture} • {fiche.type_agriculture}
                          {fiche.campaign ? ` • ${fiche.campaign}` : ''}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {fiche.files.map((f, i) => (
                            <button
                              key={i}
                              onClick={() => handleDownload(f)}
                              className="inline-flex items-center gap-1 text-xs bg-secondary/50 px-2 py-1 rounded hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                              <Download className="h-3 w-3" />
                              {fileIcon(f.type)} {f.name}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {fiche.download_count} téléchargement{fiche.download_count !== 1 ? 's' : ''} • {fiche.price_non_member} FCFA (non-membres)
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleStatus(fiche)}
                            title={fiche.status === 'published' ? 'Archiver' : 'Publier'}
                          >
                            {fiche.status === 'published' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(fiche)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add fiche dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle fiche technique</DialogTitle>
            <DialogDescription>
              Uploadez un compte d'exploitation ou itinéraire technique (DOCX, Excel, PDF)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Titre <span className="text-destructive">*</span></Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Compte d'exploitation Tomate — Canton Tsévié"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Culture <span className="text-destructive">*</span></Label>
                <select
                  className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                  value={form.culture}
                  onChange={(e) => setForm((f) => ({ ...f, culture: e.target.value }))}
                >
                  <option value="">— Choisir —</option>
                  {cultures.map((c) => (
                    <option key={c.id} value={c.name}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Type d'agriculture</Label>
                <select
                  className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                  value={form.type_agriculture}
                  onChange={(e) => setForm((f) => ({ ...f, type_agriculture: e.target.value }))}
                >
                  {TYPES_AGRICULTURE.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Localisation cascade */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-foreground">Localisation</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Région</Label>
                  <select
                    className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                    value={location.region_id}
                    onChange={(e) => setLocationLevel('region_id', e.target.value)}
                  >
                    <option value="">— Toutes —</option>
                    {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Préfecture</Label>
                  <select
                    className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                    value={location.prefecture_id}
                    onChange={(e) => setLocationLevel('prefecture_id', e.target.value)}
                    disabled={prefectures.length === 0}
                  >
                    <option value="">— Toutes —</option>
                    {prefectures.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Canton</Label>
                  <select
                    className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                    value={location.canton_id}
                    onChange={(e) => setLocationLevel('canton_id', e.target.value)}
                    disabled={!location.prefecture_id || cantons.length === 0}
                  >
                    <option value="">— Tous —</option>
                    {cantons.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campagne</Label>
                <Input
                  value={form.campaign}
                  onChange={(e) => setForm((f) => ({ ...f, campaign: e.target.value }))}
                  placeholder="2025-2026"
                />
              </div>
              <div className="space-y-2">
                <Label>Prix non-membre (FCFA)</Label>
                <Input
                  type="number"
                  value={form.price_non_member}
                  onChange={(e) => setForm((f) => ({ ...f, price_non_member: parseInt(e.target.value) || 500 }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <textarea
                className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm min-h-[60px]"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description de la fiche technique…"
              />
            </div>

            <div className="space-y-2">
              <Label>Fichiers <span className="text-destructive">*</span></Label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFiles}
                className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary hover:bg-accent/5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {uploadingFiles ? (
                  <Spinner className="h-6 w-6 mx-auto" />
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-foreground font-medium">Cliquez pour ajouter des fichiers</p>
                    <p className="text-xs text-muted-foreground mt-1">DOCX, Excel (.xlsx), PDF — max 20 Mo</p>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.xlsx,.xls,.pdf,.doc"
                multiple
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) handleFileUpload(e.target.files)
                  e.target.value = ''
                }}
              />
              {pendingFiles.length > 0 && (
                <div className="space-y-2 mt-3">
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span>{fileIcon(f.type)}</span>
                        <span className="text-sm text-foreground">{f.name}</span>
                        <span className="text-xs text-muted-foreground">({(f.size / 1024).toFixed(0)} Ko)</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive"
                        onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={saving}>Annuler</Button>
            <Button
              className="bg-primary hover:bg-primary/90 gap-2"
              onClick={handleSave}
              disabled={saving || !form.title || !form.culture || pendingFiles.length === 0}
            >
              {saving ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
              Publier la fiche
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmNode}
    </div>
  )
}
