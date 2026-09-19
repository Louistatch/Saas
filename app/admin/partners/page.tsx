'use client'

/**
 * Validation manuelle de la certification Opérateur — mécanisme pilote
 * (§9 du plan). Table simple, sans carte géante ni dégradé décoratif :
 * même langage visuel que app/admin/cooperatives/page.tsx.
 *
 * Toute écriture passe par /api/admin/partners/[partnerId]/certification,
 * jamais un UPDATE direct depuis ce composant — le client n'autorise rien,
 * la route revérifie super_admin et délègue à lib/partners/certification.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Award, Building2, CheckCircle2, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadingBlock } from '@/components/shared/loading'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from '@/lib/utils/errors'
import { PARTNER_ACCESS_SCOPES, type PartnerAccessScope, type PartnerStatus } from '@/types/domain'

interface PartnerRow {
  id: string
  partner_code: string
  display_name: string
  status: PartnerStatus
  partner_certifications: {
    training_completed_at: string | null
    exam_score: number | null
    exam_passed_at: string | null
    certified_at: string | null
  }[]
}

const STATUS_LABEL: Record<PartnerStatus, string> = {
  candidate: 'Candidat',
  training: 'Formation',
  exam_pending: 'Examen à venir',
  certified: 'Certifié',
  active: 'Actif',
  suspended: 'Suspendu',
  expired: 'Expiré',
  revoked: 'Révoqué',
}

type ExamDialogState = { partnerId: string; displayName: string } | null

function ExamDialog({
  state,
  onClose,
  onSubmit,
}: {
  state: ExamDialogState
  onClose: () => void
  onSubmit: (score: number, note: string) => Promise<void>
}) {
  const [score, setScore] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (state) {
      setScore('')
      setNote('')
    }
  }, [state])

  const submit = async () => {
    const n = Number.parseInt(score, 10)
    if (!Number.isFinite(n) || n < 0 || n > 100) return
    setSubmitting(true)
    await onSubmit(n, note)
    setSubmitting(false)
  }

  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enregistrer l'évaluation — {state?.displayName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="exam-score">Score (0-100)</Label>
            <Input
              id="exam-score"
              type="number"
              min={0}
              max={100}
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exam-note">Note administrative (optionnel)</Label>
            <Input id="exam-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={submitting || !score}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type AssignDialogState = { partnerId: string; displayName: string } | null

const ASSIGNABLE_SCOPE_LABEL: Record<PartnerAccessScope, string> = {
  'members.read': 'Lecture membres',
  'members.manage': 'Gestion membres',
  'cards.read': 'Lecture cartes',
  'cards.manage': 'Gestion cartes',
  'cards.print': 'Impression cartes physiques',
  'kobo.manage': 'Gestion KoboCollect',
  'imports.manage': 'Gestion imports',
  'analytics.read': 'Lecture statistiques',
  'reports.generate': 'Génération de rapports',
  'projects.manage': 'Gestion de projets',
  'support.manage': 'Support',
}

/**
 * Mandat Partenaire ↔ Organisation (§13 du plan) — mécanisme pilote, comme
 * la validation de certification : en attendant un parcours en
 * libre-service pour les organisations, un super_admin pose le mandat.
 * Sans lui, aucune commande de carte physique (PR 3) n'est possible — voir
 * lib/partners/assignments.ts.
 */
function AssignDialog({
  state,
  onClose,
  onSubmit,
}: {
  state: AssignDialogState
  onClose: () => void
  onSubmit: (cooperativeId: string, scopes: PartnerAccessScope[]) => Promise<void>
}) {
  const supabase = useMemo(() => createClient(), [])
  const [cooperatives, setCooperatives] = useState<{ id: string; name: string }[]>([])
  const [cooperativeId, setCooperativeId] = useState('')
  const [scopes, setScopes] = useState<PartnerAccessScope[]>(['cards.print', 'cards.read'])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!state) return
    setCooperativeId('')
    setScopes(['cards.print', 'cards.read'])
    supabase
      .from('cooperatives')
      .select('id, name')
      .order('name')
      .then(({ data }) => setCooperatives(data ?? []))
  }, [state, supabase])

  const toggleScope = (scope: PartnerAccessScope) => {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]))
  }

  const submit = async () => {
    if (!cooperativeId || scopes.length === 0) return
    setSubmitting(true)
    await onSubmit(cooperativeId, scopes)
    setSubmitting(false)
  }

  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assigner une organisation — {state?.displayName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="assign-coop">Coopérative</Label>
            <Select value={cooperativeId} onValueChange={setCooperativeId}>
              <SelectTrigger id="assign-coop">
                <SelectValue placeholder="Sélectionner une coopérative" />
              </SelectTrigger>
              <SelectContent>
                {cooperatives.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="space-y-2 border-0 p-0 m-0">
            <legend className="text-sm font-medium text-foreground">Périmètres délégués</legend>
            <div className="grid grid-cols-2 gap-2">
              {PARTNER_ACCESS_SCOPES.map((scope) => (
                <label
                  key={scope}
                  htmlFor={`scope-${scope}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    id={`scope-${scope}`}
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="h-4 w-4 rounded border-input"
                  />
                  {ASSIGNABLE_SCOPE_LABEL[scope]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={submitting || !cooperativeId || scopes.length === 0}>
            Assigner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminPartnersPage() {
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [examDialog, setExamDialog] = useState<ExamDialogState>(null)
  const [assignDialog, setAssignDialog] = useState<AssignDialogState>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('partners')
      .select(
        'id, partner_code, display_name, status, partner_certifications(training_completed_at, exam_score, exam_passed_at, certified_at)',
      )
      .order('created_at', { ascending: false })
    if (error) {
      toast({ title: 'Erreur', description: errorMessage(error), variant: 'destructive' })
    } else {
      setPartners((data ?? []) as unknown as PartnerRow[])
    }
    setIsLoading(false)
  }, [supabase, toast])

  useEffect(() => {
    load()
  }, [load])

  const callAction = async (
    partnerId: string,
    body: {
      action: 'mark_training_completed' | 'record_exam' | 'activate'
      exam_score?: number
      note?: string
    },
  ) => {
    setActingId(partnerId)
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/certification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          title: 'Action impossible',
          description: payload.error ?? '—',
          variant: 'destructive',
        })
        return
      }
      toast({ title: 'Enregistré' })
      await load()
    } catch {
      toast({ title: 'Erreur de connexion', variant: 'destructive' })
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opérateurs"
        description="Validation manuelle de la certification — mécanisme pilote, en attendant le moteur d'examen AgriAcademy."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Candidatures Opérateur</CardTitle>
          <CardDescription>{partners.length} candidature(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingBlock />
          ) : partners.length === 0 ? (
            <EmptyState icon={Award} title="Aucune candidature Opérateur pour le moment" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Candidat</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Formation</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Examen</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Certification
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Statut</th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => {
                    const cert = p.partner_certifications[0]
                    const acting = actingId === p.id
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-border hover:bg-accent/5 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium text-foreground">{p.display_name}</p>
                          <p className="text-xs font-mono text-muted-foreground">
                            {p.partner_code}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          {cert?.training_completed_at ? (
                            <span className="inline-flex items-center gap-1 text-sm text-primary">
                              <CheckCircle2 className="h-4 w-4" /> Terminée
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">En attente</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {cert?.exam_score != null ? (
                            <span
                              className={`inline-flex items-center gap-1 text-sm ${cert.exam_passed_at ? 'text-primary' : 'text-destructive'}`}
                            >
                              {cert.exam_passed_at ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : (
                                <XCircle className="h-4 w-4" />
                              )}
                              {cert.exam_score}/100
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {cert?.certified_at ? (
                            <span className="text-primary">Payée</span>
                          ) : (
                            <span className="text-muted-foreground">Non payée</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 text-xs font-semibold text-primary bg-primary/10 rounded-full">
                            {STATUS_LABEL[p.status]}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex justify-end gap-2">
                            {!cert?.training_completed_at && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={acting}
                                onClick={() =>
                                  callAction(p.id, { action: 'mark_training_completed' })
                                }
                              >
                                Valider formation
                              </Button>
                            )}
                            {cert?.training_completed_at && !cert.exam_passed_at && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={acting}
                                onClick={() =>
                                  setExamDialog({ partnerId: p.id, displayName: p.display_name })
                                }
                              >
                                Enregistrer évaluation
                              </Button>
                            )}
                            {cert?.certified_at && p.status !== 'active' && (
                              <Button
                                size="sm"
                                disabled={acting}
                                onClick={() => callAction(p.id, { action: 'activate' })}
                              >
                                Activer opérateur
                              </Button>
                            )}
                            {p.status === 'active' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={acting}
                                onClick={() =>
                                  setAssignDialog({ partnerId: p.id, displayName: p.display_name })
                                }
                              >
                                <Building2 className="mr-1.5 h-3.5 w-3.5" /> Assigner
                              </Button>
                            )}
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

      <ExamDialog
        state={examDialog}
        onClose={() => setExamDialog(null)}
        onSubmit={async (score, note) => {
          if (!examDialog) return
          await callAction(examDialog.partnerId, {
            action: 'record_exam',
            exam_score: score,
            note: note || undefined,
          })
          setExamDialog(null)
        }}
      />

      <AssignDialog
        state={assignDialog}
        onClose={() => setAssignDialog(null)}
        onSubmit={async (cooperativeId, scopes) => {
          if (!assignDialog) return
          try {
            const res = await fetch('/api/admin/partner-assignments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                partner_id: assignDialog.partnerId,
                cooperative_id: cooperativeId,
                scopes,
              }),
            })
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) {
              toast({
                title: 'Assignation impossible',
                description: payload.error ?? '—',
                variant: 'destructive',
              })
              return
            }
            toast({ title: 'Mandat créé' })
          } catch {
            toast({ title: 'Erreur de connexion', variant: 'destructive' })
          } finally {
            setAssignDialog(null)
          }
        }}
      />
    </div>
  )
}
