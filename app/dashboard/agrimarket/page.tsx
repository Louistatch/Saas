'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sprout,
  ShoppingBag,
  TrendingUp,
  MapPin,
  Eye,
  Phone,
  Plus,
  Trash2,
  CheckCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useAuth } from '@/app/context/auth-context'
import { useToast } from '@/hooks/use-toast'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { errorMessage } from '@/lib/utils/errors'

// ── Types ──────────────────────────────────────────────────────────────────

interface MarketListing {
  id: string
  culture: string
  quantity_kg: number
  price_per_kg_fcfa: number
  quality_grade: 'A' | 'B' | 'C'
  harvest_date_estimated: string | null
  location_canton: string | null
  location_prefecture: string | null
  description: string | null
  status: 'active' | 'sold' | 'expired' | 'cancelled'
  views_count: number
  contact_count: number
  expires_at: string
  created_at: string
  member_id: string
  cooperative_id: string
  cooperatives: { name: string } | null
}

// ── Constants ──────────────────────────────────────────────────────────────

const CULTURES = [
  'Maïs', 'Riz', 'Manioc', 'Igname', 'Sorgho', 'Mil', 'Arachide', 'Soja',
  'Niébé', 'Coton', 'Café', 'Cacao', 'Palmier à huile', 'Hévéa', 'Ananas',
  'Banane', 'Plantain', 'Mangue', 'Tomate', 'Oignon', 'Piment', 'Gombo',
  'Aubergine', 'Pastèque', 'Concombre', 'Haricot vert', 'Autre',
]

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  active:    { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Actif' },
  sold:      { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Vendu' },
  expired:   { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Expiré' },
  cancelled: { bg: 'bg-red-100',    text: 'text-red-800',    label: 'Annulé' },
}

const QUALITY_LABELS: Record<string, string> = {
  A: 'A - Premium',
  B: 'B - Standard',
  C: 'C - Économique',
}

const PREFECTURES = [
  'Maritime', 'Plateaux', 'Centrale', 'Kara', 'Savanes',
]

const formatNum = (n: number) => new Intl.NumberFormat('fr-FR').format(n)

// ── Component ──────────────────────────────────────────────────────────────

export default function AgriMarketPage() {
  const { currentCooperative } = useCooperative()
  const { user } = useAuth()
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])

  // Tab
  const [tab, setTab] = useState<'mes' | 'regional'>('mes')

  // My listings
  const [myListings, setMyListings] = useState<MarketListing[]>([])
  const [myLoading, setMyLoading] = useState(true)

  // Regional listings
  const [regionalListings, setRegionalListings] = useState<MarketListing[]>([])
  const [regionalLoading, setRegionalLoading] = useState(true)
  const [filterCulture, setFilterCulture] = useState('')
  const [filterPrefecture, setFilterPrefecture] = useState('')

  // Stats
  const [stats, setStats] = useState({
    activeCount: 0,
    totalKg: 0,
    totalValue: 0,
    totalContacts: 0,
  })

  // Dialog: new listing
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    culture: '',
    quantity_kg: '',
    price_per_kg_fcfa: '',
    quality_grade: 'B',
    harvest_date_estimated: '',
    location_canton: '',
    description: '',
  })

  // Dialog: contact
  const [contactListing, setContactListing] = useState<MarketListing | null>(null)

  // ── Fetch my listings ──────────────────────────────────────────────────

  const fetchMyListings = useCallback(async () => {
    if (!currentCooperative) { setMyLoading(false); return }
    setMyLoading(true)
    const { data, error } = await supabase
      .from('market_listings')
      .select('*, cooperatives(name)')
      .eq('cooperative_id', currentCooperative.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      toast({ title: 'Erreur', description: errorMessage(error), variant: 'destructive' })
    } else {
      const rows = (data ?? []) as MarketListing[]
      setMyListings(rows)
      // Compute stats from own listings
      const active = rows.filter(r => r.status === 'active')
      setStats({
        activeCount: active.length,
        totalKg: active.reduce((s, r) => s + Number(r.quantity_kg), 0),
        totalValue: active.reduce((s, r) => s + Number(r.quantity_kg) * Number(r.price_per_kg_fcfa), 0),
        totalContacts: rows.reduce((s, r) => s + (r.contact_count ?? 0), 0),
      })
    }
    setMyLoading(false)
  }, [currentCooperative, supabase, toast])

  // ── Fetch regional listings ────────────────────────────────────────────

  const fetchRegional = useCallback(async () => {
    setRegionalLoading(true)
    let query = supabase
      .from('market_listings')
      .select('*, cooperatives(name)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(50)
    if (filterCulture) query = query.eq('culture', filterCulture)
    if (filterPrefecture) query = query.eq('location_prefecture', filterPrefecture)
    const { data, error } = await query
    if (!error) setRegionalListings((data ?? []) as MarketListing[])
    setRegionalLoading(false)
  }, [supabase, filterCulture, filterPrefecture])

  useEffect(() => { fetchMyListings() }, [fetchMyListings])
  useEffect(() => { fetchRegional() }, [fetchRegional])

  // ── Create listing ─────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.culture || !form.quantity_kg || !form.price_per_kg_fcfa) {
      toast({ title: 'Culture, quantité et prix sont obligatoires', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/agrimarket/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          culture: form.culture,
          quantity_kg: parseFloat(form.quantity_kg),
          price_per_kg_fcfa: parseFloat(form.price_per_kg_fcfa),
          quality_grade: form.quality_grade,
          harvest_date_estimated: form.harvest_date_estimated || null,
          location_canton: form.location_canton || null,
          description: form.description || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erreur')
      toast({ title: 'Annonce créée avec succès' })
      setShowAdd(false)
      setForm({ culture: '', quantity_kg: '', price_per_kg_fcfa: '', quality_grade: 'B', harvest_date_estimated: '', location_canton: '', description: '' })
      fetchMyListings()
    } catch (err) {
      toast({ title: 'Erreur', description: errorMessage(err), variant: 'destructive' })
    }
    setSaving(false)
  }

  // ── Mark as sold ───────────────────────────────────────────────────────

  const handleMarkSold = async (id: string) => {
    const res = await fetch(`/api/agrimarket/listings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'sold' }),
    })
    if (res.ok) {
      toast({ title: 'Annonce marquée comme vendue' })
      fetchMyListings()
    } else {
      toast({ title: 'Erreur', variant: 'destructive' })
    }
  }

  // ── Delete listing ─────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/agrimarket/listings/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast({ title: 'Annonce supprimée' })
      fetchMyListings()
    } else {
      toast({ title: 'Erreur lors de la suppression', variant: 'destructive' })
    }
  }

  // ── Increment contact count (fire-and-forget) ──────────────────────────

  const handleContact = (listing: MarketListing) => {
    // Increment contact_count silently
    supabase
      .from('market_listings')
      .update({ contact_count: (listing.contact_count ?? 0) + 1 })
      .eq('id', listing.id)
      .then(() => {})
    setContactListing(listing)
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <PageHeader
        title="AgriMarket"
        description="Marché agricole — publiez vos récoltes et explorez les offres régionales"
        action={
          <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle annonce
          </Button>
        }
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-green-50"><ShoppingBag className="h-4 w-4 text-green-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Annonces actives</p>
                <p className="text-lg font-bold text-foreground">{stats.activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-blue-50"><Sprout className="h-4 w-4 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Volume total</p>
                <p className="text-lg font-bold text-foreground">{formatNum(stats.totalKg)} kg</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-yellow-50"><TrendingUp className="h-4 w-4 text-yellow-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Valeur estimée</p>
                <p className="text-lg font-bold text-foreground">{formatNum(stats.totalValue)} FCFA</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-purple-50"><Phone className="h-4 w-4 text-purple-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Contacts reçus</p>
                <p className="text-lg font-bold text-foreground">{stats.totalContacts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tab toggle ── */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab('mes')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'mes'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Mes annonces
        </button>
        <button
          onClick={() => setTab('regional')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'regional'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Marché régional
        </button>
      </div>

      {/* ── Tab: Mes annonces ── */}
      {tab === 'mes' && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Mes annonces</CardTitle>
          </CardHeader>
          <CardContent>
            {myLoading ? (
              <LoadingBlock />
            ) : myListings.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="Aucune annonce"
                description="Publiez vos récoltes pour les vendre aux acheteurs régionaux"
                action={
                  <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setShowAdd(true)}>
                    <Plus className="h-4 w-4" /> Première annonce
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-left">
                      <th className="py-2 pr-4 font-medium">Culture</th>
                      <th className="py-2 pr-4 font-medium">Quantité</th>
                      <th className="py-2 pr-4 font-medium">Prix/kg</th>
                      <th className="py-2 pr-4 font-medium">Qualité</th>
                      <th className="py-2 pr-4 font-medium">Statut</th>
                      <th className="py-2 pr-4 font-medium">Récolte</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myListings.map((l) => {
                      const st = STATUS_CONFIG[l.status] ?? STATUS_CONFIG.active
                      return (
                        <tr key={l.id} className="border-b border-border last:border-0 hover:bg-accent/5">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-1.5">
                              <Sprout className="h-3.5 w-3.5 text-green-600" />
                              <span className="font-medium text-foreground">{l.culture}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-foreground">{formatNum(l.quantity_kg)} kg</td>
                          <td className="py-3 pr-4 text-foreground">{formatNum(l.price_per_kg_fcfa)} FCFA</td>
                          <td className="py-3 pr-4 text-foreground">{l.quality_grade}</td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {l.harvest_date_estimated ?? '—'}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              {l.status === 'active' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 border-green-300 text-green-700 hover:bg-green-50 h-7 px-2 text-xs"
                                  onClick={() => handleMarkSold(l.id)}
                                >
                                  <CheckCircle className="h-3 w-3" /> Vendu
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 border-red-200 text-red-600 hover:bg-red-50 h-7 px-2 text-xs"
                                onClick={() => handleDelete(l.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Marché régional ── */}
      {tab === 'regional' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3">
            <select
              className="border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm min-w-[180px]"
              value={filterCulture}
              onChange={(e) => setFilterCulture(e.target.value)}
            >
              <option value="">Toutes les cultures</option>
              {CULTURES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm min-w-[180px]"
              value={filterPrefecture}
              onChange={(e) => setFilterPrefecture(e.target.value)}
            >
              <option value="">Toutes les régions</option>
              {PREFECTURES.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {regionalLoading ? (
            <LoadingBlock />
          ) : regionalListings.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="Aucune offre disponible"
              description="Il n'y a pas encore d'annonces actives correspondant à vos filtres"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {regionalListings.map((l) => (
                <Card key={l.id} className="border-border hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-green-50">
                            <Sprout className="h-4 w-4 text-green-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{l.culture}</p>
                            <p className="text-xs text-muted-foreground">Qualité {l.quality_grade}</p>
                          </div>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                          Actif
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">Quantité</p>
                          <p className="font-medium text-foreground">{formatNum(l.quantity_kg)} kg</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Prix/kg</p>
                          <p className="font-medium text-foreground">{formatNum(l.price_per_kg_fcfa)} FCFA</p>
                        </div>
                      </div>

                      {(l.location_canton || l.location_prefecture) && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>{[l.location_canton, l.location_prefecture].filter(Boolean).join(', ')}</span>
                        </div>
                      )}

                      {l.cooperatives?.name && (
                        <p className="text-xs text-muted-foreground">
                          Coopérative : <span className="font-medium text-foreground">{l.cooperatives.name}</span>
                        </p>
                      )}

                      {l.harvest_date_estimated && (
                        <p className="text-xs text-muted-foreground">
                          Récolte estimée : {l.harvest_date_estimated}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" /> {l.views_count}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {l.contact_count}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          className="gap-1 bg-primary hover:bg-primary/90 h-7 px-3 text-xs"
                          onClick={() => handleContact(l)}
                        >
                          <Phone className="h-3 w-3" /> Contacter
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Dialog: Nouvelle annonce ── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle annonce</DialogTitle>
            <DialogDescription>Publiez votre récolte sur le marché agricole régional</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Culture <span className="text-destructive">*</span></Label>
              <select
                className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                value={form.culture}
                onChange={(e) => setForm(f => ({ ...f, culture: e.target.value }))}
              >
                <option value="">— Choisir une culture —</option>
                {CULTURES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantité (kg) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min="1"
                  value={form.quantity_kg}
                  onChange={(e) => setForm(f => ({ ...f, quantity_kg: e.target.value }))}
                  placeholder="ex: 500"
                />
              </div>
              <div className="space-y-2">
                <Label>Prix par kg (FCFA) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min="1"
                  value={form.price_per_kg_fcfa}
                  onChange={(e) => setForm(f => ({ ...f, price_per_kg_fcfa: e.target.value }))}
                  placeholder="ex: 250"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Qualité</Label>
                <select
                  className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                  value={form.quality_grade}
                  onChange={(e) => setForm(f => ({ ...f, quality_grade: e.target.value }))}
                >
                  {Object.entries(QUALITY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Date récolte estimée</Label>
                <Input
                  type="date"
                  value={form.harvest_date_estimated}
                  onChange={(e) => setForm(f => ({ ...f, harvest_date_estimated: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Canton / Localité</Label>
              <Input
                value={form.location_canton}
                onChange={(e) => setForm(f => ({ ...f, location_canton: e.target.value }))}
                placeholder="ex: Tsévié"
              />
            </div>

            <div className="space-y-2">
              <Label>Description (optionnel)</Label>
              <textarea
                className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm resize-none"
                rows={3}
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Informations supplémentaires sur la récolte…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={saving}>
              Annuler
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90 gap-2"
              onClick={handleCreate}
              disabled={saving || !form.culture || !form.quantity_kg || !form.price_per_kg_fcfa}
            >
              {saving ? <Spinner className="h-4 w-4" /> : <Sprout className="h-4 w-4" />}
              Publier l'annonce
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Contacter ── */}
      <Dialog open={!!contactListing} onOpenChange={(o) => { if (!o) setContactListing(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Contacter le producteur</DialogTitle>
            <DialogDescription>
              {contactListing && (
                <>
                  Contactez la coopérative{' '}
                  <strong>{contactListing.cooperatives?.name ?? 'inconnue'}</strong>{' '}
                  pour obtenir les coordonnées du producteur.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {contactListing && (
            <div className="space-y-2 py-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Produit :</span>{' '}
                {contactListing.culture} — {formatNum(contactListing.quantity_kg)} kg
              </p>
              <p>
                <span className="font-medium text-foreground">Prix :</span>{' '}
                {formatNum(contactListing.price_per_kg_fcfa)} FCFA/kg
              </p>
              {contactListing.location_canton && (
                <p>
                  <span className="font-medium text-foreground">Localité :</span>{' '}
                  {contactListing.location_canton}
                </p>
              )}
              <div className="mt-4 p-3 bg-blue-50 rounded-lg text-blue-800 text-xs">
                Pour des raisons de confidentialité, les coordonnées du producteur ne sont pas
                affichées ici. Rapprochez-vous directement de la coopérative indiquée.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactListing(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
