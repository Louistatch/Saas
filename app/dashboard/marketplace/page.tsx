'use client'

import { useAuth } from '@/app/context/auth-context'
import { useCooperative } from '@/app/context/cooperative-context'
import { FieldError } from '@/components/marketplace/field-error'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { PaginationBar } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  type UseCascadingLocationsOptions,
  useCascadingLocations,
} from '@/hooks/use-cascading-locations'
import { useDebounced } from '@/hooks/use-debounced'
import { useResetPageOnChange } from '@/hooks/use-reset-page'
import { useToast } from '@/hooks/use-toast'
import {
  FAITIERE_DRAFT_FIELDS,
  type FaitiereDraftField,
  faitiereDraftErrors,
} from '@/lib/fiches/admin-form'
import {
  MEMBER_FREE_CHECKBOX_LABEL,
  dashboardPriceLabel,
  memberFreeBadge,
} from '@/lib/fiches/member-label'
import { FAITIERE_PUBLISHING } from '@/lib/fiches/publishing'
import { FICHE_LIMITS } from '@/lib/fiches/schema'
import {
  TYPES_AGRICULTURE as TYPES_AGRICULTURE_LABELS,
  TYPE_AGRICULTURE_KEYS,
  formatFileSize,
  labelFicheStatus,
  labelTypeAgriculture,
} from '@/lib/fiches/types'
import { UPLOAD_ACCEPT, checkUploadFile, serverFieldErrors } from '@/lib/fiches/upload'
import {
  apiErrorText,
  ficheApi,
  ficheRoot,
  reasonOf,
  uploadFicheFiles,
} from '@/lib/fiches/upload-client'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileText,
  List,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
// Constante de module : le hook ne dépend plus de l'identité de ses options
// (voir hooks/cascading-locations-core.ts), mais rien ne sert de les recréer.
const FICHE_LOCATION_OPTIONS: UseCascadingLocationsOptions = {
  levels: ['region_id', 'prefecture_id', 'canton_id'],
  mode: 'prefetch-filter',
  prefetchLevels: ['region_id', 'prefecture_id'],
}
// Trois systèmes de production, et rien d'autre.
//
// La liste précédente en mélangeait trois : des systèmes (conventionnel,
// biologique, agroforesterie), des FILIÈRES (maraîchage, élevage,
// pisciculture) et un « autre » fourre-tout. Un acheteur qui filtre sur
// « agroécologique » ne pouvait donc rien trouver, et deux fiches identiques
// pouvaient être classées l'une en « biologique » l'autre en « maraîchage ».
// Le vocabulaire vit désormais dans lib/fiches/types, partagé par le
// formulaire, le filtre acheteur et la validation de l'API.
const TYPES_AGRICULTURE = TYPE_AGRICULTURE_KEYS.map((value) => ({
  value,
  label: TYPES_AGRICULTURE_LABELS[value],
}))

const FILE_ICON: Record<string, string> = {
  xlsx: '📊',
  xls: '📊',
  docx: '📄',
  doc: '📄',
  pdf: '📕',
}

function fileIcon(type: string) {
  return FILE_ICON[type] ?? '📎'
}

/** Niveaux de localité de la fenêtre, pour dire laquelle n'a pas pu être lue. */
const LOCATION_LIST_LABEL: Partial<Record<string, string>> = {
  region_id: 'régions',
  prefecture_id: 'préfectures',
  canton_id: 'cantons',
}

/** Défilement doux, sauf si l'utilisateur a demandé moins d'animations. */
const smoothScroll = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

const EMPTY_FORM = {
  title: '',
  description: '',
  culture: '',
  type_agriculture: 'agroecologique',
  campaign: '',
  price_non_member: 500,
  is_free_for_members: true,
  // Brouillon par défaut : la mise en vente est un choix explicite.
  publish: false,
}

export default function MarketplacePage() {
  const { currentCooperative, cooperatives, switchCooperative } = useCooperative()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm, confirmNode } = useConfirm()
  const router = useRouter()
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
    failedLevels: failedLocationLevels,
    retry: retryLocations,
  } = useCascadingLocations(FICHE_LOCATION_OPTIONS)
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
  const [progress, setProgress] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  // Prix saisi tel quel : un champ vidé ne vaut ni 0 ni 500 (voir handleSave).
  const [priceText, setPriceText] = useState(String(EMPTY_FORM.price_non_member))
  // Fichiers gardés dans le navigateur jusqu'à l'enregistrement : ils ne sont
  // envoyés qu'une fois le brouillon accepté par le serveur (aucun orphelin).
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  // Champs manquants, affichés sous chaque champ après un clic sur le bouton
  // (qui n'est jamais grisé en silence).
  const [formErrors, setFormErrors] = useState<Partial<Record<FaitiereDraftField, string>>>({})
  const clearFormError = (field: FaitiereDraftField) =>
    setFormErrors((e) => (e[field] ? { ...e, [field]: undefined } : e))

  // Only show faitieres in the cooperative switcher for super_admin
  const faitiereCooperatives = useMemo(() => {
    if (user?.role !== 'super_admin') return cooperatives
    return cooperatives.filter((c) => c.level === 'faitiere')
  }, [cooperatives, user?.role])

  const cultures = allCultures

  // Cache scope IDs per cooperative to avoid re-fetching on every render.
  // Both child+grandchild queries run in parallel instead of sequentially.
  const scopeIdsCache = useRef<{ id: string; ids: string[] } | null>(null)

  const buildScopeIds = useCallback(
    async (coopId: string, level: string): Promise<string[]> => {
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
    },
    [supabase],
  )

  // Load reference data
  useEffect(() => {
    supabase
      .from('cultures')
      .select('id, name, icon, category')
      .order('name')
      .then(({ data }) => setAllCultures(data ?? []))
  }, [supabase])

  // Load list-view fiches
  const fetchFiches = useCallback(async () => {
    if (!currentCooperative) {
      setFiches([])
      setTotal(0)
      setIsLoading(false)
      return
    }
    setIsLoading(true)

    const scopeIds = await buildScopeIds(currentCooperative.id, currentCooperative.level ?? '')

    let query = supabase
      .from('fiches_techniques')
      .select('*', { count: 'exact' })
      .in('cooperative_id', scopeIds)
      .order('created_at', { ascending: false })

    if (debouncedSearch.trim()) {
      query = query.or(
        `title.ilike.%${debouncedSearch.trim()}%,culture.ilike.%${debouncedSearch.trim()}%`,
      )
    }

    const from = (page - 1) * PAGE_SIZE
    query = query.range(from, from + PAGE_SIZE - 1)

    const { data, error, count } = await query
    if (error) {
      setFiches([])
      setTotal(0)
    } else {
      setFiches((data ?? []) as FicheTechnique[])
      setTotal(count ?? 0)
    }
    setIsLoading(false)
  }, [currentCooperative, supabase, debouncedSearch, page, buildScopeIds])

  // Load locality-view fiches (with region/prefecture/canton names)
  const fetchLocalityFiches = useCallback(async () => {
    if (!currentCooperative) {
      setLocalityFiches([])
      return
    }
    setLoadingLocality(true)

    const scopeIds = await buildScopeIds(currentCooperative.id, currentCooperative.level ?? '')

    const { data } = await supabase
      .from('fiches_techniques')
      .select(
        'id, title, description, culture, type_agriculture, campaign, files, price_non_member, is_free_for_members, download_count, region:region_id(name), prefecture:prefecture_id(name), canton:canton_id(name)',
      )
      .in('cooperative_id', scopeIds)
      .eq('status', 'published')
      .order('title')

    setLocalityFiches((data ?? []) as unknown as LocalityFiche[])
    setLoadingLocality(false)
  }, [currentCooperative, supabase, buildScopeIds])

  useEffect(() => {
    fetchFiches()
  }, [fetchFiches])
  useResetPageOnChange(setPage, [debouncedSearch])
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

  // Téléchargement : lien signé par le serveur (GET /api/admin/fiches/[id]/files),
  // réservé au vendeur. Le bucket n'a aucune politique SELECT pour le navigateur.
  const handleDownload = useCallback(
    async (ficheId: string, index: number) => {
      try {
        const res = await fetch(`/api/admin/fiches/${ficheId}/files`, { cache: 'no-store' })
        const d = (await res.json().catch(() => ({}))) as {
          files?: { url: string | null; name: string }[]
          error?: string
        }
        const file = d.files?.[index]
        if (!res.ok || !file?.url) {
          toast({
            title: 'Téléchargement impossible',
            description:
              res.status === 403
                ? 'Seul le vendeur de ce compte peut ouvrir ses fichiers.'
                : file && !file.url
                  ? 'Fichier introuvable dans le stockage : déposez-le à nouveau.'
                  : (d.error ?? 'Réessayez dans un instant.'),
            variant: 'destructive',
          })
          return
        }
        const a = document.createElement('a')
        a.href = file.url
        a.download = file.name
        a.click()
      } catch {
        toast({
          title: 'Téléchargement impossible',
          description: 'Pas de réseau. Réessayez.',
          variant: 'destructive',
        })
      }
    },
    [toast],
  )

  // Fichiers choisis : contrôlés tout de suite (format, taille), envoyés à l'enregistrement.
  const handleFileUpload = (files: FileList) => {
    const picked = Array.from(files)
    for (const file of picked) {
      const problem = checkUploadFile(file)
      if (problem) toast({ title: 'Fichier refusé', description: problem, variant: 'destructive' })
    }
    const ok = picked.filter((f) => checkUploadFile(f) === null)
    if (ok.length > 0) clearFormError('files')
    setPendingFiles((prev) => [...prev, ...ok.filter((n) => !prev.some((p) => p.name === n.name))])
  }

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setPriceText(String(EMPTY_FORM.price_non_member))
    setLocationSelection({ region_id: '', prefecture_id: '', canton_id: '' })
    setPendingFiles([])
    setFormErrors({})
  }

  // Super-admin : la fiche appartient à la faîtière choisie dans le sélecteur
  // (publication « par l'opérateur », main 40c06ee) ; POST /api/fiches vérifie
  // que c'est bien une faîtière. Sans faîtière choisie, les comptes vendus par
  // FaîtiereHub se chargent dans l'administration.
  const ownerFaitiere =
    user?.role === 'super_admin' && currentCooperative?.level === 'faitiere'
      ? currentCooperative
      : null

  // Enregistrement par les routes serveur : brouillon (POST, champs validés),
  // fichiers dans `<faîtière>/<id>/`, puis PATCH. En cas d'échec, le brouillon
  // est supprimé. Le serveur décide des droits et son message est affiché tel quel.
  const handleSave = async () => {
    if (!currentCooperative) return
    // Champ vidé ou illisible : on garde le prix précédent, jamais 0 ni 500 en silence.
    const n = Number.parseInt(priceText, 10)
    const price = Number.isFinite(n) ? Math.max(0, n) : form.price_non_member
    setPriceText(String(price))
    // Ce qui manque est dit sous chaque champ ; le premier reçoit le focus
    // (sur mobile, Titre et Culture sont hors de l'écran, au-dessus du bouton).
    const errs = faitiereDraftErrors({
      title: form.title,
      culture: form.culture,
      publish: form.publish,
      fileCount: pendingFiles.length,
    })
    setFormErrors(errs)
    const first = FAITIERE_DRAFT_FIELDS.find((f) => errs[f])
    if (first) {
      const el = document.getElementById(`dash-${first}`)
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'center', behavior: smoothScroll() })
      return
    }
    if (form.publish && price === 0) {
      const ok = await confirm({
        title: 'Mettre en vente gratuitement ?',
        description: 'Ce compte deviendra téléchargeable gratuitement par tout le monde.',
        confirmLabel: 'Mettre en vente',
      })
      if (!ok) return
    }
    setSaving(true)
    let ficheId: string | null = null
    const fail = (description: string) =>
      toast({ title: 'Fiche non enregistrée', description, variant: 'destructive' })
    try {
      setProgress('Enregistrement du brouillon…')
      const draft = await ficheApi('/api/fiches', 'POST', {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        culture: form.culture,
        type_agriculture: form.type_agriculture,
        canton_id: location.canton_id || undefined,
        prefecture_id: location.prefecture_id || undefined,
        region_id: location.region_id || undefined,
        campaign: form.campaign.trim() || undefined,
        price_non_member: price,
        is_free_for_members: form.is_free_for_members,
        files: [],
        status: 'draft',
        ...(ownerFaitiere ? { cooperative_id: ownerFaitiere.id } : {}),
      })
      if (!draft.ok) {
        const fields = serverFieldErrors(draft.data.details)
        setFormErrors({ title: fields.title, culture: fields.culture, files: fields.files })
        fail(Object.values(fields)[0] ?? apiErrorText(draft, 'Enregistrement impossible'))
        return
      }
      const created = draft.data.fiche as { id: string; cooperative_id?: string | null }
      ficheId = created.id

      if (pendingFiles.length > 0) {
        const uploaded = await uploadFicheFiles(supabase.storage, {
          root: ficheRoot(created.cooperative_id),
          ficheId,
          files: pendingFiles,
          onProgress: (i, total, name) => setProgress(`Envoi ${i}/${total} : ${name}`),
        })
        setProgress('Vérification des fichiers…')
        const r = await ficheApi(`/api/fiches/${ficheId}`, 'PATCH', {
          files: uploaded,
          status: form.publish ? 'published' : 'draft',
        })
        if (!r.ok)
          throw new Error(
            serverFieldErrors(r.data.details).files ?? apiErrorText(r, 'Fichiers refusés'),
          )
      }

      toast({
        title: form.publish ? 'Fiche mise en vente' : 'Brouillon enregistré',
        description: form.title.trim(),
      })
      setShowAdd(false)
      resetForm()
      fetchFiches()
      if (viewMode === 'locality') fetchLocalityFiches()
    } catch (e) {
      let tail = ''
      if (ficheId) {
        const del = await ficheApi(`/api/fiches/${ficheId}`, 'DELETE')
        tail = del.ok
          ? ' Rien n’a été mis en ligne.'
          : ' Le brouillon reste visible dans la liste : demandez sa suppression à FaîtiereHub.'
        if (!del.ok) fetchFiches()
      }
      // Raison sans point final : jamais « réessayez.. Rien n’a été… ».
      fail(`${reasonOf(e)}.${tail}`)
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  // Statut et suppression : routes serveur. Un refus est affiché tel quel,
  // jamais un faux « Archivée » ou « Fiche supprimée ».
  const toggleStatus = async (fiche: FicheTechnique) => {
    const newStatus = fiche.status === 'published' ? 'archived' : 'published'
    if (newStatus === 'archived') {
      const ok = await confirm({
        title: 'Retirer cette fiche de la vente ?',
        description: 'Elle n’est plus proposée à la vente. Les acheteurs gardent leur accès.',
        confirmLabel: 'Retirer de la vente',
      })
      if (!ok) return
    }
    const r = await ficheApi(`/api/fiches/${fiche.id}`, 'PATCH', { status: newStatus })
    if (!r.ok) {
      toast({
        title: newStatus === 'published' ? 'Mise en vente refusée' : 'Retrait refusé',
        description:
          serverFieldErrors(r.data.details).files ?? apiErrorText(r, 'Modification impossible'),
        variant: 'destructive',
      })
      return
    }
    toast({
      title: newStatus === 'published' ? 'Fiche mise en vente' : 'Fiche retirée de la vente',
    })
    fetchFiches()
    if (viewMode === 'locality') fetchLocalityFiches()
  }

  const handleDelete = async (fiche: FicheTechnique) => {
    const ok = await confirm({
      title: 'Supprimer cette fiche ?',
      description: `« ${fiche.title} » sera définitivement supprimée avec ses fichiers. Uniquement possible si elle n’a jamais été vendue.`,
      destructive: true,
      confirmLabel: 'Supprimer',
    })
    if (!ok) return
    const r = await ficheApi(`/api/fiches/${fiche.id}`, 'DELETE')
    if (!r.ok) {
      toast({
        title: 'Suppression refusée',
        description: apiErrorText(r, 'Suppression impossible'),
        variant: 'destructive',
      })
      return
    }
    toast({ title: 'Fiche supprimée' })
    fetchFiches()
    if (viewMode === 'locality') fetchLocalityFiches()
  }

  // Publication des comptes d'exploitation : super_admin seulement depuis le 11/10 (40c06ee,
  // RLS operator_only_issuance appliquée) ; le parcours faîtière reste derrière
  // FAITIERE_PUBLISHING (lib/fiches/publishing.ts).
  const isAdmin =
    user?.role === 'super_admin' ||
    (FAITIERE_PUBLISHING && currentCooperative?.level === 'faitiere')
  // Super-admin sans faîtière choisie : comptes vendus par FaîtiereHub, dans l'administration.
  const openAdd = () => {
    if (user?.role === 'super_admin' && !ownerFaitiere) {
      router.push('/admin/comptes-exploitation')
      return
    }
    // Régions ou préfectures en échec au chargement de la page : relues ici,
    // sans attendre un rechargement.
    retryLocations()
    setShowAdd(true)
  }
  const unavailableLists = failedLocationLevels.flatMap((l) => LOCATION_LIST_LABEL[l] ?? [])

  return (
    <div className="space-y-8">
      <PageHeader
        title="Comptes d'exploitation"
        description="Fiches techniques et itinéraires de culture classés par canton, préfecture et région"
        action={
          isAdmin ? (
            <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={openAdd}>
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
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total fiches</p>
            <p className="text-2xl font-bold text-foreground">
              {viewMode === 'locality' ? totalLocalityFiches : total}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Régions couvertes</p>
            <p className="text-2xl font-bold text-primary">
              {Object.keys(localityTree).filter((r) => r !== 'Toutes régions').length || '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Téléchargements</p>
            <p className="text-2xl font-bold text-foreground">
              {localityFiches.reduce((s, f) => s + f.download_count, 0) ||
                fiches.reduce((s, f) => s + f.download_count, 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Cultures</p>
            <p className="text-2xl font-bold text-foreground">
              {new Set([...localityFiches.map((f) => f.culture), ...fiches.map((f) => f.culture)])
                .size || '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* View mode toggle + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* View toggle */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('locality')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'locality' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <MapPin className="h-3.5 w-3.5" />
            Par localité
          </button>
          <button
            type="button"
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
      {viewMode === 'locality' &&
        (loadingLocality ? (
          <LoadingBlock />
        ) : localityFiches.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Aucune fiche publiée"
            description="Les comptes d'exploitation apparaîtront ici organisés par région, préfecture et canton."
            action={
              isAdmin ? (
                <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={openAdd}>
                  <Upload className="h-4 w-4" />
                  Ajouter une fiche
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="space-y-3">
            {Object.entries(localityTree)
              .sort(([a], [b]) => a.localeCompare(b, 'fr'))
              .map(([region, prefectureMap]) => {
                const isOpen = expandedRegions.has(region)
                const regionTotal = Object.values(prefectureMap)
                  .flatMap((pm) => Object.values(pm))
                  .flat().length
                return (
                  <div
                    key={region}
                    className="border border-border rounded-xl overflow-hidden shadow-sm"
                  >
                    {/* Region header */}
                    <button
                      type="button"
                      onClick={() => toggleRegion(region)}
                      className="w-full flex items-center justify-between px-4 py-4 bg-muted/40 sm:px-5 hover:bg-muted/60 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-primary/10">
                          <MapPin className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <span className="font-semibold text-foreground">{region}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {regionTotal} fiche{regionTotal > 1 ? 's' : ''} ·{' '}
                            {Object.keys(prefectureMap).length} préfecture
                            {Object.keys(prefectureMap).length > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {/* Prefectures */}
                    {isOpen && (
                      <div className="divide-y divide-border/60">
                        {Object.entries(prefectureMap)
                          .sort(([a], [b]) => a.localeCompare(b, 'fr'))
                          .map(([prefecture, cantonMap]) => {
                            const prefKey = `${region}__${prefecture}`
                            const isPrefOpen = expandedPrefectures.has(prefKey)
                            const prefTotal = Object.values(cantonMap).flat().length
                            return (
                              <div key={prefecture}>
                                {/* Prefecture header */}
                                <button
                                  type="button"
                                  onClick={() => togglePrefecture(prefKey)}
                                  className="w-full flex items-center justify-between px-4 py-3 bg-background sm:px-6 hover:bg-muted/20 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2">
                                    <ChevronRight
                                      className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isPrefOpen ? 'rotate-90' : ''}`}
                                    />
                                    <span className="text-sm font-medium text-foreground">
                                      {prefecture}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      ({prefTotal} fiche{prefTotal > 1 ? 's' : ''})
                                    </span>
                                  </div>
                                </button>

                                {/* Cantons + fiches */}
                                {isPrefOpen && (
                                  <div className="px-4 pb-4 pt-2 bg-background space-y-5 sm:px-8">
                                    {Object.entries(cantonMap)
                                      .sort(([a], [b]) => a.localeCompare(b, 'fr'))
                                      .map(([canton, fichesInCanton]) => (
                                        <div key={canton}>
                                          {canton !== 'Tous cantons' && (
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 pl-0.5">
                                              Canton {canton}
                                            </p>
                                          )}
                                          <div className="space-y-2">
                                            {fichesInCanton.map((fiche) => {
                                              const icon =
                                                cultures.find((c) => c.name === fiche.culture)
                                                  ?.icon ?? '🌿'
                                              return (
                                                <div
                                                  key={fiche.id}
                                                  className="flex items-start gap-3 p-3.5 border border-border rounded-lg bg-card hover:bg-accent/5 transition-colors"
                                                >
                                                  <span className="text-2xl shrink-0 leading-tight">
                                                    {icon}
                                                  </span>
                                                  <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                      <span className="font-medium text-foreground text-sm">
                                                        {fiche.title}
                                                      </span>
                                                      <span
                                                        className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${fiche.price_non_member > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}
                                                      >
                                                        {dashboardPriceLabel(
                                                          fiche.price_non_member,
                                                        )}
                                                      </span>
                                                      {memberFreeBadge(fiche) && (
                                                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                                          {memberFreeBadge(fiche)}
                                                        </span>
                                                      )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                      {fiche.culture} ·{' '}
                                                      {labelTypeAgriculture(fiche.type_agriculture)}
                                                      {fiche.campaign
                                                        ? ` · Campagne ${fiche.campaign}`
                                                        : ''}
                                                    </p>
                                                    {fiche.description && (
                                                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                        {fiche.description}
                                                      </p>
                                                    )}
                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                      {fiche.files.map((f, i) => (
                                                        <button
                                                          type="button"
                                                          key={f.url}
                                                          onClick={() =>
                                                            handleDownload(fiche.id, i)
                                                          }
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
        ))}

      {/* ── LIST VIEW ──────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <Card className="border-border">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-foreground">Fiches techniques</CardTitle>
            <CardDescription>
              Comptes d'exploitation et itinéraires techniques uploadés
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            {isLoading ? (
              <LoadingBlock />
            ) : fiches.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={search ? 'Aucune fiche trouvée' : 'Aucune fiche technique'}
                description={
                  search
                    ? 'Essayez un autre terme'
                    : "Uploadez vos premiers comptes d'exploitation (DOCX, Excel)"
                }
                action={
                  !search && isAdmin ? (
                    <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={openAdd}>
                      <Upload className="h-4 w-4" />
                      Ajouter une fiche
                    </Button>
                  ) : null
                }
              />
            ) : (
              <>
                <div className="space-y-3">
                  {fiches.map((fiche) => {
                    const toggleLabel =
                      fiche.status === 'published' ? 'Retirer de la vente' : 'Mettre en vente'
                    return (
                      // Téléphone : fiche empilée, prix en haut, actions en pied
                      // sur toute la largeur. À partir de sm : actions à droite.
                      <div
                        key={fiche.id}
                        className="flex flex-col gap-3 p-3 border border-border rounded-lg hover:bg-accent/5 transition-colors sm:flex-row sm:items-start sm:gap-4 sm:p-4"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0 sm:gap-4">
                          <div className="text-2xl shrink-0 sm:text-3xl" aria-hidden="true">
                            {cultures.find((c) => c.name === fiche.culture)?.icon ?? '🌿'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-foreground break-words">
                                {fiche.title}
                              </h3>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${fiche.status === 'published' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
                              >
                                {labelFicheStatus(fiche.status)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap mt-1.5">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${fiche.price_non_member > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}
                              >
                                {dashboardPriceLabel(fiche.price_non_member)}
                              </span>
                              {memberFreeBadge(fiche) && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                  {memberFreeBadge(fiche)}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {fiche.culture} • {labelTypeAgriculture(fiche.type_agriculture)}
                              {fiche.campaign ? ` • ${fiche.campaign}` : ''}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {fiche.files.map((f, i) => (
                                <button
                                  type="button"
                                  key={f.url}
                                  onClick={() => handleDownload(fiche.id, i)}
                                  title={`Télécharger ${f.name}`}
                                  className="inline-flex max-w-full min-w-0 items-center gap-1 text-xs bg-secondary/50 px-2 py-1 rounded hover:bg-primary/10 hover:text-primary transition-colors"
                                >
                                  <Download className="h-3 w-3 shrink-0" />
                                  <span className="truncate">
                                    {fileIcon(f.type)} {f.name}
                                  </span>
                                </button>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              {fiche.download_count} téléchargement
                              {fiche.download_count > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-2 border-t border-border pt-3 sm:shrink-0 sm:border-0 sm:pt-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-1.5 sm:flex-none"
                              onClick={() => toggleStatus(fiche)}
                              title={toggleLabel}
                              aria-label={toggleLabel}
                            >
                              {fiche.status === 'published' ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                              <span className="sm:sr-only">{toggleLabel}</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(fiche)}
                              title="Supprimer la fiche"
                              aria-label="Supprimer la fiche"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
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
      )}

      {/* Add fiche dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle fiche technique</DialogTitle>
            <DialogDescription>
              {ownerFaitiere
                ? `Publiée pour ${ownerFaitiere.name} : un compte d'exploitation ou itinéraire technique (DOCX, Excel, PDF)`
                : "Uploadez un compte d'exploitation ou itinéraire technique (DOCX, Excel, PDF)"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dash-title">
                Titre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dash-title"
                value={form.title}
                onChange={(e) => {
                  setForm((f) => ({ ...f, title: e.target.value }))
                  clearFormError('title')
                }}
                placeholder="Compte d'exploitation Tomate, canton de Tsévié"
                maxLength={FICHE_LIMITS.titleMax}
                aria-invalid={formErrors.title ? true : undefined}
                aria-describedby={formErrors.title ? 'dash-title-err' : undefined}
              />
              <FieldError id="dash-title-err" text={formErrors.title} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dash-culture">
                  Culture <span className="text-destructive">*</span>
                </Label>
                <select
                  id="dash-culture"
                  className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm aria-[invalid=true]:border-destructive"
                  value={form.culture}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, culture: e.target.value }))
                    clearFormError('culture')
                  }}
                  aria-invalid={formErrors.culture ? true : undefined}
                  aria-describedby={formErrors.culture ? 'dash-culture-err' : undefined}
                >
                  <option value="">— Choisir —</option>
                  {cultures.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
                <FieldError id="dash-culture-err" text={formErrors.culture} />
              </div>
              <div className="space-y-2">
                <Label>Type d'agriculture</Label>
                <select
                  className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                  value={form.type_agriculture}
                  onChange={(e) => setForm((f) => ({ ...f, type_agriculture: e.target.value }))}
                >
                  {TYPES_AGRICULTURE.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
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
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
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
                    {prefectures.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
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
                    {cantons.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {unavailableLists.length > 0 ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-center gap-2 text-xs font-medium text-destructive"
                >
                  <span>
                    {unavailableLists.length === 1
                      ? `Liste des ${unavailableLists[0]} non chargée : vérifiez votre connexion.`
                      : `Listes des ${unavailableLists.join(' et des ')} non chargées : vérifiez votre connexion.`}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-foreground"
                    onClick={retryLocations}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Réessayer
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campagne</Label>
                <Input
                  value={form.campaign}
                  onChange={(e) => setForm((f) => ({ ...f, campaign: e.target.value }))}
                  placeholder="2025-2026"
                  maxLength={FICHE_LIMITS.campaignMax}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dash-price">Prix non-membre (FCFA)</Label>
                <Input
                  id="dash-price"
                  inputMode="numeric"
                  value={priceText}
                  onChange={(e) => setPriceText(e.target.value.replace(/\D/g, '').slice(0, 7))}
                  onBlur={() => {
                    // Champ vidé : on revient au prix précédent ; 0 reste possible (gratuit).
                    const n = Number.parseInt(priceText, 10)
                    const price = Number.isFinite(n) ? Math.max(0, n) : form.price_non_member
                    setPriceText(String(price))
                    setForm((f) => ({ ...f, price_non_member: price }))
                  }}
                  aria-describedby="dash-price-hint"
                />
                <p id="dash-price-hint" className="text-xs text-muted-foreground">
                  0 = téléchargement gratuit pour tous.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <textarea
                className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm min-h-[60px]"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description de la fiche technique…"
                maxLength={FICHE_LIMITS.descriptionMax}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_free_for_members}
                onChange={(e) => setForm((f) => ({ ...f, is_free_for_members: e.target.checked }))}
              />
              {MEMBER_FREE_CHECKBOX_LABEL.faitiere}
            </label>

            <div className="space-y-2">
              {/* Un brouillon s'enregistre sans fichier : obligatoire seulement pour la vente. */}
              <Label htmlFor="dash-files">
                Fichiers {form.publish ? <span className="text-destructive">*</span> : null}
              </Label>
              <button
                id="dash-files"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                aria-invalid={formErrors.files ? true : undefined}
                aria-describedby={formErrors.files ? 'dash-files-err' : undefined}
                className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary hover:bg-accent/5 transition-colors cursor-pointer disabled:opacity-50 aria-[invalid=true]:border-destructive"
              >
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-foreground font-medium">
                  Cliquez pour ajouter des fichiers
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, Excel (.xlsx), Word (.docx), 20 Mo max. Envoyés à l’enregistrement.
                </p>
              </button>
              <FieldError id="dash-files-err" text={formErrors.files} />
              <input
                ref={fileInputRef}
                type="file"
                accept={UPLOAD_ACCEPT}
                multiple
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) handleFileUpload(e.target.files)
                  e.target.value = ''
                }}
              />
              {pendingFiles.length > 0 && (
                <div className="space-y-2 mt-3">
                  {pendingFiles.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span>{fileIcon(f.name.split('.').pop()?.toLowerCase() ?? '')}</span>
                        <span className="text-sm text-foreground truncate">{f.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          ({formatFileSize(f.size)})
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive"
                        aria-label={`Retirer ${f.name}`}
                        disabled={saving}
                        onClick={() => setPendingFiles((prev) => prev.filter((x) => x !== f))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.publish}
                onChange={(e) => {
                  setForm((f) => ({ ...f, publish: e.target.checked }))
                  if (!e.target.checked) clearFormError('files')
                }}
              />
              Mettre en vente tout de suite
            </label>
          </div>

          <DialogFooter className="items-center">
            {progress ? (
              <output className="mr-auto text-sm text-muted-foreground">{progress}</output>
            ) : null}
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={saving}>
              Annuler
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90 gap-2"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
              {form.publish ? 'Mettre en vente' : 'Enregistrer le brouillon'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmNode}
    </div>
  )
}
