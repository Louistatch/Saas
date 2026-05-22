'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Search, CheckCircle, Clock, AlertTriangle, Banknote, TrendingUp } from 'lucide-react'
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
import { errorMessage } from '@/lib/utils/errors'

interface Cotisation {
  id: string
  amount: number
  currency: string
  type: string
  status: string
  due_date: string | null
  paid_date: string | null
  campaign: string | null
  notes: string | null
  created_at: string
  member: { id: string; first_name: string; last_name: string; phone: string | null } | null
}

interface MemberOption {
  id: string
  first_name: string
  last_name: string
}

const PAGE_SIZE = 20
const TYPES = [
  { value: 'cotisation', label: 'Cotisation', icon: '💰' },
  { value: 'credit', label: 'Crédit', icon: '🏦' },
  { value: 'remboursement', label: 'Remboursement', icon: '↩️' },
  { value: 'amende', label: 'Amende', icon: '⚠️' },
  { value: 'don', label: 'Don', icon: '🎁' },
]

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'En attente' },
  paid: { bg: 'bg-green-100', text: 'text-green-800', label: 'Payé' },
  overdue: { bg: 'bg-red-100', text: 'text-red-800', label: 'En retard' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Annulé' },
}

export default function CotisationsPage() {
  const { currentCooperative } = useCooperative()
  const { user } = useAuth()
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])

  const [cotisations, setCotisations] = useState<Cotisation[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 200)
  const [filterStatus, setFilterStatus] = useState('')

  // Stats
  const [stats, setStats] = useState({ total_paid: 0, total_pending: 0, total_overdue: 0, count: 0 })

  // Dialog
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    member_id: '',
    amount: '1000',
    type: 'cotisation',
    campaign: new Date().getFullYear() + '-' + (new Date().getFullYear() + 1),
    due_date: '',
    notes: '',
  })

  // Load members for select
  useEffect(() => {
    if (!currentCooperative) return
    supabase.from('members').select('id, first_name, last_name')
      .eq('cooperative_id', currentCooperative.id)
      .eq('status', 'active')
      .order('last_name')
      .then(({ data }) => setMembers(data ?? []))
  }, [currentCooperative, supabase])

  // Load stats
  useEffect(() => {
    if (!currentCooperative) return
    supabase.from('cotisations').select('amount, status')
      .eq('cooperative_id', currentCooperative.id)
      .then(({ data }) => {
        const rows = data ?? []
        setStats({
          count: rows.length,
          total_paid: rows.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.amount), 0),
          total_pending: rows.filter(r => r.status === 'pending').reduce((s, r) => s + Number(r.amount), 0),
          total_overdue: rows.filter(r => r.status === 'overdue').reduce((s, r) => s + Number(r.amount), 0),
        })
      })
  }, [currentCooperative, supabase, cotisations])

  // Load cotisations
  const fetchCotisations = useCallback(async () => {
    if (!currentCooperative) return
    setIsLoading(true)

    let query = supabase
      .from('cotisations')
      .select('*, member:members(id, first_name, last_name, phone)', { count: 'exact' })
      .eq('cooperative_id', currentCooperative.id)
    query = query.order('created_at', { ascending: false })

    if (filterStatus) query = query.eq('status', filterStatus)

    const from = (page - 1) * PAGE_SIZE
    query = query.range(from, from + PAGE_SIZE - 1)

    const { data, error, count } = await query
    if (error) {
      toast({ title: 'Erreur', description: errorMessage(error), variant: 'destructive' })
    } else {
      let filtered = (data ?? []) as Cotisation[]
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase()
        filtered = filtered.filter((c) => {
          const name = c.member ? `${c.member.first_name} ${c.member.last_name}`.toLowerCase() : ''
          return name.includes(q)
        })
      }
      setCotisations(filtered)
      setTotal(count ?? 0)
    }
    setIsLoading(false)
  }, [currentCooperative, supabase, filterStatus, page, toast])

  useEffect(() => { fetchCotisations() }, [fetchCotisations])
  useEffect(() => { setPage(1) }, [filterStatus])

  // Add cotisation
  const handleAdd = async () => {
    if (!currentCooperative || !form.member_id || !form.amount) {
      toast({ title: 'Membre et montant obligatoires', variant: 'destructive' })
      return
    }
    setSaving(true)
    const { error } = await supabase.from('cotisations').insert({
      cooperative_id: currentCooperative.id,
      member_id: form.member_id,
      amount: parseFloat(form.amount),
      type: form.type,
      status: 'pending',
      campaign: form.campaign || null,
      due_date: form.due_date || null,
      notes: form.notes || null,
    })
    setSaving(false)
    if (error) {
      toast({ title: 'Erreur', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Cotisation enregistrée' })
    setShowAdd(false)
    setForm({ member_id: '', amount: '1000', type: 'cotisation', campaign: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`, due_date: '', notes: '' })
    fetchCotisations()
  }

  // Mark as paid
  const markPaid = async (id: string) => {
    const { error } = await supabase.from('cotisations').update({
      status: 'paid',
      paid_date: new Date().toISOString().split('T')[0],
    }).eq('id', id)
    if (error) {
      toast({ title: 'Erreur', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Marqué comme payé ✓' })
    fetchCotisations()
  }

  const formatAmount = (amount: number) => new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cotisations"
        description="Gérez les cotisations, crédits et paiements des membres"
        action={
          <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle cotisation
          </Button>
        }
      />

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-green-50"><CheckCircle className="h-4 w-4 text-green-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total encaissé</p>
                <p className="text-lg font-bold text-green-700">{formatAmount(stats.total_paid)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-yellow-50"><Clock className="h-4 w-4 text-yellow-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">En attente</p>
                <p className="text-lg font-bold text-yellow-700">{formatAmount(stats.total_pending)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-red-50"><AlertTriangle className="h-4 w-4 text-red-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">En retard</p>
                <p className="text-lg font-bold text-red-700">{formatAmount(stats.total_overdue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-blue-50"><TrendingUp className="h-4 w-4 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="text-lg font-bold text-foreground">{stats.count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Rechercher un membre…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select
          className="border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm min-w-[150px]"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="pending">⏳ En attente</option>
          <option value="paid">✅ Payé</option>
          <option value="overdue">🔴 En retard</option>
          <option value="cancelled">❌ Annulé</option>
        </select>
      </div>

      {/* List */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Historique des cotisations</CardTitle>
          <CardDescription>{total} enregistrement{total !== 1 ? 's' : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingBlock />
          ) : cotisations.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title={filterStatus ? 'Aucune cotisation avec ce statut' : 'Aucune cotisation'}
              description="Enregistrez les cotisations de vos membres pour suivre les paiements"
              action={
                <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setShowAdd(true)}>
                  <Plus className="h-4 w-4" /> Première cotisation
                </Button>
              }
            />
          ) : (
            <>
              <div className="space-y-2">
                {cotisations.map((cot) => {
                  const statusInfo = STATUS_COLORS[cot.status] ?? STATUS_COLORS.pending
                  const typeInfo = TYPES.find(t => t.value === cot.type)
                  return (
                    <div key={cot.id} className="flex items-center gap-4 p-4 border border-border rounded-lg hover:bg-accent/5 transition-colors">
                      <div className="text-2xl">{typeInfo?.icon ?? '💰'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">
                            {cot.member ? `${cot.member.first_name} ${cot.member.last_name}` : '—'}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.bg} ${statusInfo.text}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {typeInfo?.label ?? cot.type}
                          {cot.campaign ? ` • ${cot.campaign}` : ''}
                          {cot.due_date ? ` • Échéance: ${cot.due_date}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-foreground">{formatAmount(cot.amount)}</p>
                        {cot.paid_date && <p className="text-xs text-green-600">Payé le {cot.paid_date}</p>}
                      </div>
                      {cot.status === 'pending' && (
                        <Button size="sm" variant="outline" className="shrink-0 gap-1 border-green-300 text-green-700 hover:bg-green-50" onClick={() => markPaid(cot.id)}>
                          <CheckCircle className="h-3.5 w-3.5" /> Payé
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
              <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle cotisation</DialogTitle>
            <DialogDescription>Enregistrez un paiement ou une dette pour un membre</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Membre <span className="text-destructive">*</span></Label>
              <select
                className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                value={form.member_id}
                onChange={(e) => setForm(f => ({ ...f, member_id: e.target.value }))}
              >
                <option value="">— Choisir un membre —</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Montant (FCFA) <span className="text-destructive">*</span></Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="1000" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                  value={form.type}
                  onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                >
                  {TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campagne</Label>
                <Input value={form.campaign} onChange={(e) => setForm(f => ({ ...f, campaign: e.target.value }))} placeholder="2025-2026" />
              </div>
              <div className="space-y-2">
                <Label>Date d'échéance</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optionnel…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={saving}>Annuler</Button>
            <Button className="bg-primary hover:bg-primary/90 gap-2" onClick={handleAdd} disabled={saving || !form.member_id || !form.amount}>
              {saving ? <Spinner className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
