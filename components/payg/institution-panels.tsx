'use client'

/**
 * Console institution, suite : activité par agent, formation de l'équipe (l'institution
 * peut régler les tranches de ses agents), rapports CSV et commandes FaîtièreHub Print.
 */

import { Spinner } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
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
import { formatFcfa, trainingChoices } from '@/lib/payg/model'
import { Download, Printer } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, formatDate, formatDateTime, withPartner } from './api'
import { TrainingProgress } from './training-panel'
import type { ActivityEntry, AgentRow, IssuedCard, PaygMe, PrintOrder } from './types'

export function ActivityPanel({ partnerId }: { partnerId: string }) {
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [agent, setAgent] = useState('all')
  const [rows, setRows] = useState<ActivityEntry[] | null>(null)

  useEffect(() => {
    api<{ agents: AgentRow[] }>(withPartner('/api/institution/agents', partnerId)).then(
      (res) => res.ok && setAgents(res.data.agents),
    )
  }, [partnerId])

  useEffect(() => {
    setRows(null)
    const url = withPartner(
      `/api/institution/activity${agent === 'all' ? '' : `?agent_id=${agent}`}`,
      partnerId,
    )
    api<{ activity: ActivityEntry[] }>(url).then((res) => setRows(res.ok ? res.data.activity : []))
  }, [partnerId, agent])

  return (
    <section aria-labelledby="activity-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="activity-title" className="text-base font-semibold text-foreground">
          Activité
        </h2>
        <Select value={agent} onValueChange={setAgent}>
          <SelectTrigger className="h-10 w-full sm:w-64" aria-label="Agent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toute l’équipe</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.user_id} value={a.user_id}>
                {a.name || a.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {rows === null ? (
        <div className="flex justify-center py-8" aria-busy="true">
          <Spinner className="h-5 w-5" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Aucune activité enregistrée.
        </p>
      ) : (
        <ol className="divide-y divide-border rounded-2xl border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block text-foreground">{r.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {r.actor}
                  {r.cooperative ? `, ${r.cooperative}` : ''}
                </span>
              </span>
              <time dateTime={r.at} className="shrink-0 text-xs text-muted-foreground">
                {formatDateTime(r.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

interface TeamAccount {
  id: string
  user_id: string
  name: string
  total_fcfa: number
  installment_fcfa: number
  paid_fcfa: number
  payer: 'self' | 'institution'
  status: 'unpaid' | 'partial' | 'paid' | 'waived'
  certified_at: string | null
}

export function TeamTrainingPanel({ partnerId }: { partnerId: string }) {
  const [accounts, setAccounts] = useState<TeamAccount[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ accounts: TeamAccount[] }>(withPartner('/api/payg/training', partnerId)).then((res) =>
      setAccounts(res.ok ? res.data.accounts : []),
    )
  }, [partnerId])

  const pay = async (account: TeamAccount, amount: number) => {
    setBusy(`${account.id}-${amount}`)
    setError('')
    const res = await api<{ payment_url: string }>('/api/payg/training/checkout', {
      body: { account_id: account.id, amount_fcfa: amount },
    })
    if (!res.ok) {
      setError(res.error)
      setBusy(null)
      return
    }
    window.location.href = res.data.payment_url
  }

  const due = (accounts ?? []).reduce((s, a) => s + (a.total_fcfa - a.paid_fcfa), 0)

  return (
    <section aria-labelledby="team-training-title" className="space-y-3">
      <div>
        <h2 id="team-training-title" className="text-base font-semibold text-foreground">
          Formation de l’équipe
        </h2>
        <p className="text-sm text-muted-foreground">
          15 000 FCFA par personne formée, en une fois ou en 5 tranches de 3 000. Ces paiements ne
          donnent aucun crédit de carte.
          {accounts && due > 0 ? ` Reste dû pour l’équipe : ${formatFcfa(due)}.` : ''}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {accounts === null ? (
        <div className="flex justify-center py-8" aria-busy="true">
          <Spinner className="h-5 w-5" />
        </div>
      ) : accounts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Aucun dossier de formation dans l’équipe.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {accounts.map((a) => {
            const choices =
              a.payer === 'institution'
                ? trainingChoices(a.total_fcfa - a.paid_fcfa, a.installment_fcfa)
                : []
            return (
              <li key={a.id} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-foreground">{a.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {a.payer === 'institution' ? 'Payée par l’institution' : 'Payée par l’agent'}
                  </span>
                </div>
                <TrainingProgress account={a} />
                {choices.length > 0 && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {choices.map((c) => (
                      <Button
                        key={c.amount}
                        size="sm"
                        variant="outline"
                        className="min-h-10"
                        disabled={busy !== null}
                        onClick={() => pay(a, c.amount)}
                      >
                        {busy === `${a.id}-${c.amount}` ? <Spinner className="h-4 w-4" /> : c.label}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const REPORTS = [
  { type: 'cards', label: 'Cartes émises', hint: 'producteur, coopérative, agent, crédit' },
  { type: 'credits', label: 'Crédits', hint: 'achats, consommations, solde' },
  { type: 'training', label: 'Formation', hint: 'montants réglés et restants par agent' },
  { type: 'activity', label: 'Journal d’activité', hint: 'consultations, émissions, impressions' },
] as const

export function ReportsPanel({ partnerId }: { partnerId: string }) {
  return (
    <section aria-labelledby="reports-title" className="space-y-3">
      <h2 id="reports-title" className="text-base font-semibold text-foreground">
        Rapports
      </h2>
      <p className="text-sm text-muted-foreground">
        Fichiers CSV lisibles par Excel, pour votre comptabilité et vos bailleurs.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <li key={r.type}>
            <a
              href={withPartner(`/api/institution/reports?type=${r.type}`, partnerId)}
              className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>
                <span className="block text-sm font-medium text-foreground">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.hint}</span>
              </span>
              <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

const ORDER_STATUS: Record<string, string> = {
  quote_requested: 'Devis demandé',
  quoted: 'Devis prêt',
  paid: 'Payée',
  in_production: 'En fabrication',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
}

export function PrintOrdersPanel({ me }: { me: PaygMe }) {
  const partnerId = me.current?.partner_id ?? ''
  const [orders, setOrders] = useState<PrintOrder[] | null>(null)
  const [ordering, setOrdering] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const res = await api<{ orders: PrintOrder[] }>(
      withPartner('/api/payg/print-orders', partnerId),
    )
    setOrders(res.ok ? res.data.orders : [])
  }, [partnerId])

  useEffect(() => {
    void load()
  }, [load])

  const pay = async (order: PrintOrder) => {
    setBusy(order.id)
    setError('')
    const res = await api<{ payment_url: string }>(`/api/payg/print-orders/${order.id}/checkout`, {
      body: { partner_id: partnerId },
    })
    if (!res.ok) {
      setError(res.error)
      setBusy(null)
      return
    }
    window.location.href = res.data.payment_url
  }

  return (
    <section aria-labelledby="print-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="print-title" className="text-base font-semibold text-foreground">
            FaîtièreHub Print
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Faites fabriquer et livrer des cartes déjà émises. Le devis (fabrication et livraison)
            s’ajoute à la commission déjà prise : aucun crédit n’est repris. La livraison n’est
            jamais gratuite d’office.
          </p>
        </div>
        <Button className="min-h-11" onClick={() => setOrdering(true)}>
          <Printer className="mr-1.5 h-4 w-4" /> Commander
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {orders === null ? (
        <div className="flex justify-center py-8" aria-busy="true">
          <Spinner className="h-5 w-5" />
        </div>
      ) : orders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Aucune commande. Vous pouvez aussi imprimer vous-même chaque carte depuis la liste des
          cartes émises.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {orders.map((o) => (
            <li key={o.id} className="space-y-1 px-4 py-3 text-sm">
              <p className="flex justify-between gap-3">
                <span className="text-foreground">
                  {o.cards} carte{o.cards > 1 ? 's' : ''}{' '}
                  {o.card_format === 'pvc' ? 'PVC' : `plastifiée${o.cards > 1 ? 's' : ''}`}
                </span>
                <span className="shrink-0 font-medium text-foreground">
                  {ORDER_STATUS[o.status] ?? o.status}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Commandée le {formatDate(o.created_at)}, livraison : {o.delivery_address}
              </p>
              {o.total_fcfa !== null && (
                <p className="text-xs text-muted-foreground">
                  Fabrication {formatFcfa(o.fabrication_fcfa ?? 0)}, livraison{' '}
                  {formatFcfa(o.delivery_fcfa ?? 0)}, total {formatFcfa(o.total_fcfa)}
                  {o.quote_note ? `. ${o.quote_note}` : ''}
                </p>
              )}
              {o.status === 'quoted' && (o.total_fcfa ?? 0) > 0 && (
                <Button
                  size="sm"
                  className="mt-1 min-h-10"
                  disabled={busy !== null}
                  onClick={() => pay(o)}
                >
                  {busy === o.id ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    `Payer ${formatFcfa(o.total_fcfa ?? 0)}`
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {ordering && (
        <OrderDialog
          partnerId={partnerId}
          onClose={() => setOrdering(false)}
          onOrdered={() => {
            setOrdering(false)
            void load()
          }}
        />
      )}
    </section>
  )
}

function OrderDialog({
  partnerId,
  onClose,
  onOrdered,
}: {
  partnerId: string
  onClose: () => void
  onOrdered: () => void
}) {
  const [cards, setCards] = useState<IssuedCard[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [format, setFormat] = useState<'plastified' | 'pvc'>('pvc')
  const [address, setAddress] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ cards: IssuedCard[] }>(withPartner('/api/payg/cards?limit=500', partnerId)).then((res) =>
      setCards(
        res.ok
          ? res.data.cards.filter(
              (c) => c.commission_status === 'consumed' && c.card_status === 'active',
            )
          : [],
      ),
    )
  }, [partnerId])

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const order = async () => {
    setBusy(true)
    setError('')
    const res = await api('/api/payg/print-orders', {
      body: {
        partner_id: partnerId,
        card_ids: [...selected],
        card_format: format,
        delivery_address: address.trim(),
        delivery_contact: contact.trim(),
      },
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onOrdered()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Commander l’impression</DialogTitle>
          <DialogDescription>
            Choisissez des cartes commerciales déjà émises. FaîtièreHub vous envoie un devis avant
            tout paiement.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {cards === null ? (
            <Spinner className="h-5 w-5" />
          ) : cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune carte commerciale émise pour l’instant.
            </p>
          ) : (
            <fieldset className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              <legend className="sr-only">Cartes à imprimer</legend>
              {cards.map((c) => (
                <label
                  key={c.member_card_id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.member_card_id)}
                    onChange={() => toggle(c.member_card_id)}
                    className="h-4 w-4 accent-[#0d3d22]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{c.producer}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.card_number}, {c.cooperative}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="order-format">Support</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
              <SelectTrigger id="order-format" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pvc">PVC</SelectItem>
                <SelectItem value="plastified">Plastifiée</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-address">Adresse de livraison</Label>
            <Input
              id="order-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ville, quartier, repère"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-contact">Contact sur place</Label>
            <Input
              id="order-contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Nom et téléphone"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            className="min-h-11"
            onClick={order}
            disabled={
              busy || selected.size === 0 || address.trim().length < 5 || contact.trim().length < 5
            }
          >
            {busy ? (
              <Spinner className="h-4 w-4" />
            ) : (
              `Demander un devis (${selected.size} carte${selected.size > 1 ? 's' : ''})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
