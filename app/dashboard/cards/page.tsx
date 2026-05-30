'use client'

// Build: 2026-05-27T12:30 — force CDN invalidation
import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Download, QrCode, Trash2, RefreshCw, Users, CheckCircle2, Search, Printer } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useAuth } from '@/app/context/auth-context'
import { useToast } from '@/hooks/use-toast'
import { useDebounced } from '@/hooks/use-debounced'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { CardStatusBadge } from '@/components/shared/status-badge'
import { PageHeader } from '@/components/shared/page-header'
import { PaginationBar } from '@/components/shared/pagination'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { CardSvgPreview } from '@/components/dashboard/card-svg-preview'
import { errorMessage } from '@/lib/utils/errors'
import { cardSettingsSchema, cardTemplateSchema, flattenZodErrors } from '@/lib/validators/schemas'
import { downloadCardImage, renderCardImage } from '@/lib/utils/card-image'
import {
  DEFAULT_CARD_SETTINGS,
  DEFAULT_CARD_TEMPLATE,
  type CardSettings,
  type CardTemplate,
  type Member,
  type MemberCard,
} from '@/types/domain'

const PAGE_SIZE = 20

interface SettingsRow {
  cooperative_id: string
  card_template: CardTemplate | null
  card_settings: CardSettings | null
}

export default function CardsPage() {
  const { currentCooperative, cooperatives } = useCooperative()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm, confirmNode } = useConfirm()
  const supabase = useMemo(() => createClient(), [])

  // Cards/members state
  const [cards, setCards] = useState<MemberCard[]>([])
  const [members, setMembers] = useState<Pick<Member, 'id' | 'first_name' | 'last_name'>[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 200)
  const [page, setPage] = useState(1)

  // Dialogs
  const [showGenerate, setShowGenerate] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [selectedCoopId, setSelectedCoopId] = useState('')
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([])
  const [bulkSearch, setBulkSearch] = useState('')
  const [validityDays, setValidityDays] = useState(365)

  // Saving states
  const [saving, setSaving] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)

  // Persisted settings
  const [template, setTemplate] = useState<CardTemplate>(DEFAULT_CARD_TEMPLATE)
  const [settings, setSettings] = useState<CardSettings>(DEFAULT_CARD_SETTINGS)
  const [templateErrors, setTemplateErrors] = useState<Record<string, string>>({})

  // Faîtière logic: detect if current user manages a faîtière (parent org)
  const isFaitiereAdmin = currentCooperative?.level === 'faitiere' || currentCooperative?.level === 'union'
  
  // Child cooperatives (only leaf-level cooperatives for card generation)
  const childCooperatives = useMemo(() => {
    if (!isFaitiereAdmin || !currentCooperative) return []
    return cooperatives.filter(c => c.level === 'cooperative' && c.id !== currentCooperative.id)
  }, [isFaitiereAdmin, currentCooperative, cooperatives])

  // Members filtered by selected cooperative (for faîtière admins)
  const [allMembers, setAllMembers] = useState<(Pick<Member, 'id' | 'first_name' | 'last_name'> & { cooperative_id: string })[]>([])
  
  const filteredMembersForGenerate = useMemo(() => {
    if (!isFaitiereAdmin) return members
    if (!selectedCoopId) return []
    return allMembers.filter(m => m.cooperative_id === selectedCoopId)
  }, [isFaitiereAdmin, selectedCoopId, members, allMembers])

  const fetchCards = useCallback(async () => {
    if (!currentCooperative) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    let query = supabase
      .from('member_cards')
      .select('*, member:members(first_name, last_name, email, phone, photo_url, prefecture, region, village, canton, faitiere)')
    
    if (currentCooperative.level === 'faitiere' || currentCooperative.level === 'union') {
      // Fetch all cooperative IDs in hierarchy directly
      const { data: allCoops } = await supabase
        .from('cooperatives')
        .select('id')
        .or(`id.eq.${currentCooperative.id},parent_id.eq.${currentCooperative.id}`)
      const directIds = (allCoops ?? []).map(c => c.id)
      
      // Also get grandchildren
      if (directIds.length > 0) {
        const { data: grandChildren } = await supabase
          .from('cooperatives')
          .select('id')
          .in('parent_id', directIds)
        const allIds = [...new Set([...directIds, ...(grandChildren ?? []).map(c => c.id)])]
        query = query.in('cooperative_id', allIds)
      }
    } else {
      query = query.eq('cooperative_id', currentCooperative.id)
    }
    // If currentCooperative is null, load all (RLS will filter)
    
    query = query.order('created_at', { ascending: false })
    const { data, error } = await query
    if (error) {
      toast({ title: 'Erreur', description: errorMessage(error), variant: 'destructive' })
    } else {
      setCards((data ?? []) as MemberCard[])
    }
    setIsLoading(false)
  }, [currentCooperative, supabase, toast])

  const fetchMembers = useCallback(async () => {
    let query = supabase
      .from('members')
      .select('id, first_name, last_name, cooperative_id')
    if (currentCooperative && !isFaitiereAdmin) {
      query = query.eq('cooperative_id', currentCooperative.id)
    }
    query = query.eq('status', 'active').order('last_name')
    const { data, error } = await query
    if (!error) {
      const rows = (data ?? []) as (Pick<Member, 'id' | 'first_name' | 'last_name'> & { cooperative_id: string })[]
      setMembers(rows)
      setAllMembers(rows)
    }
  }, [currentCooperative, supabase, user, isFaitiereAdmin])

  const loadCooperativeSettings = useCallback(async () => {
    if (!currentCooperative) return
    const { data } = await supabase
      .from('cooperative_settings')
      .select('cooperative_id, card_template, card_settings')
      .eq('cooperative_id', currentCooperative.id)
      .maybeSingle<SettingsRow>()
    if (data?.card_template) setTemplate(data.card_template)
    if (data?.card_settings) {
      setSettings(data.card_settings)
      setValidityDays(data.card_settings.defaultValidityDays)
    }
  }, [currentCooperative, supabase])

  useEffect(() => {
    fetchCards()
    fetchMembers()
    loadCooperativeSettings()
  }, [fetchCards, fetchMembers, loadCooperativeSettings])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const filteredCards = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim()
    if (!q) return cards
    return cards.filter((c) => {
      const name = c.member ? `${c.member.first_name} ${c.member.last_name}` : ''
      return `${name} ${c.card_number}`.toLowerCase().includes(q)
    })
  }, [cards, debouncedSearch])

  const pagedCards = useMemo(
    () => filteredCards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredCards, page],
  )

  const filteredBulkMembers = useMemo(() => {
    const q = bulkSearch.toLowerCase().trim()
    if (!q) return members
    return members.filter((m) => `${m.first_name} ${m.last_name}`.toLowerCase().includes(q))
  }, [members, bulkSearch])

  // -- helpers --

  const generateCardNumber = useCallback(
    async (cooperativeId: string): Promise<string> => {
      // SEC-02: numbers are generated SERVER-SIDE with crypto.randomInt() and a
      // DB uniqueness check, never with client-side Math.random().
      const res = await fetch('/api/cards/generate-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cooperativeId }),
      })
      if (!res.ok) {
        const { error: msg } = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(msg ?? 'Échec de génération du numéro de carte')
      }
      const { cardNumber } = (await res.json()) as { cardNumber: string }
      return cardNumber
    },
    [],
  )

  const buildQrPayload = useCallback(
    (_memberId: string, cardNumber: string, _member?: { first_name?: string | null; last_name?: string | null; phone?: string | null; photo_url?: string | null; village?: string | null; canton?: string | null; prefecture?: string | null; region?: string | null } | null) => {
      // QR code = direct verification URL (scannable by any phone)
      // All member info is displayed on the verify page from the database
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://faitierehub.com'
      return `${baseUrl}/verify/${encodeURIComponent(cardNumber)}`
    },
    [],
  )

  // -- single generation --

  const handleGenerate = async () => {
    if (!currentCooperative || !selectedMemberId) {
      toast({ title: 'Sélectionnez un membre', variant: 'destructive' })
      return
    }
    // For faîtière admins, use the selected child cooperative
    const targetCoopId = isFaitiereAdmin ? selectedCoopId : currentCooperative.id
    const targetCoopName = isFaitiereAdmin 
      ? childCooperatives.find(c => c.id === selectedCoopId)?.name 
      : currentCooperative.name
    
    if (!targetCoopId) {
      toast({ title: 'Sélectionnez une coopérative', variant: 'destructive' })
      return
    }

    setSaving(true)
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + validityDays)

    // Check if member already has an active card — if so, RENEW it (keep same number)
    const { data: existingCard } = await supabase
      .from('member_cards')
      .select('id, card_number, qr_data')
      .eq('member_id', selectedMemberId)
      .eq('status', 'active')
      .maybeSingle()

    if (existingCard) {
      // RENEW: update expiry date, keep same card_number and qr_data
      const { error } = await supabase
        .from('member_cards')
        .update({ expiry_date: expiry.toISOString().split('T')[0] })
        .eq('id', existingCard.id)

      setSaving(false)
      if (error) {
        toast({ title: 'Impossible de renouveler la carte', description: errorMessage(error), variant: 'destructive' })
        return
      }
      toast({ title: 'Carte renouvelée', description: `${existingCard.card_number} — validité prolongée` })
    } else {
      // NEW CARD: generate new number (member has no active card)
      // Also check for any previously revoked/expired card to reuse the number
      const { data: previousCard } = await supabase
        .from('member_cards')
        .select('card_number')
        .eq('member_id', selectedMemberId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Reuse previous card number if exists, otherwise generate one server-side.
      let cardNumber: string
      if (previousCard?.card_number) {
        cardNumber = previousCard.card_number
      } else {
        cardNumber = await generateCardNumber(targetCoopId)
      }

      const qrPayload = buildQrPayload(selectedMemberId, cardNumber, null)

      const { data: inserted, error } = await supabase
        .from('member_cards')
        .insert({
          cooperative_id: targetCoopId,
          member_id: selectedMemberId,
          card_number: cardNumber,
          status: 'active',
          expiry_date: expiry.toISOString().split('T')[0],
          qr_data: qrPayload,
        })
        .select('id, card_number')
        .single()

      setSaving(false)
      if (error || !inserted) {
        toast({
          title: 'Impossible de générer la carte',
          description: errorMessage(error) || 'La carte n\'a pas été enregistrée (vérifiez vos droits)',
          variant: 'destructive',
        })
        return
      }
      toast({ title: 'Carte générée', description: `${inserted.card_number} — ${currentCooperative.name}/${targetCoopName}` })
    }

    setShowGenerate(false)
    setSelectedMemberId('')
    setSelectedCoopId('')
    fetchCards()
  }

  const handleBulkGenerate = async () => {
    if (!currentCooperative || bulkSelectedIds.length === 0) {
      toast({ title: 'Sélectionnez au moins un membre', variant: 'destructive' })
      return
    }
    setSaving(true)
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + validityDays)
    const expiryStr = expiry.toISOString().split('T')[0]

    // For each member: renew if active card exists, create new if not
    let renewedCount = 0
    let createdCount = 0

    for (const memberId of bulkSelectedIds) {
      // Check for existing active card
      const { data: existingCard } = await supabase
        .from('member_cards')
        .select('id, card_number')
        .eq('member_id', memberId)
        .eq('status', 'active')
        .maybeSingle()

      if (existingCard) {
        // RENEW: just extend expiry
        await supabase
          .from('member_cards')
          .update({ expiry_date: expiryStr })
          .eq('id', existingCard.id)
        renewedCount++
      } else {
        // Check for previous card number to reuse
        const { data: previousCard } = await supabase
          .from('member_cards')
          .select('card_number')
          .eq('member_id', memberId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const cardNumber =
          previousCard?.card_number ?? (await generateCardNumber(currentCooperative.id))
        const qrPayload = buildQrPayload(memberId, cardNumber, null)

        await supabase.from('member_cards').insert({
          cooperative_id: currentCooperative.id,
          member_id: memberId,
          card_number: cardNumber,
          status: 'active',
          expiry_date: expiryStr,
          qr_data: qrPayload,
        })
        createdCount++
      }
    }

    setSaving(false)
    const parts = []
    if (createdCount > 0) parts.push(`${createdCount} créée${createdCount > 1 ? 's' : ''}`)
    if (renewedCount > 0) parts.push(`${renewedCount} renouvelée${renewedCount > 1 ? 's' : ''}`)
    toast({ title: `Cartes : ${parts.join(', ')}` })
    setShowBulk(false)
    setBulkSelectedIds([])
    setBulkSearch('')
    fetchCards()
  }

  const handleRevoke = async (card: MemberCard) => {
    const ok = await confirm({
      title: 'Révoquer la carte ?',
      description: 'Le membre perdra l\'accès aux comptes d\'exploitation jusqu\'à l\'émission d\'une nouvelle carte.',
      destructive: true,
      confirmLabel: 'Révoquer',
    })
    if (!ok) return
    const { error } = await supabase
      .from('member_cards')
      .update({ status: 'revoked' })
      .eq('id', card.id)
    if (error) {
      toast({ title: 'Échec de la révocation', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Carte révoquée' })
    fetchCards()
  }

  const handleDownload = async (card: MemberCard) => {
    setDownloadingId(card.id)
    try {
      // Resolve cooperative and faîtière names from the card's cooperative_id
      const cardCoop = cooperatives.find(c => c.id === card.cooperative_id)
      const coopName = cardCoop?.name ?? currentCooperative?.name
      // If current org is a faîtière, use its name as faitiereName
      const faitName = isFaitiereAdmin 
        ? currentCooperative?.name 
        : (cardCoop?.faitiereName ?? currentCooperative?.faitiereName)

      await downloadCardImage({
        card,
        template,
        cooperativeName: coopName,
        faitiereName: faitName,
        qrPayload: card.qr_data || buildQrPayload(card.member_id, card.card_number),
      })
      toast({ title: 'Carte téléchargée' })
    } catch (e) {
      toast({ title: 'Échec du téléchargement', description: errorMessage(e), variant: 'destructive' })
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDownloadAll = async () => {
    const active = cards.filter((c) => c.status === 'active')
    if (active.length === 0) return
    if (active.length > 25) {
      const ok = await confirm({
        title: `Télécharger ${active.length} cartes ?`,
        description: 'Cela déclenchera un téléchargement par carte. Votre navigateur pourrait demander l\'autorisation pour les téléchargements multiples.',
        confirmLabel: 'Télécharger',
      })
      if (!ok) return
    }
    setDownloadingAll(true)
    try {
      for (const card of active) {
        const cardCoop = cooperatives.find(c => c.id === card.cooperative_id)
        const coopName = cardCoop?.name ?? currentCooperative?.name
        const faitName = isFaitiereAdmin 
          ? currentCooperative?.name 
          : (cardCoop?.faitiereName ?? currentCooperative?.faitiereName)

        await downloadCardImage({
          card,
          template,
          cooperativeName: coopName,
          faitiereName: faitName,
          qrPayload: card.qr_data || buildQrPayload(card.member_id, card.card_number),
        })
        // Small delay so browsers don't merge downloads
        await new Promise((r) => setTimeout(r, 150))
      }
      toast({ title: `${active.length} carte${active.length === 1 ? '' : 's'} téléchargée${active.length === 1 ? '' : 's'}` })
    } catch (e) {
      toast({ title: 'Échec du téléchargement', description: errorMessage(e), variant: 'destructive' })
    } finally {
      setDownloadingAll(false)
    }
  }

  // -- template/settings persistence --

  const handleSaveTemplate = async () => {
    if (!currentCooperative) return
    const parsed = cardTemplateSchema.safeParse(template)
    if (!parsed.success) {
      setTemplateErrors(flattenZodErrors(parsed.error))
      return
    }
    setTemplateErrors({})
    setSavingTemplate(true)
    const { error } = await supabase.from('cooperative_settings').upsert(
      { cooperative_id: currentCooperative.id, card_template: parsed.data },
      { onConflict: 'cooperative_id' },
    )
    setSavingTemplate(false)
    if (error) {
      toast({ title: 'Impossible d\'enregistrer le modèle', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Modèle enregistré' })
  }

  const handleSaveSettings = async () => {
    if (!currentCooperative) return
    const parsed = cardSettingsSchema.safeParse(settings)
    if (!parsed.success) {
      toast({ title: 'Paramètres invalides', description: parsed.error.issues[0]?.message, variant: 'destructive' })
      return
    }
    setSavingSettings(true)
    const { error } = await supabase.from('cooperative_settings').upsert(
      { cooperative_id: currentCooperative.id, card_settings: parsed.data },
      { onConflict: 'cooperative_id' },
    )
    setSavingSettings(false)
    if (error) {
      toast({ title: 'Impossible d\'enregistrer les paramètres', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Paramètres enregistrés' })
  }

  // Preview QR payload (so the preview reflects current settings choices)
  const previewQr = useMemo(() => {
    const sample: Record<string, string> = {}
    if (settings.qrCodeIncludes.cardNumber) sample.card_number = 'COOP-12345'
    if (settings.qrCodeIncludes.memberId) sample.member_id = 'preview'
    if (settings.qrCodeIncludes.cooperativeId && currentCooperative)
      sample.cooperative_id = currentCooperative.id
    return JSON.stringify(sample)
  }, [settings, currentCooperative])

  const activeCount = cards.filter((c) => c.status === 'active').length

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cartes membres"
        description="Générer et gérer les cartes numériques avec codes QR"
      />

      <Tabs defaultValue="generated" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3 border-b border-border bg-transparent">
          <TabsTrigger value="generated" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Cartes ({cards.length})
          </TabsTrigger>
          <TabsTrigger value="template" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Modèle
          </TabsTrigger>
          <TabsTrigger value="settings" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Paramètres
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generated" className="space-y-6 mt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-0.5">
              <h2 className="text-lg font-semibold text-foreground">Cartes générées</h2>
              <p className="text-sm text-muted-foreground">{activeCount} carte{activeCount === 1 ? '' : 's'} active{activeCount === 1 ? '' : 's'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2 border-border" onClick={fetchCards} aria-label="Actualiser">
                <RefreshCw className="h-4 w-4" />
                Actualiser
              </Button>
              <Button
                variant="outline"
                className="gap-2 border-border"
                onClick={handleDownloadAll}
                disabled={downloadingAll || activeCount === 0}
              >
                {downloadingAll ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                Tout télécharger
              </Button>
              <Link href="/dashboard/cards/print">
                <Button variant="outline" className="gap-2 border-border">
                  <Printer className="h-4 w-4" />
                  Imprimer A4
                </Button>
              </Link>
              <Button variant="outline" className="gap-2 border-border" onClick={() => setShowBulk(true)}>
                <Users className="h-4 w-4" />
                Génération en masse
              </Button>
              <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setShowGenerate(true)}>
                <Plus className="h-4 w-4" />
                Générer une carte
              </Button>
            </div>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Rechercher par nom ou numéro de carte…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Rechercher des cartes"
            />
          </div>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Cartes membres</CardTitle>
              <CardDescription>Toutes les cartes générées pour l&apos;accès aux comptes d&apos;exploitation</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <LoadingBlock />
              ) : filteredCards.length === 0 ? (
                <EmptyState
                  icon={QrCode}
                  title={search ? 'Aucune carte ne correspond à votre recherche' : 'Aucune carte générée pour le moment'}
                  description={
                    search
                      ? 'Essayez un autre nom ou numéro de carte'
                      : 'Générez des cartes pour vos membres afin d\'activer l\'accès aux comptes d\'exploitation'
                  }
                  action={
                    !search ? (
                      <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setShowGenerate(true)}>
                        <Plus className="h-4 w-4" />
                        Générer la première carte
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-4 font-semibold text-foreground">Membre</th>
                          <th className="text-left py-3 px-4 font-semibold text-foreground">Numéro de carte</th>
                          <th className="text-left py-3 px-4 font-semibold text-foreground">Expiration</th>
                          <th className="text-center py-3 px-4 font-semibold text-foreground">Statut</th>
                          <th className="text-right py-3 px-4 font-semibold text-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedCards.map((card) => (
                          <tr key={card.id} className="border-b border-border hover:bg-accent/5 transition-colors">
                            <td className="py-3 px-4 text-foreground font-medium">
                              {card.member ? `${card.member.first_name} ${card.member.last_name}` : '—'}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground font-mono text-sm">{card.card_number}</td>
                            <td className="py-3 px-4 text-muted-foreground">{card.expiry_date || '—'}</td>
                            <td className="py-3 px-4 text-center">
                              <CardStatusBadge status={card.status} />
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex gap-2 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-border"
                                  onClick={() => handleDownload(card)}
                                  disabled={downloadingId === card.id}
                                  aria-label={`Download ${card.card_number}`}
                                >
                                  {downloadingId === card.id ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                                </Button>
                                {card.status === 'active' ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-border text-destructive hover:bg-destructive/10"
                                    onClick={() => handleRevoke(card)}
                                    aria-label={`Revoke ${card.card_number}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={filteredCards.length}
                    onPageChange={setPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="template" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Aperçu du design de carte</CardTitle>
              <CardDescription>Carte d'identité membre premium — design WAOO</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Premium card preview — SVG-based (matches actual export) */}
              <div className="flex justify-center">
                <CardSvgPreview
                  cooperativeName={isFaitiereAdmin && selectedCoopId ? childCooperatives.find(c => c.id === selectedCoopId)?.name : currentCooperative?.name}
                  faitiereName={isFaitiereAdmin ? currentCooperative?.name : currentCooperative?.faitiereName}
                  level="or"
                  template={template}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FieldText
                  label="Titre de la carte"
                  value={template.title}
                  onChange={(v) => setTemplate((t) => ({ ...t, title: v }))}
                  error={templateErrors.title}
                />
                <FieldText
                  label="Sous-titre de la carte"
                  value={template.subtitle}
                  onChange={(v) => setTemplate((t) => ({ ...t, subtitle: v }))}
                  error={templateErrors.subtitle}
                />
                <FieldColor
                  label="Couleur de fond"
                  value={template.bgColor}
                  onChange={(v) => setTemplate((t) => ({ ...t, bgColor: v }))}
                  error={templateErrors.bgColor}
                />
                <FieldColor
                  label="Couleur d'accent"
                  value={template.accentColor}
                  onChange={(v) => setTemplate((t) => ({ ...t, accentColor: v }))}
                  error={templateErrors.accentColor}
                />
                <FieldColor
                  label="Couleur du texte"
                  value={template.textColor}
                  onChange={(v) => setTemplate((t) => ({ ...t, textColor: v }))}
                  error={templateErrors.textColor}
                />
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setTemplate(DEFAULT_CARD_TEMPLATE)
                    setTemplateErrors({})
                  }}
                >
                  Réinitialiser
                </Button>
                <Button
                  className="bg-primary hover:bg-primary/90 gap-2"
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate}
                >
                  {savingTemplate ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  Enregistrer le modèle
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Paramètres des cartes</CardTitle>
              <CardDescription>Configurer la génération et l'expiration des cartes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Durée de validité par défaut (jours)</Label>
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={settings.defaultValidityDays}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      defaultValidityDays: Math.max(1, Math.min(3650, parseInt(e.target.value) || 1)),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Les cartes expireront après ce nombre de jours à partir de la génération.
                </p>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Contenu du code QR</legend>
                {(
                  [
                    ['cardNumber', 'Numéro de carte'],
                    ['memberId', 'ID du membre'],
                    ['cooperativeId', 'ID de la coopérative'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={settings.qrCodeIncludes[key]}
                      onCheckedChange={(v) =>
                        setSettings((s) => ({
                          ...s,
                          qrCodeIncludes: { ...s.qrCodeIncludes, [key]: !!v },
                        }))
                      }
                    />
                    <span className="text-sm text-foreground">{label}</span>
                  </label>
                ))}
              </fieldset>
              <Button
                className="w-full bg-primary hover:bg-primary/90 gap-2"
                onClick={handleSaveSettings}
                disabled={savingSettings}
              >
                {savingSettings ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Generate single card */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Générer une carte membre</DialogTitle>
            <DialogDescription>Créer une nouvelle carte numérique avec code QR.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Cooperative selector for faîtière admins */}
            {isFaitiereAdmin && (
              <div className="space-y-2">
                <Label>Coopérative <span className="text-destructive">*</span></Label>
                <select
                  className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                  value={selectedCoopId}
                  onChange={(e) => {
                    setSelectedCoopId(e.target.value)
                    setSelectedMemberId('')
                  }}
                >
                  <option value="">— Choisir la coopérative —</option>
                  {childCooperatives.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  La carte affichera : {currentCooperative?.name} / {childCooperatives.find(c => c.id === selectedCoopId)?.name || '…'}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Membre <span className="text-destructive">*</span></Label>
              <select
                className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                disabled={isFaitiereAdmin && !selectedCoopId}
              >
                <option value="">— Choisir un membre —</option>
                {filteredMembersForGenerate.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.first_name} {m.last_name}
                  </option>
                ))}
              </select>
              {isFaitiereAdmin && !selectedCoopId && (
                <p className="text-xs text-muted-foreground">
                  Sélectionnez d'abord une coopérative.
                </p>
              )}
              {filteredMembersForGenerate.length === 0 && (selectedCoopId || !isFaitiereAdmin) && (
                <p className="text-xs text-muted-foreground">
                  Aucun membre actif. Ajoutez des membres d'abord.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Durée de validité (jours)</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={validityDays}
                onChange={(e) => setValidityDays(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)} disabled={saving}>
              Annuler
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={handleGenerate}
              disabled={saving || !selectedMemberId || (isFaitiereAdmin && !selectedCoopId)}
            >
              {saving ? <Spinner className="h-4 w-4 mr-2" /> : null}
              Générer la carte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk generate */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Generate Member Cards</DialogTitle>
            <DialogDescription>
              Issuing a new card revokes any existing active card for the selected members.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Label>
                Selected: <strong>{bulkSelectedIds.length}</strong> / {members.length}
              </Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkSelectedIds(filteredBulkMembers.map((m) => m.id))}
                  disabled={filteredBulkMembers.length === 0}
                >
                  Select shown
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkSelectedIds([])}
                  disabled={bulkSelectedIds.length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Filter members…"
                value={bulkSearch}
                onChange={(e) => setBulkSearch(e.target.value)}
              />
            </div>
            <div className="border border-border rounded-md p-2 max-h-72 overflow-y-auto">
              {filteredBulkMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {members.length === 0 ? 'No active members yet' : 'No members match the filter'}
                </p>
              ) : (
                <ul className="space-y-1">
                  {filteredBulkMembers.map((m) => {
                    const checked = bulkSelectedIds.includes(m.id)
                    return (
                      <li key={m.id}>
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-accent/5 rounded p-2">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              setBulkSelectedIds((prev) =>
                                v ? [...prev, m.id] : prev.filter((id) => id !== m.id),
                              )
                            }
                          />
                          <span className="text-sm text-foreground">
                            {m.first_name} {m.last_name}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <Label>Validity (days)</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={validityDays}
                onChange={(e) => setValidityDays(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulk(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={handleBulkGenerate}
              disabled={saving || bulkSelectedIds.length === 0}
            >
              {saving ? <Spinner className="h-4 w-4 mr-2" /> : null}
              Generate {bulkSelectedIds.length || ''} Card{bulkSelectedIds.length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmNode}
    </div>
  )
}

function FieldText({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function FieldColor({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-16 border border-border rounded-md cursor-pointer"
          aria-label={`${label} picker`}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#16a34a" className="font-mono" />
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

// Suppress unused import warning for `renderCardImage` (kept for future server-side render route).
void renderCardImage
