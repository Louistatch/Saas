'use client'

/**
 * Espace Opérateur — l'entrée du troisième espace produit (§17 du plan).
 *
 * Ce que cette page garantit :
 *   - un compte organisationnel ou Haroo peut se porter candidat sans quitter son espace
 *     actuel (§18 — aucune exclusion mutuelle réintroduite) ;
 *   - la certification est visible pour ce qu'elle est : un parcours (formation → évaluation
 *     → paiement → validation), jamais un privilège accordé au clic (§25) ;
 *   - la personne voit d'abord où elle en est et ce qu'elle a à faire maintenant ; le reste
 *     (portefeuille, impression, validation) n'apparaît qu'une fois opérateur actif.
 *
 * Dessin : une carte d'opérateur (vert profond, le code du dossier imprimé dessus, comme la
 * carte physique que l'opérateur imprimera pour les membres), puis le parcours tracé comme une
 * route. Mouvement : une seule entrée orchestrée, la ligne du parcours qui se trace (skill
 * ui-motion). Partage : la formation se recommande sur WhatsApp (components/operator/share-training).
 */

import { ProtectedRoute } from '@/app/components/protected-route'
import { useAuth } from '@/app/context/auth-context'
import { Journey, journeySteps } from '@/components/operator/journey'
import { ShareTraining } from '@/components/operator/share-training'
import { Spinner } from '@/components/shared/loading'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { performLogout } from '@/lib/auth/logout'
import {
  CERTIFICATION_RESULT_COPY,
  type CertificationResult,
  STAGE_COPY,
  STAGE_STEP,
  operatorStage,
  parseCertificationResult,
} from '@/lib/partners/stage'
import type { PartnerLedgerEntryType, PartnerStatus } from '@/types/domain'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Award,
  CheckCircle2,
  GraduationCap,
  LogOut,
  MessageCircle,
  PackageCheck,
  Printer,
  ShieldAlert,
  Truck,
  UserCheck,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

interface PartnerStatusResponse {
  has_applied: boolean
  partner_id?: string
  partner_code?: string
  display_name?: string
  status?: PartnerStatus
  training_completed_at?: string | null
  exam_passed_at?: string | null
  certified_at?: string | null
  training?: { lessons_completed: number; lessons_total: number } | null
}

interface WalletLedgerRow {
  id: string
  entry_type: PartnerLedgerEntryType
  amount_fcfa: number
  balance_after: number
  note: string | null
  created_at: string
}

interface WalletResponse {
  balance_fcfa: number
  updated_at: string | null
  ledger: WalletLedgerRow[]
}

/** Entrée de page orchestrée : chaque bloc arrive dans l'ordre de lecture (skill ui-motion). */
const enter = (rank: number) =>
  `motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-300 motion-safe:ease-out motion-safe:[animation-delay:${rank * 70}ms]`

function OperatorHeader() {
  return (
    <header className="flex items-center justify-between px-4 py-3 sm:px-6">
      <Logo size="md" />
      <Button variant="ghost" size="sm" onClick={() => performLogout()}>
        <LogOut className="mr-1.5 h-4 w-4" /> Déconnexion
      </Button>
    </header>
  )
}

/**
 * La carte d'opérateur : nom du dossier, code, état, prochaine action. Vert profond comme
 * la console de validation installée sur le téléphone (operator.webmanifest).
 */
function OperatorCard({ status, firstName }: { status: PartnerStatusResponse; firstName: string }) {
  const copy = status.status
    ? STAGE_COPY[operatorStage({ ...status, status: status.status })]
    : null
  return (
    <section
      aria-labelledby="operator-card-title"
      className="relative overflow-hidden rounded-3xl bg-[#0d3d22] px-5 pb-5 pt-6 text-white shadow-[0_18px_40px_-24px_rgba(13,61,34,0.9)] sm:px-7 sm:pt-7"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full border-[18px] border-white/[0.06]"
      />
      <p className="text-sm text-white/70">Bonjour {firstName}</p>
      <div className="mt-1 flex items-start justify-between gap-4">
        <h1 id="operator-card-title" className="text-2xl font-bold leading-tight tracking-tight">
          {status.display_name}
        </h1>
        {status.partner_code && (
          <span className="shrink-0 rounded-md border border-white/25 px-2 py-1 font-mono text-xs tracking-wider text-white/90">
            {status.partner_code}
          </span>
        )}
      </div>
      {copy && (
        <div className="mt-5 border-t border-white/15 pt-4">
          <p className="text-base font-semibold">{copy.state}</p>
          <p className="mt-1 text-sm leading-relaxed text-white/80">{copy.next}</p>
        </div>
      )}
    </section>
  )
}

/**
 * Bouton de paiement de certification — n'apparaît que si formation et examen
 * sont déjà validés (§9, §24 du plan). Redirige vers la page de paiement
 * hébergée FedaPay ; le statut ne change qu'une fois la transaction relue
 * auprès de FedaPay (retour ou notification).
 */
function CertificationPayment({ eligible }: { eligible: boolean }) {
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!eligible) return null

  const pay = async () => {
    if (!phone.trim()) {
      setError('Indiquez votre numéro de téléphone.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/partner/certification/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.payment_url) {
        setError(body.error ?? 'Paiement impossible pour le moment.')
        setSubmitting(false)
        return
      }
      window.location.href = body.payment_url
    } catch {
      setError('Erreur de connexion. Vérifiez votre internet.')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-300/60 bg-amber-50/40 p-4">
      <p className="text-sm font-medium text-foreground">
        Formation et évaluation validées. Il reste les frais de certification, 15 000 XOF, à régler
        par Mobile Money ou carte bancaire sur la page de paiement sécurisée FedaPay.
      </p>
      <div className="space-y-2">
        <Label htmlFor="cert-phone">Votre numéro de téléphone</Label>
        <Input
          id="cert-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+228 90 00 00 00"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={pay} disabled={submitting} className="w-full">
        {submitting ? <Spinner className="h-4 w-4" /> : 'Payer 15 000 XOF'}
      </Button>
    </div>
  )
}

/**
 * Message au retour de la page de paiement FedaPay. Le paramètre est retiré de l'adresse pour
 * qu'un rechargement ne réaffiche pas un résultat périmé.
 */
function CertificationResultBanner({
  value,
  onClose,
}: {
  value: { result: CertificationResult; ref: string | null }
  onClose: () => void
}) {
  const copy = CERTIFICATION_RESULT_COPY[value.result]
  const tone =
    copy.tone === 'ok'
      ? 'border-primary/40 bg-primary/5'
      : copy.tone === 'wait'
        ? 'border-amber-300/60 bg-amber-50/40'
        : 'border-destructive/40 bg-destructive/5'
  return (
    <div aria-live="polite" className={`mt-6 space-y-2 rounded-xl border p-4 ${tone}`}>
      <p className="text-sm font-semibold text-foreground">{copy.title}</p>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {value.result === 'pending' && value.ref && (
          <Button size="sm" asChild>
            <a href={`/api/payments/fedapay/return?certification=${value.ref}`}>
              Vérifier le paiement
            </a>
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  )
}

const ENTRY_LABEL: Record<PartnerLedgerEntryType, string> = {
  CREDIT: 'Rechargement',
  DEBIT: 'Débit',
  REFUND: 'Remboursement',
  REVERSAL: 'Correction',
  ADJUSTMENT: 'Ajustement',
  BONUS: 'Bonus',
}

/**
 * Portefeuille PAYG — n'affiche que le solde et les dernières écritures.
 * Le tableau de bord complet (filtres, export, rechargement en plusieurs
 * montants prédéfinis) reste un chantier PR 4 ; ceci prouve seulement que le
 * crédit/débit atomique posé par la migration fonctionne de bout en bout.
 */
function WalletCard() {
  const [wallet, setWallet] = useState<WalletResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('5000')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    fetch('/api/partner/wallet')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WalletResponse | null) => setWallet(d))
      .catch(() => setWallet(null))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const topup = async () => {
    const amountFcfa = Number.parseInt(amount, 10)
    if (!Number.isFinite(amountFcfa) || amountFcfa < 1000) {
      setError('Montant minimum : 1 000 FCFA.')
      return
    }
    if (!wallet) return
    if (!phone.trim()) {
      setError('Indiquez le numéro mobile money à utiliser.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/partner/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_fcfa: amountFcfa, phone: phone.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.payment_url) {
        setError(body.error ?? 'Rechargement impossible pour le moment.')
        setSubmitting(false)
        return
      }
      window.location.href = body.payment_url
    } catch {
      setError('Erreur de connexion. Vérifiez votre internet.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Wallet className="h-5 w-5 text-primary" /> Portefeuille PAYG
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-3xl font-bold text-foreground">
          {(wallet?.balance_fcfa ?? 0).toLocaleString('fr-FR')}{' '}
          <span className="text-base font-normal text-muted-foreground">FCFA</span>
        </p>

        <div className="flex gap-2">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
            className="w-28"
            aria-label="Montant à recharger (FCFA)"
          />
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+228 90 00 00 00"
            className="flex-1"
            aria-label="Numéro mobile money"
          />
          <Button onClick={topup} disabled={submitting}>
            {submitting ? <Spinner className="h-4 w-4" /> : 'Recharger'}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {wallet && wallet.ledger.length > 0 && (
          <ul className="divide-y divide-border">
            {wallet.ledger.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2">
                  {entry.amount_fcfa >= 0 ? (
                    <ArrowUpCircle className="h-4 w-4 text-primary" />
                  ) : (
                    <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  {ENTRY_LABEL[entry.entry_type]}
                </span>
                <span
                  className={
                    entry.amount_fcfa >= 0
                      ? 'font-medium text-primary'
                      : 'font-medium text-foreground'
                  }
                >
                  {entry.amount_fcfa >= 0 ? '+' : ''}
                  {entry.amount_fcfa.toLocaleString('fr-FR')} FCFA
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

interface PrintQueueMember {
  first_name: string | null
  last_name: string | null
}

interface PrintQueueItem {
  id: string
  member_id: string
  printed_at: string | null
  reprint_count: number
  members: PrintQueueMember | null
}

interface PrintQueueOrder {
  id: string
  cooperative_id: string
  status: 'paid' | 'printed'
  amount_fcfa: number
  cooperatives: { name: string } | null
  card_print_order_items: PrintQueueItem[]
}

/**
 * File d'impression du Partenaire (§48 du plan). Marquer une carte imprimée
 * appelle directement lib/cards/print-orders.ts côté serveur ; ceci ne fait
 * qu'afficher l'état et déclencher l'action, jamais de logique métier ici.
 */
function PrintQueueCard() {
  const [orders, setOrders] = useState<PrintQueueOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/partner/print-queue')
      .then((r) => (r.ok ? r.json() : { orders: [] }))
      .then((d: { orders: PrintQueueOrder[] }) => setOrders(d.orders ?? []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const markPrinted = async (orderId: string, itemId: string) => {
    setActingId(itemId)
    await fetch(`/api/partner/print-queue/${orderId}/items/${itemId}/print`, { method: 'POST' })
    await load()
    setActingId(null)
  }

  const deliver = async (orderId: string) => {
    setActingId(orderId)
    await fetch(`/api/partner/print-queue/${orderId}/deliver`, { method: 'POST' })
    await load()
    setActingId(null)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  if (orders.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Printer className="h-5 w-5 text-primary" /> File d'impression
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {orders.map((order) => {
          const allPrinted = order.card_print_order_items.every((i) => i.printed_at)
          return (
            <div key={order.id} className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">{order.cooperatives?.name ?? '—'}</p>
                <span className="text-xs text-muted-foreground">
                  {order.card_print_order_items.length} carte(s) —{' '}
                  {order.amount_fcfa.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
              <ul className="divide-y divide-border">
                {order.card_print_order_items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-foreground">
                      {item.members?.first_name} {item.members?.last_name}
                    </span>
                    {item.printed_at ? (
                      <span className="flex items-center gap-1 text-primary">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Imprimée
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actingId === item.id}
                        onClick={() => markPrinted(order.id, item.id)}
                      >
                        <PackageCheck className="mr-1.5 h-3.5 w-3.5" /> Marquer imprimée
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {allPrinted && order.status === 'printed' && (
                <Button
                  size="sm"
                  disabled={actingId === order.id}
                  onClick={() => deliver(order.id)}
                  className="w-full"
                >
                  <Truck className="mr-1.5 h-4 w-4" /> Marquer livrée
                </Button>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function ApplicationForm({ onApplied }: { onApplied: () => void }) {
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!displayName.trim()) {
      setError('Indiquez votre nom ou celui de votre structure.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/account/apply-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? "Candidature impossible pour l'instant.")
        setSubmitting(false)
        return
      }
      onApplied()
    } catch {
      setError('Erreur de connexion. Vérifiez votre internet.')
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Award className="h-5 w-5 text-primary" /> Devenir Opérateur certifié FaîtiereHub
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Formation gratuite via AgriAcademy, puis évaluation pratique. La certification coûte 15
          000 XOF, payés une fois l'examen validé — jamais avant, jamais pour recruter d'autres
          opérateurs.
        </p>
        <div className="space-y-2">
          <Label htmlFor="op-name">Nom ou structure</Label>
          <Input
            id="op-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ex. Kokou Agro-Services"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="op-phone">Téléphone (optionnel)</Label>
          <Input
            id="op-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+228 90 00 00 00"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={submit} disabled={submitting} className="w-full">
          {submitting ? <Spinner className="h-4 w-4" /> : 'Déposer ma candidature'}
        </Button>
      </CardContent>
    </Card>
  )
}

function OperatorPageContent() {
  const { user } = useAuth()
  const [status, setStatus] = useState<PartnerStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetch('/api/account/partner-status')
      .then((r) => (r.ok ? r.json() : { has_applied: false }))
      .then((d: PartnerStatusResponse) => setStatus(d))
      .catch(() => setStatus({ has_applied: false }))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const [payResult, setPayResult] = useState<ReturnType<typeof parseCertificationResult>>(null)
  useEffect(() => {
    const parsed = parseCertificationResult(window.location.search)
    if (!parsed) return
    setPayResult(parsed)
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const closed =
    status?.status === 'revoked' || status?.status === 'suspended' || status?.status === 'expired'
  const paymentDue =
    !!status?.training_completed_at && !!status.exam_passed_at && !status.certified_at

  return (
    <div className="min-h-screen bg-background">
      <OperatorHeader />
      <main className="mx-auto max-w-xl px-4 pb-32 pt-2 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-16" aria-busy="true">
            <Spinner className="h-6 w-6" />
          </div>
        ) : status?.has_applied && status.status ? (
          <>
            <div className={enter(0)}>
              <OperatorCard status={status} firstName={user?.firstName ?? ''} />
            </div>

            {payResult && (
              <CertificationResultBanner value={payResult} onClose={() => setPayResult(null)} />
            )}

            {closed ? (
              <p className={`mt-6 flex items-start gap-2 text-sm text-destructive ${enter(1)}`}>
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Ce dossier n'avance plus pour le moment. Le bouton « Écrire à l'équipe » en bas de
                l'écran vous met en relation avec FaîtiereHub.
              </p>
            ) : (
              <section className={`mt-8 ${enter(1)}`} aria-labelledby="journey-title">
                <h2 id="journey-title" className="mb-2 text-base font-semibold text-foreground">
                  Votre parcours
                </h2>
                <Journey
                  current={STAGE_STEP[operatorStage({ ...status, status: status.status })]}
                  steps={journeySteps({
                    status: status.status,
                    training_completed_at: status.training_completed_at,
                    exam_passed_at: status.exam_passed_at,
                    certified_at: status.certified_at,
                    training: status.training ?? null,
                    trainingAction: (
                      <Button className="min-h-11 w-full rounded-full sm:w-auto sm:px-6" asChild>
                        <Link href="/operator/training">
                          <GraduationCap className="mr-1.5 h-4 w-4" />
                          {status.status === 'training'
                            ? 'Continuer la formation'
                            : 'Commencer la formation'}
                        </Link>
                      </Button>
                    ),
                    paymentAction: <CertificationPayment eligible={paymentDue} />,
                  })}
                />
                {status.training_completed_at && (
                  <Button variant="ghost" size="sm" className="mt-2" asChild>
                    <Link href="/operator/training">
                      <GraduationCap className="mr-1.5 h-4 w-4" /> Revoir la formation
                    </Link>
                  </Button>
                )}
              </section>
            )}

            {(status.status === 'certified' || status.status === 'active') && (
              <div className={`mt-8 ${enter(2)}`}>
                <WalletCard />
              </div>
            )}

            {status.status === 'active' && (
              <div className={`mt-6 space-y-3 ${enter(3)}`}>
                <PrintQueueCard />
                <Button variant="outline" className="min-h-11 w-full" asChild>
                  <Link href="/operator/professionals">
                    <UserCheck className="mr-1.5 h-4 w-4" /> Professionnels à valider
                  </Link>
                </Button>
                <Button variant="outline" className="min-h-11 w-full" asChild>
                  <Link href="/operator/messages">
                    <MessageCircle className="mr-1.5 h-4 w-4" /> Messages de votre zone
                  </Link>
                </Button>
              </div>
            )}

            <ShareTraining className={`mt-10 border-t border-border pt-6 ${enter(2)}`} />
          </>
        ) : (
          <div className={enter(0)}>
            <ApplicationForm onApplied={load} />
          </div>
        )}
      </main>
    </div>
  )
}

export default function OperatorPage() {
  return (
    <ProtectedRoute>
      <OperatorPageContent />
    </ProtectedRoute>
  )
}
