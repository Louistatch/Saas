'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/app/context/auth-context'
import { useCooperative } from '@/app/context/cooperative-context'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Parcelle {
  id: string
  culture_name: string
}

interface Campagne {
  id: string
  cooperative_id: string
  name: string
  culture: string
  start_date: string | null
  end_date: string | null
  target_yield_kg: number | null
  status: 'planned' | 'active' | 'closed'
  created_at: string
}

interface JournalEntry {
  id: string
  member_id: string
  cooperative_id: string
  campagne_id: string | null
  parcelle_id: string | null
  entry_date: string
  type: string
  title: string
  body: string | null
  quantity: number | null
  unit: string | null
  cost_fcfa: number | null
  photo_url: string | null
  created_at: string
  parcelle: { id: string; culture_name: string } | null
  campagne: { id: string; name: string } | null
}

interface Intrant {
  id: string
  cooperative_id: string
  member_id: string
  campagne_id: string | null
  name: string
  type: string
  quantity: number
  unit: string
  cost_fcfa: number | null
  purchase_date: string | null
  supplier: string | null
  created_at: string
}

interface MemberOption {
  id: string
  first_name: string
  last_name: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JOURNAL_TYPES = [
  'travaux',
  'intrant',
  'météo',
  'observation',
  'récolte',
  'vente',
  'autre',
] as const

type JournalType = (typeof JOURNAL_TYPES)[number]

const TYPE_BADGE_CLASS: Record<JournalType, string> = {
  travaux: 'bg-blue-100 text-blue-800',
  intrant: 'bg-orange-100 text-orange-800',
  météo: 'bg-cyan-100 text-cyan-800',
  observation: 'bg-gray-100 text-gray-800',
  récolte: 'bg-green-100 text-green-800',
  vente: 'bg-emerald-100 text-emerald-800',
  autre: 'bg-slate-100 text-slate-800',
}

const INTRANT_TYPES = ['semence', 'engrais', 'pesticide', 'outil', 'autre'] as const

const CAMPAGNE_STATUSES = ['planned', 'active', 'closed'] as const

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planifiée',
  active: 'Active',
  closed: 'Clôturée',
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  planned: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('fr-FR')
}

function formatFCFA(amount: number | null): string {
  if (amount == null) return '—'
  return amount.toLocaleString('fr-FR') + ' FCFA'
}

function isJournalType(value: string): value is JournalType {
  return (JOURNAL_TYPES as readonly string[]).includes(value)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const cls = isJournalType(type) ? TYPE_BADGE_CLASS[type] : 'bg-slate-100 text-slate-800'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {type}
    </span>
  )
}

function IntrantTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    semence: 'bg-lime-100 text-lime-800',
    engrais: 'bg-amber-100 text-amber-800',
    pesticide: 'bg-red-100 text-red-800',
    outil: 'bg-indigo-100 text-indigo-800',
    autre: 'bg-slate-100 text-slate-800',
  }
  const cls = colors[type] ?? 'bg-slate-100 text-slate-800'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {type}
    </span>
  )
}

// ─── Journal Tab ──────────────────────────────────────────────────────────────

interface JournalTabProps {
  cooperativeId: string
  memberId: string | null
  members: MemberOption[]
  campagnes: Campagne[]
  parcelles: Parcelle[]
  isAdmin: boolean
}

function JournalTab({
  cooperativeId,
  memberId,
  members,
  campagnes,
  parcelles,
  isAdmin,
}: JournalTabProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [filterType, setFilterType] = useState<string>('all')
  const [open, setOpen] = useState(false)

  const [form, setForm] = useState({
    member_id: memberId ?? '',
    entry_date: new Date().toISOString().slice(0, 10),
    type: 'travaux',
    title: '',
    body: '',
    parcelle_id: '',
    campagne_id: '',
    quantity: '',
    unit: '',
    cost_fcfa: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ cooperative_id: cooperativeId })
      if (memberId) params.set('member_id', memberId)
      if (filterType !== 'all') params.set('type', filterType)
      const res = await fetch(`/api/carnet/journal?${params.toString()}`)
      if (res.ok) {
        const json = (await res.json()) as { entries: JournalEntry[] }
        setEntries(json.entries)
      }
    } finally {
      setLoading(false)
    }
  }, [cooperativeId, memberId, filterType])

  useEffect(() => {
    void fetchEntries()
  }, [fetchEntries])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/carnet/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: form.member_id,
          cooperative_id: cooperativeId,
          campagne_id: form.campagne_id || undefined,
          parcelle_id: form.parcelle_id || undefined,
          entry_date: form.entry_date,
          type: form.type,
          title: form.title,
          body: form.body || undefined,
          quantity: form.quantity ? parseFloat(form.quantity) : undefined,
          unit: form.unit || undefined,
          cost_fcfa: form.cost_fcfa ? parseFloat(form.cost_fcfa) : undefined,
        }),
      })
      if (res.ok) {
        setOpen(false)
        setForm((prev) => ({ ...prev, title: '', body: '', quantity: '', unit: '', cost_fcfa: '' }))
        void fetchEntries()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrer par type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {JOURNAL_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Nouvelle entrée</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouvelle entrée de journal</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
              {isAdmin && (
                <div className="space-y-1">
                  <Label>Membre</Label>
                  <Select
                    value={form.member_id}
                    onValueChange={(v) => setForm((p) => ({ ...p, member_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un membre" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.first_name} {m.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.entry_date}
                    onChange={(e) => setForm((p) => ({ ...p, entry_date: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JOURNAL_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Titre</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea
                  value={form.body}
                  onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Parcelle</Label>
                  <Select
                    value={form.parcelle_id}
                    onValueChange={(v) => setForm((p) => ({ ...p, parcelle_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Aucune</SelectItem>
                      {parcelles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.culture_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Campagne</Label>
                  <Select
                    value={form.campagne_id}
                    onValueChange={(v) => setForm((p) => ({ ...p, campagne_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Aucune</SelectItem>
                      {campagnes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1 col-span-1">
                  <Label>Quantité</Label>
                  <Input
                    type="number"
                    value={form.quantity}
                    onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 col-span-1">
                  <Label>Unité</Label>
                  <Input
                    value={form.unit}
                    onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                    placeholder="kg, L, sacs…"
                  />
                </div>
                <div className="space-y-1 col-span-1">
                  <Label>Coût (FCFA)</Label>
                  <Input
                    type="number"
                    value={form.cost_fcfa}
                    onChange={(e) => setForm((p) => ({ ...p, cost_fcfa: e.target.value }))}
                  />
                </div>
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune entrée pour le moment.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Titre</TableHead>
                <TableHead>Parcelle</TableHead>
                <TableHead>Quantité</TableHead>
                <TableHead>Coût</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(entry.entry_date)}</TableCell>
                  <TableCell><TypeBadge type={entry.type} /></TableCell>
                  <TableCell>{entry.title}</TableCell>
                  <TableCell>{entry.parcelle?.culture_name ?? '—'}</TableCell>
                  <TableCell>
                    {entry.quantity != null ? `${entry.quantity} ${entry.unit ?? ''}` : '—'}
                  </TableCell>
                  <TableCell>{formatFCFA(entry.cost_fcfa)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ─── Campagnes Tab ────────────────────────────────────────────────────────────

interface CampagnesTabProps {
  cooperativeId: string
  campagnes: Campagne[]
  onRefresh: () => Promise<void>
}

function CampagnesTab({ cooperativeId, campagnes, onRefresh }: CampagnesTabProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    culture: '',
    start_date: '',
    end_date: '',
    target_yield_kg: '',
    status: 'active',
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/carnet/campagnes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cooperative_id: cooperativeId,
          name: form.name,
          culture: form.culture,
          start_date: form.start_date || undefined,
          end_date: form.end_date || undefined,
          target_yield_kg: form.target_yield_kg ? parseFloat(form.target_yield_kg) : undefined,
          status: form.status,
        }),
      })
      if (res.ok) {
        setOpen(false)
        setForm({ name: '', culture: '', start_date: '', end_date: '', target_yield_kg: '', status: 'active' })
        void onRefresh()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Créer campagne</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nouvelle campagne agricole</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
              <div className="space-y-1">
                <Label>Nom de la campagne</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Culture</Label>
                <Input
                  value={form.culture}
                  onChange={(e) => setForm((p) => ({ ...p, culture: e.target.value }))}
                  required
                  placeholder="Maïs, Soja, Coton…"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Date début</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Date fin</Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Rendement cible (kg)</Label>
                <Input
                  type="number"
                  value={form.target_yield_kg}
                  onChange={(e) => setForm((p) => ({ ...p, target_yield_kg: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Statut</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAGNE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Création…' : 'Créer'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {campagnes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune campagne pour le moment.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campagnes.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[c.status] ?? 'bg-gray-100 text-gray-800'}`}
                  >
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-1 text-muted-foreground">
                <p><span className="font-medium text-foreground">Culture :</span> {c.culture}</p>
                {c.start_date && (
                  <p><span className="font-medium text-foreground">Début :</span> {formatDate(c.start_date)}</p>
                )}
                {c.end_date && (
                  <p><span className="font-medium text-foreground">Fin :</span> {formatDate(c.end_date)}</p>
                )}
                {c.target_yield_kg != null && (
                  <p>
                    <span className="font-medium text-foreground">Rendement cible :</span>{' '}
                    {c.target_yield_kg.toLocaleString('fr-FR')} kg
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Intrants Tab ─────────────────────────────────────────────────────────────

interface IntrantsTabProps {
  cooperativeId: string
  memberId: string | null
  members: MemberOption[]
  campagnes: Campagne[]
  isAdmin: boolean
}

function IntrantsTab({ cooperativeId, memberId, members, campagnes, isAdmin }: IntrantsTabProps) {
  const [intrants, setIntrants] = useState<Intrant[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    member_id: memberId ?? '',
    campagne_id: '',
    name: '',
    type: 'semence',
    quantity: '',
    unit: '',
    cost_fcfa: '',
    purchase_date: new Date().toISOString().slice(0, 10),
    supplier: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const fetchIntrants = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ cooperative_id: cooperativeId })
      if (memberId) params.set('member_id', memberId)
      const res = await fetch(`/api/carnet/intrants?${params.toString()}`)
      if (res.ok) {
        const json = (await res.json()) as { intrants: Intrant[] }
        setIntrants(json.intrants)
      }
    } finally {
      setLoading(false)
    }
  }, [cooperativeId, memberId])

  useEffect(() => {
    void fetchIntrants()
  }, [fetchIntrants])

  const totalCost = intrants.reduce((sum, i) => sum + (i.cost_fcfa ?? 0), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/carnet/intrants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cooperative_id: cooperativeId,
          member_id: form.member_id,
          campagne_id: form.campagne_id || undefined,
          name: form.name,
          type: form.type,
          quantity: parseFloat(form.quantity),
          unit: form.unit,
          cost_fcfa: form.cost_fcfa ? parseFloat(form.cost_fcfa) : undefined,
          purchase_date: form.purchase_date || undefined,
          supplier: form.supplier || undefined,
        }),
      })
      if (res.ok) {
        setOpen(false)
        setForm((prev) => ({ ...prev, name: '', quantity: '', unit: '', cost_fcfa: '', supplier: '' }))
        void fetchIntrants()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Ajouter intrant</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nouvel intrant</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
              {isAdmin && (
                <div className="space-y-1">
                  <Label>Membre</Label>
                  <Select
                    value={form.member_id}
                    onValueChange={(v) => setForm((p) => ({ ...p, member_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un membre" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.first_name} {m.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label>Nom de l'intrant</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  required
                  placeholder="NPK 15-15-15, Semences maïs…"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTRANT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Campagne</Label>
                  <Select
                    value={form.campagne_id}
                    onValueChange={(v) => setForm((p) => ({ ...p, campagne_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Aucune</SelectItem>
                      {campagnes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Quantité</Label>
                  <Input
                    type="number"
                    value={form.quantity}
                    onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Unité</Label>
                  <Input
                    value={form.unit}
                    onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                    required
                    placeholder="kg, L, sacs…"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Coût (FCFA)</Label>
                  <Input
                    type="number"
                    value={form.cost_fcfa}
                    onChange={(e) => setForm((p) => ({ ...p, cost_fcfa: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Date d'achat</Label>
                  <Input
                    type="date"
                    value={form.purchase_date}
                    onChange={(e) => setForm((p) => ({ ...p, purchase_date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Fournisseur</Label>
                <Input
                  value={form.supplier}
                  onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))}
                  placeholder="Nom du fournisseur"
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : intrants.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun intrant enregistré.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Quantité</TableHead>
                <TableHead>Coût</TableHead>
                <TableHead>Date achat</TableHead>
                <TableHead>Fournisseur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {intrants.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.name}</TableCell>
                  <TableCell><IntrantTypeBadge type={i.type} /></TableCell>
                  <TableCell>{i.quantity} {i.unit}</TableCell>
                  <TableCell>{formatFCFA(i.cost_fcfa)}</TableCell>
                  <TableCell>{formatDate(i.purchase_date)}</TableCell>
                  <TableCell>{i.supplier ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end border-t px-4 py-3 text-sm font-medium">
            Total coût intrants : {totalCost.toLocaleString('fr-FR')} FCFA
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CarnetAgricolePage() {
  const { user } = useAuth()
  const { currentCooperative } = useCooperative()

  const isAdmin = user?.role === 'cooperative_admin' || user?.role === 'super_admin'
  const cooperativeId = currentCooperative?.id ?? ''

  // When admin, selected member can be overridden; members see only themselves
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    isAdmin ? null : (user?.id ?? null),
  )
  const [members, setMembers] = useState<MemberOption[]>([])
  const [campagnes, setCampagnes] = useState<Campagne[]>([])
  const [parcelles, setParcelles] = useState<Parcelle[]>([])

  // Summary state
  const [entriesThisMonth, setEntriesThisMonth] = useState<number>(0)
  const [intrantsCost, setIntrantsCost] = useState<number>(0)
  const [activeCampagneName, setActiveCampagneName] = useState<string>('—')

  const fetchCampagnes = useCallback(async () => {
    if (!cooperativeId) return
    const res = await fetch(`/api/carnet/campagnes?cooperative_id=${cooperativeId}`)
    if (res.ok) {
      const json = (await res.json()) as { campagnes: Campagne[] }
      setCampagnes(json.campagnes)
      const active = json.campagnes.find((c) => c.status === 'active')
      setActiveCampagneName(active?.name ?? '—')
    }
  }, [cooperativeId])

  useEffect(() => {
    if (!cooperativeId) return

    // Fetch members for admin
    if (isAdmin) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (supabaseUrl && supabaseKey) {
        void fetch(
          `${supabaseUrl}/rest/v1/members?cooperative_id=eq.${cooperativeId}&select=id,first_name,last_name`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
            },
          },
        ).then(async (res) => {
          if (res.ok) {
            const data = (await res.json()) as MemberOption[]
            setMembers(data)
          }
        })
      }
    }

    // Fetch parcelles
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (supabaseUrl && supabaseKey) {
      const parcelleFilter = selectedMemberId
        ? `&member_id=eq.${selectedMemberId}`
        : ''
      void fetch(
        `${supabaseUrl}/rest/v1/parcelles?cooperative_id=eq.${cooperativeId}${parcelleFilter}&select=id,culture_name`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        },
      ).then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as Parcelle[]
          setParcelles(data)
        }
      })
    }

    void fetchCampagnes()
  }, [cooperativeId, isAdmin, selectedMemberId, fetchCampagnes])

  // Summary: entries this month
  useEffect(() => {
    if (!cooperativeId) return
    const params = new URLSearchParams({ cooperative_id: cooperativeId })
    if (selectedMemberId) params.set('member_id', selectedMemberId)
    void fetch(`/api/carnet/journal?${params.toString()}`).then(async (res) => {
      if (res.ok) {
        const json = (await res.json()) as { entries: JournalEntry[] }
        const now = new Date()
        const count = json.entries.filter((e) => {
          const d = new Date(e.entry_date)
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
        }).length
        setEntriesThisMonth(count)
      }
    })
  }, [cooperativeId, selectedMemberId])

  // Summary: intrants cost for active campagne
  useEffect(() => {
    if (!cooperativeId) return
    const active = campagnes.find((c) => c.status === 'active')
    if (!active) {
      setIntrantsCost(0)
      return
    }
    const params = new URLSearchParams({ cooperative_id: cooperativeId, campagne_id: active.id })
    if (selectedMemberId) params.set('member_id', selectedMemberId)
    void fetch(`/api/carnet/intrants?${params.toString()}`).then(async (res) => {
      if (res.ok) {
        const json = (await res.json()) as { intrants: Intrant[] }
        const total = json.intrants.reduce((sum, i) => sum + (i.cost_fcfa ?? 0), 0)
        setIntrantsCost(total)
      }
    })
  }, [cooperativeId, campagnes, selectedMemberId])

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Carnet Agricole 📗</h1>
      </div>

      {/* Member selector for admins */}
      {isAdmin && (
        <div className="flex items-center gap-3">
          <Label className="whitespace-nowrap">Voir pour :</Label>
          <Select
            value={selectedMemberId ?? 'all'}
            onValueChange={(v) => setSelectedMemberId(v === 'all' ? null : v)}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Tous les membres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les membres</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.first_name} {m.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Entrées ce mois
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{entriesThisMonth}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Coût intrants (campagne active)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{intrantsCost.toLocaleString('fr-FR')}</p>
            <p className="text-xs text-muted-foreground">FCFA</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Campagne active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold truncate">{activeCampagneName}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="journal">
        <TabsList>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="campagnes">Campagnes</TabsTrigger>
          <TabsTrigger value="intrants">Intrants</TabsTrigger>
        </TabsList>

        <TabsContent value="journal" className="mt-4">
          <JournalTab
            cooperativeId={cooperativeId}
            memberId={selectedMemberId}
            members={members}
            campagnes={campagnes}
            parcelles={parcelles}
            isAdmin={isAdmin}
          />
        </TabsContent>

        <TabsContent value="campagnes" className="mt-4">
          <CampagnesTab
            cooperativeId={cooperativeId}
            campagnes={campagnes}
            onRefresh={fetchCampagnes}
          />
        </TabsContent>

        <TabsContent value="intrants" className="mt-4">
          <IntrantsTab
            cooperativeId={cooperativeId}
            memberId={selectedMemberId}
            members={members}
            campagnes={campagnes}
            isAdmin={isAdmin}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
