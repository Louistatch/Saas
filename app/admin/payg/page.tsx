'use client'

/**
 * Console PAYG super-admin : ce que les grands livres disent (crédits achetés et consommés,
 * commissions, formation, taux de première et deuxième recharge, activité par région et
 * par organisation) et les actions réservées à l'équipe. Chaque écriture passe par
 * /api/admin/payg, qui revérifie super_admin et délègue aux fonctions SQL payg_*.
 */

import { api } from '@/components/payg/api'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { formatFcfa } from '@/lib/payg/model'
import { Wallet } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface Overview {
  operators: { individual_active: number; institutional_active: number; candidates: number }
  agents_by_institution: { partner_id: string; name: string; agents: number }[]
  credits: {
    purchased: number
    purchased_fcfa: number
    welcome_granted: number
    consumed: number
    consumed_welcome: number
    consumed_purchased: number
    outstanding: number
  }
  commissions_earned_fcfa: number
  training: {
    paid: number
    partial: number
    unpaid: number
    collected_fcfa: number
    due_fcfa: number
  }
  recharge: { active_operators: number; first: number; second: number }
  by_region: { region: string; cards: number }[]
  by_organization: { cooperative: string; operator: string; cards: number }[]
}

interface Operator {
  id: string
  partner_code: string
  display_name: string
  operator_kind: 'individual' | 'institutional'
  status: string
  credit_balance: number
  welcome_credits: number
}

interface TrainingRow {
  id: string
  user_id: string
  partner_id: string | null
  total_fcfa: number
  paid_fcfa: number
  payer: string
  status: string
  profiles: { first_name: string | null; last_name: string | null; email: string | null } | null
}

interface PrintOrderRow {
  id: string
  partner_id: string
  status: string
  card_format: string
  delivery_address: string
  delivery_contact: string
  fabrication_fcfa: number | null
  delivery_fcfa: number | null
  created_at: string
  faitierehub_print_order_items: { member_card_id: string }[]
  partners: { display_name: string } | null
}

interface RectificationRow {
  id: string
  status: string
  description: string
  requested_via: string
  created_at: string
  resolution: string | null
  cooperatives: { name: string } | null
  partners: { display_name: string } | null
}

interface LedgerRow {
  id: string
  partner_id: string
  entry_type: string
  credits: number
  balance_after: number
  amount_fcfa: number | null
  note: string | null
  created_at: string
}

interface MandateRow {
  id: string
  partner_id: string
  cooperative_id: string
  cooperatives: { name: string } | null
  partner_data_agreements: { id: string; signed_on: string; revoked_at: string | null }[]
}

interface AdminData {
  overview: Overview | null
  operators: Operator[]
  training: TrainingRow[]
  print_orders: PrintOrderRow[]
  rectifications: RectificationRow[]
  ledger: LedgerRow[]
  mandates: MandateRow[]
}

const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)} %` : '—'
const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR')

type Action = Record<string, unknown> & { action: string }

export default function AdminPaygPage() {
  const { toast } = useToast()
  const [data, setData] = useState<AdminData | null>(null)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<
    | { kind: 'institution' }
    | { kind: 'credits'; operator: Operator }
    | { kind: 'quote'; order: PrintOrderRow }
    | { kind: 'agreement'; mandate: MandateRow }
    | { kind: 'release' }
    | null
  >(null)

  const load = useCallback(async () => {
    const res = await api<AdminData>('/api/admin/payg')
    if (res.ok) setData(res.data)
    else setError(res.error)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (body: Action, success: string) => {
    const res = await api<Record<string, unknown>>('/api/admin/payg', { body })
    if (!res.ok) {
      toast({ title: 'Action refusée', description: res.error, variant: 'destructive' })
      return null
    }
    toast({ title: success })
    void load()
    return res.data
  }

  if (!data) {
    return error ? (
      <EmptyState icon={Wallet} title="Lecture impossible" description={error} />
    ) : (
      <LoadingBlock message="Lecture des grands livres…" />
    )
  }

  const o = data.overview
  const operatorName = (id: string) =>
    data.operators.find((op) => op.id === id)?.display_name ?? 'Opérateur'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crédits opérateurs"
        description="Opérateurs individuels et institutionnels, crédits, commissions, formation et impression. Les chiffres sont lus dans les grands livres, pas estimés. Tous les paiements passent par FedaPay et se règlent automatiquement."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDialog({ kind: 'release' })}>
              Rendre un crédit
            </Button>
            <Button onClick={() => setDialog({ kind: 'institution' })}>
              Créer une institution
            </Button>
          </div>
        }
      />

      {o && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="Opérateurs actifs"
            value={o.operators.individual_active + o.operators.institutional_active}
            detail={`${o.operators.individual_active} individuels, ${o.operators.institutional_active} institutions, ${o.operators.candidates} candidats`}
          />
          <Kpi
            label="Crédits achetés"
            value={o.credits.purchased}
            detail={`${formatFcfa(o.credits.purchased_fcfa)} encaissés, ${o.credits.welcome_granted} offerts`}
          />
          <Kpi
            label="Cartes commerciales"
            value={o.credits.consumed}
            detail={`${o.credits.consumed_purchased} payées, ${o.credits.consumed_welcome} offertes, ${o.credits.outstanding} crédits en circulation`}
          />
          <Kpi
            label="Commissions acquises"
            value={formatFcfa(o.commissions_earned_fcfa)}
            detail="cartes finalisées sur crédits achetés"
          />
          <Kpi
            label="Formations"
            value={`${o.training.paid} réglées`}
            detail={`${o.training.partial} en cours, ${o.training.unpaid} non payées. ${formatFcfa(o.training.collected_fcfa)} encaissés, ${formatFcfa(o.training.due_fcfa)} dus`}
          />
          <Kpi
            label="1re recharge"
            value={pct(o.recharge.first, o.recharge.active_operators)}
            detail={`${o.recharge.first} opérateurs sur ${o.recharge.active_operators}`}
          />
          <Kpi
            label="2e recharge"
            value={pct(o.recharge.second, o.recharge.first)}
            detail={`${o.recharge.second} des ${o.recharge.first} qui ont rechargé une fois`}
          />
          <Kpi
            label="Agents institutionnels"
            value={o.agents_by_institution.reduce((s, a) => s + a.agents, 0)}
            detail={
              o.agents_by_institution.map((a) => `${a.name} ${a.agents}`).join(', ') ||
              'aucune institution'
            }
          />
        </div>
      )}

      <Tabs defaultValue="operators">
        <TabsList className="relative flex h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="operators">Opérateurs</TabsTrigger>
          <TabsTrigger value="training">Formation</TabsTrigger>
          <TabsTrigger value="print">Impression</TabsTrigger>
          <TabsTrigger value="data">Données</TabsTrigger>
          <TabsTrigger value="activity">Activité</TabsTrigger>
          <TabsTrigger value="ledger">Grand livre</TabsTrigger>
        </TabsList>

        <TabsContent value="operators" className="pt-4">
          <Card>
            <CardContent className="relative overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Opérateur</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                    <th className="px-4 py-3 text-right font-medium">Crédits</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.operators.map((op) => (
                    <tr key={op.id}>
                      <td className="px-4 py-3">
                        <span className="block font-medium text-foreground">{op.display_name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {op.partner_code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={op.operator_kind}
                          onValueChange={(kind) =>
                            act(
                              { action: 'set_kind', partner_id: op.id, kind },
                              'Type d’opérateur mis à jour',
                            )
                          }
                        >
                          <SelectTrigger
                            className="h-9 w-36"
                            aria-label={`Type de ${op.display_name}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="individual">Individuel</SelectItem>
                            <SelectItem value="institutional">Institution</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{op.status}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {op.credit_balance}
                        {op.welcome_credits > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            dont {op.welcome_credits} offerts
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDialog({ kind: 'credits', operator: op })}
                          >
                            Corriger
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="training" className="pt-4">
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {data.training.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Aucun dossier de formation.</p>
              ) : (
                data.training.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {[t.profiles?.first_name, t.profiles?.last_name]
                          .filter(Boolean)
                          .join(' ') || t.profiles?.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.partner_id ? operatorName(t.partner_id) : 'Sans opérateur'},{' '}
                        {t.payer === 'institution'
                          ? 'payée par l’institution'
                          : 'payée par la personne'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums text-foreground">
                        {formatFcfa(t.paid_fcfa)} / {formatFcfa(t.total_fcfa)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="print" className="pt-4">
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {data.print_orders.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  Aucune commande FaîtièreHub Print.
                </p>
              ) : (
                data.print_orders.map((po) => (
                  <div
                    key={po.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {po.partners?.display_name}, {po.faitierehub_print_order_items.length}{' '}
                        carte(s) {po.card_format === 'pvc' ? 'PVC' : 'plastifiée(s)'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {date(po.created_at)}, {po.delivery_address}, contact {po.delivery_contact}
                      </p>
                      {po.fabrication_fcfa !== null && (
                        <p className="text-xs text-muted-foreground">
                          Devis : fabrication {formatFcfa(po.fabrication_fcfa)}, livraison{' '}
                          {formatFcfa(po.delivery_fcfa ?? 0)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">{po.status}</span>
                      {po.status === 'quote_requested' && (
                        <Button size="sm" onClick={() => setDialog({ kind: 'quote', order: po })}>
                          Chiffrer
                        </Button>
                      )}
                      {NEXT_STATUS[po.status] && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            act(
                              {
                                action: 'print_status',
                                order_id: po.id,
                                status: NEXT_STATUS[po.status].value,
                              },
                              'Commande mise à jour',
                            )
                          }
                        >
                          {NEXT_STATUS[po.status].label}
                        </Button>
                      )}
                      {['quote_requested', 'quoted'].includes(po.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            act(
                              { action: 'print_status', order_id: po.id, status: 'cancelled' },
                              'Commande annulée',
                            )
                          }
                        >
                          Annuler
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conventions de données par mandat</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {data.mandates.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Aucun mandat actif.</p>
              ) : (
                data.mandates.map((m) => {
                  const agreement = m.partner_data_agreements.find((a) => !a.revoked_at)
                  return (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <span>
                        <span className="block text-foreground">{m.cooperatives?.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {operatorName(m.partner_id)}
                        </span>
                      </span>
                      {agreement ? (
                        <span className="text-xs text-muted-foreground">
                          Signée le {date(agreement.signed_on)}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDialog({ kind: 'agreement', mandate: m })}
                        >
                          Enregistrer la convention
                        </Button>
                      )}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Demandes de rectification</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {data.rectifications.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Aucune demande.</p>
              ) : (
                data.rectifications.map((r) => (
                  <div key={r.id} className="space-y-1 px-4 py-3 text-sm">
                    <p className="flex flex-wrap justify-between gap-2">
                      <span className="text-foreground">
                        {r.cooperatives?.name}, via {r.partners?.display_name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {date(r.created_at)}, {r.status}
                      </span>
                    </p>
                    <p className="text-muted-foreground">{r.description}</p>
                    {r.resolution && <p className="text-foreground">{r.resolution}</p>}
                    {(r.status === 'open' || r.status === 'in_progress') && (
                      <RectificationActions
                        onAct={(status, resolution) =>
                          act(
                            {
                              action: 'rectification_status',
                              request_id: r.id,
                              status,
                              resolution,
                            },
                            'Demande mise à jour',
                          )
                        }
                        open={r.status === 'open'}
                      />
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="grid gap-4 pt-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cartes commerciales par région</CardTitle>
            </CardHeader>
            <CardContent>
              <Bars
                rows={(o?.by_region ?? []).map((r) => ({
                  label: r.region || 'Non renseignée',
                  value: r.cards,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Par organisation</CardTitle>
            </CardHeader>
            <CardContent>
              <Bars
                rows={(o?.by_organization ?? [])
                  .slice(0, 15)
                  .map((r) => ({ label: `${r.cooperative} (${r.operator})`, value: r.cards }))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="pt-4">
          <Card>
            <CardContent className="relative overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Opérateur</th>
                    <th className="px-4 py-3 font-medium">Opération</th>
                    <th className="px-4 py-3 text-right font-medium">Crédits</th>
                    <th className="px-4 py-3 text-right font-medium">Solde</th>
                    <th className="px-4 py-3 text-right font-medium">FCFA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.ledger.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5 text-muted-foreground">{date(l.created_at)}</td>
                      <td className="px-4 py-2.5">{operatorName(l.partner_id)}</td>
                      <td className="px-4 py-2.5">
                        {l.entry_type}
                        {l.note && (
                          <span className="block text-xs text-muted-foreground">{l.note}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {l.credits > 0 ? '+' : ''}
                        {l.credits}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{l.balance_after}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {l.amount_fcfa ? formatFcfa(l.amount_fcfa) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {dialog?.kind === 'institution' && (
        <FormDialog
          title="Créer une institution"
          description="L’institution est créée active avec 10 crédits offerts, une seule fois. Le responsable reçoit un lien d’invitation valable 14 jours."
          fields={[
            { name: 'display_name', label: 'Nom de l’institution', placeholder: 'FENOMAT' },
            { name: 'owner_name', label: 'Responsable (nom complet)' },
            { name: 'owner_email', label: 'E-mail du responsable', type: 'email' },
            { name: 'phone', label: 'Téléphone (facultatif)', optional: true },
          ]}
          submitLabel="Créer"
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            const res = await act({ action: 'create_institution', ...v }, 'Institution créée')
            return res?.owner_link ? `Lien du responsable : ${String(res.owner_link)}` : null
          }}
        />
      )}
      {dialog?.kind === 'credits' && (
        <FormDialog
          title={`Corriger le solde de ${dialog.operator.display_name}`}
          description="Correction d’une erreur, tracée au grand livre (nombre négatif pour retirer). Ce n’est pas un paiement : les crédits s’achètent uniquement par FedaPay."
          fields={[
            { name: 'credits', label: 'Crédits', type: 'number' },
            { name: 'note', label: 'Motif', multiline: true },
          ]}
          submitLabel="Enregistrer la correction"
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            const res = await act(
              {
                action: 'credits_adjust',
                partner_id: dialog.operator.id,
                credits: Number(v.credits),
                note: v.note,
              },
              'Correction enregistrée',
            )
            return res ? '' : null
          }}
        />
      )}
      {dialog?.kind === 'quote' && (
        <FormDialog
          title="Chiffrer la commande"
          description="Fabrication et livraison, séparées de la commission déjà prise. Mettre 0 seulement si c’est réellement offert."
          fields={[
            { name: 'fabrication_fcfa', label: 'Fabrication (FCFA)', type: 'number' },
            { name: 'delivery_fcfa', label: 'Livraison (FCFA)', type: 'number' },
            {
              name: 'quote_note',
              label: 'Note (délai, transporteur)',
              optional: true,
              multiline: true,
            },
          ]}
          submitLabel="Envoyer le devis"
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            const res = await act(
              {
                action: 'print_quote',
                order_id: dialog.order.id,
                fabrication_fcfa: Number(v.fabrication_fcfa),
                delivery_fcfa: Number(v.delivery_fcfa),
                quote_note: v.quote_note || undefined,
              },
              'Devis envoyé',
            )
            return res ? '' : null
          }}
        />
      )}
      {dialog?.kind === 'agreement' && (
        <FormDialog
          title={`Convention : ${dialog.mandate.cooperatives?.name ?? ''}`}
          description="Convention opérateur–coopérative et mandat d’accès aux données. Les producteurs doivent avoir été informés."
          fields={[
            { name: 'cooperative_signatory', label: 'Signataire pour la coopérative' },
            { name: 'operator_signatory', label: 'Signataire pour l’opérateur' },
            { name: 'signed_on', label: 'Date de signature', type: 'date' },
            { name: 'document_reference', label: 'Référence du document', optional: true },
          ]}
          choices={[
            {
              name: 'photo_policy',
              label: 'Photos',
              options: [
                ['card_only', 'Photo sur la carte seulement'],
                ['no_photo', 'Aucune photo'],
              ],
            },
          ]}
          submitLabel="Enregistrer (producteurs informés)"
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            const res = await act(
              {
                action: 'record_agreement',
                assignment_id: dialog.mandate.id,
                cooperative_signatory: v.cooperative_signatory,
                operator_signatory: v.operator_signatory,
                signed_on: v.signed_on,
                producers_informed: true,
                photo_policy: v.photo_policy || 'card_only',
                document_reference: v.document_reference || undefined,
              },
              'Convention enregistrée',
            )
            return res ? '' : null
          }}
        />
      )}
      {dialog?.kind === 'release' && (
        <FormDialog
          title="Rendre le crédit d’une carte"
          description="Pour une carte émise par erreur : la carte est révoquée et son crédit revient à l’opérateur. Une seule fois par carte."
          fields={[
            { name: 'member_card_id', label: 'Identifiant de la carte (uuid)' },
            { name: 'reason', label: 'Motif', multiline: true },
          ]}
          submitLabel="Révoquer et rendre le crédit"
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            const res = await act(
              { action: 'release_card', member_card_id: v.member_card_id.trim(), reason: v.reason },
              'Crédit rendu',
            )
            return res ? '' : null
          }}
        />
      )}
    </div>
  )
}

const NEXT_STATUS: Record<string, { value: string; label: string }> = {
  paid: { value: 'in_production', label: 'En fabrication' },
  in_production: { value: 'shipped', label: 'Expédiée' },
  shipped: { value: 'delivered', label: 'Livrée' },
}

function Kpi({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}

function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Aucune carte commerciale.</p>
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between gap-3">
            <span className="truncate text-foreground">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{r.value}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function RectificationActions({
  open,
  onAct,
}: {
  open: boolean
  onAct: (status: string, resolution?: string) => void
}) {
  const [text, setText] = useState('')
  return (
    <div className="flex flex-col gap-2 pt-1 sm:flex-row">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Résolution (ce qui a été corrigé)"
        className="h-9 flex-1"
      />
      {open && (
        <Button size="sm" variant="outline" onClick={() => onAct('in_progress')}>
          Prendre en charge
        </Button>
      )}
      <Button size="sm" onClick={() => onAct('resolved', text.trim() || undefined)}>
        Corrigée
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onAct('rejected', text.trim() || undefined)}>
        Refuser
      </Button>
    </div>
  )
}

interface Field {
  name: string
  label: string
  type?: string
  placeholder?: string
  optional?: boolean
  multiline?: boolean
}

function FormDialog({
  title,
  description,
  fields,
  choices = [],
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string
  description: string
  fields: Field[]
  choices?: { name: string; label: string; options: [string, string][] }[]
  submitLabel: string
  onClose: () => void
  /** Renvoie null en cas d'échec (la fenêtre reste ouverte), un texte à afficher sinon. */
  onSubmit: (values: Record<string, string>) => Promise<string | null>
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(choices.map((c) => [c.name, c.options[0][0]])),
  )
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const ready = fields.every((f) => f.optional || (values[f.name] ?? '').trim())

  const submit = async () => {
    setBusy(true)
    const out = await onSubmit(values)
    setBusy(false)
    if (out === null) return
    if (out) setResult(out)
    else onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {result ? (
          <p className="break-all rounded-lg bg-muted p-3 font-mono text-xs">{result}</p>
        ) : (
          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={`f-${f.name}`}>{f.label}</Label>
                {f.multiline ? (
                  <Textarea
                    id={`f-${f.name}`}
                    rows={2}
                    value={values[f.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                ) : (
                  <Input
                    id={`f-${f.name}`}
                    type={f.type ?? 'text'}
                    placeholder={f.placeholder}
                    value={values[f.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            {choices.map((c) => (
              <div key={c.name} className="space-y-1.5">
                <Label>{c.label}</Label>
                <Select
                  value={values[c.name]}
                  onValueChange={(val) => setValues((v) => ({ ...v, [c.name]: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {c.options.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            {result ? 'Fermer' : 'Annuler'}
          </Button>
          {!result && (
            <Button onClick={submit} disabled={busy || !ready}>
              {busy ? <Spinner className="h-4 w-4" /> : submitLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
