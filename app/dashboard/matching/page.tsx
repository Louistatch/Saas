'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Handshake, Plus, CheckCircle, XCircle, Users, Zap } from 'lucide-react'
import { useCooperative } from '@/app/context/cooperative-context'
import { useToast } from '@/hooks/use-toast'

// ── Types ──────────────────────────────────────────────────────────────────

interface BuyerRequestRow {
  id: string
  buyer_name: string
  buyer_phone: string | null
  buyer_email: string | null
  culture: string
  quantity_kg_needed: number
  max_price_per_kg_fcfa: number | null
  quality_grade_min: string | null
  location_prefecture: string | null
  needed_by: string | null
  status: 'open' | 'matched' | 'fulfilled' | 'cancelled'
  notes: string | null
  created_at: string
  match_count: number
}

interface MatchListing {
  id: string
  culture: string
  quantity_kg: number
  price_per_kg_fcfa: number
  quality_grade: string
  location_prefecture: string | null
  location_canton: string | null
  cooperatives: { name: string } | null
}

interface BuyerMatchRow {
  id: string
  match_score: number
  match_reason: string | null
  status: 'proposed' | 'accepted' | 'rejected' | 'completed'
  created_at: string
  listing_id: string
  market_listings: MatchListing | null
}

// ── Constants ──────────────────────────────────────────────────────────────

const CULTURES = [
  'Maïs', 'Riz', 'Manioc', 'Igname', 'Sorgho', 'Mil', 'Arachide', 'Soja',
  'Niébé', 'Coton', 'Café', 'Cacao', 'Palmier à huile', 'Hévéa', 'Ananas',
  'Banane', 'Plantain', 'Mangue', 'Tomate', 'Oignon', 'Piment', 'Gombo',
  'Aubergine', 'Pastèque', 'Concombre', 'Haricot vert', 'Autre',
]

const PREFECTURES = ['Maritime', 'Plateaux', 'Centrale', 'Kara', 'Savanes']

const REQUEST_STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  open:      { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Ouverte' },
  matched:   { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Matchée' },
  fulfilled: { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Complétée' },
  cancelled: { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Annulée' },
}

const MATCH_STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  proposed:  { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Proposé' },
  accepted:  { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Accepté' },
  rejected:  { bg: 'bg-red-100',    text: 'text-red-800',    label: 'Rejeté' },
  completed: { bg: 'bg-emerald-100',text: 'text-emerald-800',label: 'Complété' },
}

const formatNum = (n: number) => new Intl.NumberFormat('fr-FR').format(n)

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-orange-500'
  return 'bg-red-500'
}

// ── Form state ─────────────────────────────────────────────────────────────

interface FormState {
  buyer_name: string
  buyer_phone: string
  culture: string
  quantity_kg_needed: string
  max_price_per_kg_fcfa: string
  quality_grade_min: string
  location_prefecture: string
  needed_by: string
  notes: string
}

const emptyForm = (): FormState => ({
  buyer_name: '',
  buyer_phone: '',
  culture: '',
  quantity_kg_needed: '',
  max_price_per_kg_fcfa: '',
  quality_grade_min: '',
  location_prefecture: '',
  needed_by: '',
  notes: '',
})

// ── Page ───────────────────────────────────────────────────────────────────

export default function MatchingPage() {
  const { currentCooperative } = useCooperative()
  const { toast } = useToast()

  const [requests, setRequests] = useState<BuyerRequestRow[]>([])
  const [selectedRequest, setSelectedRequest] = useState<BuyerRequestRow | null>(null)
  const [matches, setMatches] = useState<BuyerMatchRow[]>([])
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())

  // Stats derived from requests
  const statsOpen = requests.filter((r) => r.status === 'open').length
  const statsMatched = requests.reduce((sum, r) => sum + r.match_count, 0)
  const statsCompleted = requests.filter((r) => r.status === 'fulfilled').length

  // Load requests
  const loadRequests = useCallback(async () => {
    setLoadingRequests(true)
    try {
      const res = await fetch('/api/matching/requests')
      const json = await res.json() as { requests?: BuyerRequestRow[] }
      setRequests(json.requests ?? [])
    } catch {
      toast({ title: 'Erreur chargement des demandes', variant: 'destructive' })
    } finally {
      setLoadingRequests(false)
    }
  }, [toast])

  // Load matches for selected request
  const loadMatches = useCallback(async (requestId: string) => {
    setLoadingMatches(true)
    try {
      const res = await fetch(`/api/matching/requests/${requestId}`)
      const json = await res.json() as { matches?: BuyerMatchRow[] }
      setMatches(json.matches ?? [])
    } catch {
      toast({ title: 'Erreur chargement des matches', variant: 'destructive' })
    } finally {
      setLoadingMatches(false)
    }
  }, [toast])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  const handleSelectRequest = useCallback(
    (req: BuyerRequestRow) => {
      setSelectedRequest(req)
      void loadMatches(req.id)
    },
    [loadMatches],
  )

  const handleMatchAction = useCallback(
    async (matchId: string, status: 'accepted' | 'rejected' | 'completed') => {
      try {
        const res = await fetch(`/api/matching/matches/${matchId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        })
        if (!res.ok) throw new Error('Échec')
        setMatches((prev) =>
          prev.map((m) => (m.id === matchId ? { ...m, status } : m)),
        )
        toast({ title: 'Statut mis à jour' })
      } catch {
        toast({ title: 'Erreur mise à jour', variant: 'destructive' })
      }
    },
    [toast],
  )

  const handleSubmit = useCallback(async () => {
    if (!form.buyer_name || !form.culture || !form.quantity_kg_needed) {
      toast({ title: 'Nom, culture et quantité sont obligatoires', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/matching/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_name: form.buyer_name,
          buyer_phone: form.buyer_phone || null,
          culture: form.culture,
          quantity_kg_needed: Number(form.quantity_kg_needed),
          max_price_per_kg_fcfa: form.max_price_per_kg_fcfa ? Number(form.max_price_per_kg_fcfa) : null,
          quality_grade_min: form.quality_grade_min || null,
          location_prefecture: form.location_prefecture || null,
          needed_by: form.needed_by || null,
          notes: form.notes || null,
          cooperative_id: currentCooperative?.id ?? null,
        }),
      })

      const json = await res.json() as { matches_found?: number; error?: string }

      if (!res.ok) {
        toast({ title: json.error ?? 'Erreur création', variant: 'destructive' })
        return
      }

      toast({
        title: `Demande créée — ${json.matches_found ?? 0} match(s) trouvé(s)`,
      })
      setShowDialog(false)
      setForm(emptyForm())
      void loadRequests()
    } catch {
      toast({ title: 'Erreur serveur', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }, [form, currentCooperative, toast, loadRequests])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Handshake className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Matching Acheteurs 🤝</h1>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle demande
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Demandes ouvertes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{statsOpen}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Matches proposés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{statsMatched}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Transactions complétées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{statsCompleted}</p>
          </CardContent>
        </Card>
      </div>

      {/* Two panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1 — Buyer requests */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Demandes Acheteurs</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto max-h-[60vh] space-y-2 pr-2">
            {loadingRequests ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Chargement…</p>
            ) : requests.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Aucune demande pour l&apos;instant.
              </p>
            ) : (
              requests.map((req) => {
                const sc = REQUEST_STATUS_CONFIG[req.status] ?? REQUEST_STATUS_CONFIG['open']
                const isSelected = selectedRequest?.id === req.id
                return (
                  <button
                    key={req.id}
                    onClick={() => handleSelectRequest(req)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">
                          {req.buyer_name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {req.culture} — {formatNum(req.quantity_kg_needed)} kg
                          {req.max_price_per_kg_fcfa != null
                            ? ` · max ${formatNum(req.max_price_per_kg_fcfa)} FCFA/kg`
                            : ''}
                        </p>
                        {req.location_prefecture && (
                          <p className="text-xs text-muted-foreground">{req.location_prefecture}</p>
                        )}
                        {req.needed_by && (
                          <p className="text-xs text-muted-foreground">
                            Avant le {new Date(req.needed_by).toLocaleDateString('fr-FR')}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}
                        >
                          {sc.label}
                        </span>
                        {req.match_count > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {req.match_count} match
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Panel 2 — Matches */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              {selectedRequest
                ? `Matches — ${selectedRequest.buyer_name}`
                : 'Matches pour la demande'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto max-h-[60vh] space-y-3 pr-2">
            {!selectedRequest ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Handshake className="h-10 w-10 opacity-30" />
                <p className="text-sm">Sélectionnez une demande</p>
              </div>
            ) : loadingMatches ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Chargement…</p>
            ) : matches.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Aucun match trouvé pour cette demande.
              </p>
            ) : (
              matches.map((m) => {
                const listing = m.market_listings
                const sc = MATCH_STATUS_CONFIG[m.status] ?? MATCH_STATUS_CONFIG['proposed']
                const reasons = m.match_reason ? m.match_reason.split(', ') : []
                return (
                  <div key={m.id} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground">
                          {listing?.cooperatives?.name ?? 'Coopérative inconnue'}
                        </p>
                        {listing && (
                          <p className="text-xs text-muted-foreground">
                            {listing.culture} · {formatNum(listing.quantity_kg)} kg ·{' '}
                            {formatNum(listing.price_per_kg_fcfa)} FCFA/kg · {listing.quality_grade}
                            {listing.location_prefecture ? ` · ${listing.location_prefecture}` : ''}
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${sc.bg} ${sc.text}`}
                      >
                        {sc.label}
                      </span>
                    </div>

                    {/* Score bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Score</span>
                        <span className="font-semibold">{m.match_score}/100</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${scoreColor(m.match_score)}`}
                          style={{ width: `${m.match_score}%` }}
                        />
                      </div>
                    </div>

                    {/* Reason tags */}
                    {reasons.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {reasons.map((r) => (
                          <span
                            key={r}
                            className="px-2 py-0.5 bg-muted rounded-full text-xs text-muted-foreground"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Action buttons */}
                    {m.status === 'proposed' && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => void handleMatchAction(m.id, 'accepted')}
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          Accepter
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 text-red-700 border-red-300 hover:bg-red-50"
                          onClick={() => void handleMatchAction(m.id, 'rejected')}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Rejeter
                        </Button>
                      </div>
                    )}
                    {m.status === 'accepted' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                        onClick={() => void handleMatchAction(m.id, 'completed')}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Marquer complété
                      </Button>
                    )}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* New request dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle demande acheteur</DialogTitle>
            <DialogDescription>
              Renseignez les besoins de l&apos;acheteur. Le système trouvera automatiquement les
              meilleures offres disponibles.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="buyer_name">Nom acheteur *</Label>
                <Input
                  id="buyer_name"
                  value={form.buyer_name}
                  onChange={(e) => setForm((f) => ({ ...f, buyer_name: e.target.value }))}
                  placeholder="Jean Koffi"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="buyer_phone">Téléphone</Label>
                <Input
                  id="buyer_phone"
                  value={form.buyer_phone}
                  onChange={(e) => setForm((f) => ({ ...f, buyer_phone: e.target.value }))}
                  placeholder="+228 90 00 00 00"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="culture">Culture *</Label>
              <Select
                value={form.culture}
                onValueChange={(v) => setForm((f) => ({ ...f, culture: v }))}
              >
                <SelectTrigger id="culture">
                  <SelectValue placeholder="Choisir une culture" />
                </SelectTrigger>
                <SelectContent>
                  {CULTURES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="quantity_kg_needed">Quantité (kg) *</Label>
                <Input
                  id="quantity_kg_needed"
                  type="number"
                  min="1"
                  value={form.quantity_kg_needed}
                  onChange={(e) => setForm((f) => ({ ...f, quantity_kg_needed: e.target.value }))}
                  placeholder="500"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max_price">Prix max (FCFA/kg)</Label>
                <Input
                  id="max_price"
                  type="number"
                  min="0"
                  value={form.max_price_per_kg_fcfa}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, max_price_per_kg_fcfa: e.target.value }))
                  }
                  placeholder="Optionnel"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="quality_grade_min">Qualité minimale</Label>
                <Select
                  value={form.quality_grade_min}
                  onValueChange={(v) => setForm((f) => ({ ...f, quality_grade_min: v }))}
                >
                  <SelectTrigger id="quality_grade_min">
                    <SelectValue placeholder="Toute qualité" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A — Premium</SelectItem>
                    <SelectItem value="B">B — Standard</SelectItem>
                    <SelectItem value="C">C — Économique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location_prefecture">Préfecture</Label>
                <Select
                  value={form.location_prefecture}
                  onValueChange={(v) => setForm((f) => ({ ...f, location_prefecture: v }))}
                >
                  <SelectTrigger id="location_prefecture">
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    {PREFECTURES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="needed_by">Date limite</Label>
              <Input
                id="needed_by"
                type="date"
                value={form.needed_by}
                onChange={(e) => setForm((f) => ({ ...f, needed_by: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Informations complémentaires…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? 'Création…' : 'Créer la demande'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
