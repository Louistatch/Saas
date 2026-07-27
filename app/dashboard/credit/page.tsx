'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { useAuth } from '@/app/context/auth-context'
import { useCooperative } from '@/app/context/cooperative-context'
import { CreditCard, TrendingUp, CheckCircle, Clock, ChevronRight } from 'lucide-react'

interface CreditApplication {
  id: string
  member_id: string
  amount_requested_fcfa: number
  amount_approved_fcfa?: number
  purpose: string
  duration_months: number
  credit_score?: number
  credit_grade?: string
  interest_rate_pct?: number
  status: string
  created_at: string
  members?: { first_name: string; last_name: string }
  credit_repayments?: Array<{ id: string; due_date: string; amount_due_fcfa: number; amount_paid_fcfa: number; status: string }>
}

interface ScoringResult {
  score: number
  grade: string
  maxLoanFcfa: number
  interestRatePct: number
  reasons: string[]
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  scoring: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  disbursed: 'bg-emerald-100 text-emerald-700',
  repaying: 'bg-teal-100 text-teal-700',
  closed: 'bg-slate-100 text-slate-600',
  defaulted: 'bg-red-200 text-red-900',
}

const GRADE_COLOR: Record<string, string> = { A: 'bg-green-100 text-green-800', B: 'bg-lime-100 text-lime-800', C: 'bg-yellow-100 text-yellow-800', D: 'bg-orange-100 text-orange-800', F: 'bg-red-100 text-red-800' }

export default function AgriCreditPage() {
  const { user } = useAuth()
  const { currentCooperative } = useCooperative()
  const [applications, setApplications] = useState<CreditApplication[]>([])
  const [selected, setSelected] = useState<CreditApplication | null>(null)
  const [isAdmin] = useState(user?.role === 'super_admin' || user?.role === 'cooperative_admin')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [scoring, setScoring] = useState<ScoringResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ member_id: '', amount_requested_fcfa: '', purpose: 'semences', duration_months: '12' })
  const [payAmount, setPayAmount] = useState('')

  const load = useCallback(async () => {
    if (!currentCooperative) return
    const res = await fetch(`/api/credit/applications`)
    if (res.ok) { const d = await res.json(); setApplications(d.applications) }
  }, [currentCooperative])

  useEffect(() => { void load() }, [load])

  const handleSubmit = async () => {
    if (!currentCooperative) return
    setSubmitting(true)
    const res = await fetch('/api/credit/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, cooperative_id: currentCooperative.id }) })
    const d = await res.json()
    setSubmitting(false)
    if (res.ok) { setScoring(d.scoring); void load() }
  }

  const handleStatusChange = async (id: string, status: string, amount?: number) => {
    const body: Record<string, unknown> = { status }
    if (amount) body.amount_approved_fcfa = amount
    await fetch(`/api/credit/applications/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    void load()
    if (selected?.id === id) {
      const r = await fetch(`/api/credit/applications/${id}`); if (r.ok) { const d = await r.json(); setSelected(d.application) }
    }
  }

  const handlePay = async (repaymentId: string) => {
    if (!selected || !payAmount) return
    await fetch(`/api/credit/applications/${selected.id}/repayments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repayment_id: repaymentId, amount_paid: Number(payAmount) }) })
    const r = await fetch(`/api/credit/applications/${selected.id}`); if (r.ok) { const d = await r.json(); setSelected(d.application) }
    setPayAmount('')
  }

  const active = applications.filter(a => ['pending','scoring','approved','disbursed','repaying'].includes(a.status))
  const totalEncours = applications.filter(a => a.status === 'disbursed' || a.status === 'repaying').reduce((s, a) => s + (a.amount_approved_fcfa ?? 0), 0)
  const allReps = applications.flatMap(a => a.credit_repayments ?? [])
  const totalDue = allReps.reduce((s, r) => s + r.amount_due_fcfa, 0)
  const totalPaid = allReps.reduce((s, r) => s + (r.amount_paid_fcfa ?? 0), 0)
  const repayRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AgriCredit 💳</h1>
          <p className="text-sm text-muted-foreground">Crédit agricole et microfinance coopérative</p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button className="gap-2"><CreditCard className="h-4 w-4" /> Nouvelle demande</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Demande de crédit</DialogTitle></DialogHeader>
              {!scoring ? (
                <div className="space-y-4">
                  <div><label className="text-sm font-medium">ID Membre</label><Input value={form.member_id} onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))} placeholder="UUID du membre" /></div>
                  <div><label className="text-sm font-medium">Montant demandé (FCFA)</label><Input type="number" value={form.amount_requested_fcfa} onChange={e => setForm(f => ({ ...f, amount_requested_fcfa: e.target.value }))} /></div>
                  <div><label className="text-sm font-medium">Objet</label>
                    <Select value={form.purpose} onValueChange={v => setForm(f => ({ ...f, purpose: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{['semences','engrais','equipement','irrigation','stockage','autre'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><label className="text-sm font-medium">Durée (mois)</label>
                    <Select value={form.duration_months} onValueChange={v => setForm(f => ({ ...f, duration_months: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{[3,6,12,18,24].map(d => <SelectItem key={d} value={String(d)}>{d} mois</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleSubmit} disabled={submitting} className="w-full">{submitting ? 'Analyse en cours...' : 'Analyser le score'}</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center p-4 rounded-lg bg-green-50 border border-green-200">
                    <div className="text-4xl font-bold text-green-800">{scoring.score}/100</div>
                    <Badge className={GRADE_COLOR[scoring.grade] ?? ''}>{scoring.grade} — {scoring.grade === 'F' ? 'Refusé' : 'Approuvable'}</Badge>
                    <div className="text-sm text-green-700 mt-1">Max: {scoring.maxLoanFcfa.toLocaleString('fr-FR')} FCFA · Taux: {scoring.interestRatePct}%</div>
                  </div>
                  <ul className="text-sm space-y-1">{scoring.reasons.map((r, i) => <li key={i} className="text-muted-foreground">• {r}</li>)}</ul>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setScoring(null)}>Modifier</Button>
                    <Button className="flex-1" onClick={() => { setDialogOpen(false); setScoring(null) }}>Fermer</Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'En cours', value: active.length, icon: Clock, color: 'text-blue-600' },
          { label: 'Encours FCFA', value: totalEncours.toLocaleString('fr-FR'), icon: TrendingUp, color: 'text-green-600' },
          { label: 'Taux remboursement', value: `${repayRate}%`, icon: CheckCircle, color: 'text-emerald-600' },
          { label: 'Total demandes', value: applications.length, icon: CreditCard, color: 'text-purple-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}><CardContent className="pt-4"><div className="flex items-center gap-3"><Icon className={`h-8 w-8 ${color}`} /><div><div className="text-xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div></div></CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="demandes">
        <TabsList><TabsTrigger value="demandes">Demandes</TabsTrigger><TabsTrigger value="echeancier">Échéancier</TabsTrigger><TabsTrigger value="analytique">Analytique</TabsTrigger></TabsList>

        <TabsContent value="demandes">
          <Card><CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b">{['Membre','Montant','Objet','Durée','Score','Grade','Statut',''].map(h => <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                <tbody>
                  {applications.map(a => (
                    <tr key={a.id} className="border-b hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{a.members ? `${a.members.first_name} ${a.members.last_name}` : '—'}</td>
                      <td className="px-4 py-3">{(a.amount_requested_fcfa ?? 0).toLocaleString('fr-FR')} F</td>
                      <td className="px-4 py-3 capitalize">{a.purpose}</td>
                      <td className="px-4 py-3">{a.duration_months} mois</td>
                      <td className="px-4 py-3">
                        {a.credit_score != null && (
                          <div className="flex items-center gap-2">
                            <Progress value={a.credit_score} className="w-16 h-2" />
                            <span className={a.credit_score >= 80 ? 'text-green-600' : a.credit_score >= 50 ? 'text-yellow-600' : 'text-red-600'}>{a.credit_score}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">{a.credit_grade && <Badge className={GRADE_COLOR[a.credit_grade] ?? ''}>{a.credit_grade}</Badge>}</td>
                      <td className="px-4 py-3"><Badge className={STATUS_BADGE[a.status] ?? ''}>{a.status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {isAdmin && a.status === 'scoring' && <>
                            <Button size="sm" variant="outline" className="text-green-700 border-green-300" onClick={() => handleStatusChange(a.id, 'approved', a.credit_score && a.credit_score >= 50 ? a.amount_requested_fcfa : undefined)}>Approuver</Button>
                            <Button size="sm" variant="outline" className="text-red-700 border-red-300" onClick={() => handleStatusChange(a.id, 'rejected')}>Rejeter</Button>
                          </>}
                          <Button size="sm" variant="ghost" onClick={() => setSelected(a)}><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {applications.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Aucune demande de crédit</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="echeancier">
          {!selected ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Sélectionnez une demande dans l'onglet Demandes</CardContent></Card>
          ) : (
            <Card>
              <CardHeader><CardTitle className="text-base">Échéancier — {selected.members ? `${selected.members.first_name} ${selected.members.last_name}` : selected.id.slice(0, 8)}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b">{['Date','Dû','Payé','Statut','Action'].map(h => <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                  <tbody>
                    {(selected.credit_repayments ?? []).map(r => (
                      <tr key={r.id} className="border-b">
                        <td className="px-4 py-3">{r.due_date}</td>
                        <td className="px-4 py-3">{r.amount_due_fcfa.toLocaleString('fr-FR')} F</td>
                        <td className="px-4 py-3">{(r.amount_paid_fcfa ?? 0).toLocaleString('fr-FR')} F</td>
                        <td className="px-4 py-3"><Badge className={r.status === 'paid' ? 'bg-green-100 text-green-700' : r.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}>{r.status}</Badge></td>
                        <td className="px-4 py-3">
                          {r.status !== 'paid' && isAdmin && (
                            <div className="flex gap-2 items-center">
                              <Input className="w-28 h-7 text-xs" type="number" placeholder="Montant" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                              <Button size="sm" variant="outline" onClick={() => handlePay(r.id)}>Enregistrer</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(selected.credit_repayments?.length ?? 0) === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Pas d'échéancier — approuver et débourser d'abord</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytique">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardHeader><CardTitle className="text-sm">Encours total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-700">{totalEncours.toLocaleString('fr-FR')} F</div></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Taux de recouvrement</CardTitle></CardHeader><CardContent><Progress value={repayRate} className="h-3 mt-2" /><div className="text-sm mt-1 text-muted-foreground">{repayRate}%</div></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Distribution grades</CardTitle></CardHeader><CardContent>
              {(['A','B','C','D','F'] as const).map(g => {
                const cnt = applications.filter(a => a.credit_grade === g).length
                return <div key={g} className="flex items-center gap-2 text-sm"><Badge className={GRADE_COLOR[g]}>{g}</Badge><span>{cnt} demande{cnt !== 1 ? 's' : ''}</span></div>
              })}
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
