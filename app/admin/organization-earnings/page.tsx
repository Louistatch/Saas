'use client'

/**
 * Créances organisation (§45-46 du plan) — 500 FCFA par carte physique
 * imprimée, dues à la coopérative. Aucun virement automatisé : cette page
 * ne fait que tracer un règlement déjà effectué hors plateforme.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Coins } from 'lucide-react'
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
import type { OrganizationEarningStatus } from '@/types/domain'

interface EarningRow {
  id: string
  amount_fcfa: number
  status: OrganizationEarningStatus
  settled_at: string | null
  created_at: string
  cooperatives: { name: string } | null
  partners: { display_name: string } | null
}

const STATUS_LABEL: Record<OrganizationEarningStatus, string> = {
  pending: 'En attente d’impression',
  available: 'Disponible',
  paid: 'Réglée',
  cancelled: 'Annulée',
}

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Virement bancaire',
  mobile_money: 'Mobile money',
  cash: 'Espèces',
  other: 'Autre',
}

type SettleDialogState = { earningId: string; amountFcfa: number; coopName: string } | null

function SettleDialog({
  state,
  onClose,
  onSubmit,
}: {
  state: SettleDialogState
  onClose: () => void
  onSubmit: (method: string, reference: string) => Promise<void>
}) {
  const [method, setMethod] = useState('mobile_money')
  const [reference, setReference] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (state) {
      setMethod('mobile_money')
      setReference('')
    }
  }, [state])

  const submit = async () => {
    setSubmitting(true)
    await onSubmit(method, reference)
    setSubmitting(false)
  }

  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Régler {state?.amountFcfa.toLocaleString('fr-FR')} FCFA — {state?.coopName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="settle-method">Méthode de règlement</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="settle-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(METHOD_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settle-ref">Référence (optionnel)</Label>
            <Input
              id="settle-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={submitting}>
            Confirmer le règlement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function OrganizationEarningsPage() {
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const [earnings, setEarnings] = useState<EarningRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [settleDialog, setSettleDialog] = useState<SettleDialogState>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('organization_earnings')
      .select(
        'id, amount_fcfa, status, settled_at, created_at, cooperatives(name), partners(display_name)',
      )
      .order('created_at', { ascending: false })
    if (error) {
      toast({ title: 'Erreur', description: errorMessage(error), variant: 'destructive' })
    } else {
      setEarnings((data ?? []) as unknown as EarningRow[])
    }
    setIsLoading(false)
  }, [supabase, toast])

  useEffect(() => {
    load()
  }, [load])

  const totals = earnings.reduce(
    (acc, e) => {
      if (e.status === 'available') acc.available += e.amount_fcfa
      if (e.status === 'pending') acc.pending += e.amount_fcfa
      return acc
    },
    { available: 0, pending: 0 },
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gains organisations"
        description="500 FCFA par carte physique imprimée, dus aux coopératives. Aucun virement automatisé — chaque règlement est tracé, pas exécuté depuis ici."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Disponible au règlement</p>
            <p className="text-2xl font-bold text-foreground">
              {totals.available.toLocaleString('fr-FR')} FCFA
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">En attente d’impression</p>
            <p className="text-2xl font-bold text-foreground">
              {totals.pending.toLocaleString('fr-FR')} FCFA
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Créances</CardTitle>
          <CardDescription>{earnings.length} créance(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingBlock />
          ) : earnings.length === 0 ? (
            <EmptyState icon={Coins} title="Aucune créance pour le moment" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Coopérative
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">
                      Partenaire
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Montant</th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Statut</th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {earnings.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-border hover:bg-accent/5 transition-colors"
                    >
                      <td className="py-3 px-4 text-foreground">{e.cooperatives?.name ?? '—'}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {e.partners?.display_name ?? '—'}
                      </td>
                      <td className="py-3 px-4 font-medium text-foreground">
                        {e.amount_fcfa.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 text-xs font-semibold text-primary bg-primary/10 rounded-full">
                          {STATUS_LABEL[e.status]}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {e.status === 'available' && (
                          <Button
                            size="sm"
                            onClick={() =>
                              setSettleDialog({
                                earningId: e.id,
                                amountFcfa: e.amount_fcfa,
                                coopName: e.cooperatives?.name ?? '—',
                              })
                            }
                          >
                            Régler
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <SettleDialog
        state={settleDialog}
        onClose={() => setSettleDialog(null)}
        onSubmit={async (method, reference) => {
          if (!settleDialog) return
          try {
            const res = await fetch(
              `/api/admin/organization-earnings/${settleDialog.earningId}/settle`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  settlement_method: method,
                  ...(reference.trim() ? { settlement_reference: reference.trim() } : {}),
                }),
              },
            )
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) {
              toast({
                title: 'Règlement impossible',
                description: payload.error ?? '—',
                variant: 'destructive',
              })
              return
            }
            toast({ title: 'Créance réglée' })
            await load()
          } catch {
            toast({ title: 'Erreur de connexion', variant: 'destructive' })
          } finally {
            setSettleDialog(null)
          }
        }}
      />
    </div>
  )
}
