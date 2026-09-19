'use client'

/**
 * Espace Opérateur — entrée du troisième espace produit (§17 du plan).
 *
 * Volontairement minimal : PR 1 ne livre que les fondations (schéma, gardes,
 * routage d'espace). Le tableau de bord Opérateur complet — mandats en
 * cours, cartes physiques imprimées, portefeuille PAYG — arrive en PR 4,
 * une fois PR 2 (facturation) et PR 3 (carte physique) posés dessous.
 *
 * Ce que cette page garantit dès maintenant :
 *   - un compte organisationnel ou Haroo peut se porter candidat sans
 *     quitter son espace actuel (§18 — aucune exclusion mutuelle réintroduite,
 *     contrairement au problème déjà réglé entre /dashboard et /haroo) ;
 *   - la certification est visible pour ce qu'elle est : un parcours
 *     (formation → examen → paiement → validation), jamais un privilège
 *     accordé au clic (§25).
 */

import { ProtectedRoute } from '@/app/components/protected-route'
import { useAuth } from '@/app/context/auth-context'
import { Spinner } from '@/components/shared/loading'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { performLogout } from '@/lib/auth/logout'
import type { PartnerLedgerEntryType, PartnerStatus } from '@/types/domain'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Award,
  Briefcase,
  CheckCircle2,
  Clock,
  GraduationCap,
  LogOut,
  PackageCheck,
  Printer,
  ShieldAlert,
  Truck,
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

const STATUS_LABEL: Record<PartnerStatus, string> = {
  candidate: 'Candidature enregistrée',
  training: 'Formation en cours',
  exam_pending: 'Évaluation pratique en attente',
  certified: 'Certifié — paiement des frais en attente',
  active: 'Opérateur actif',
  suspended: 'Suspendu',
  expired: 'Certification expirée',
  revoked: 'Révoqué',
}

const STATUS_STEP: Record<PartnerStatus, number> = {
  candidate: 1,
  training: 2,
  exam_pending: 3,
  certified: 4,
  active: 5,
  suspended: 4,
  expired: 4,
  revoked: 0,
}

function OperatorHeader() {
  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
      <Logo size="md" />
      <Button variant="ghost" size="sm" onClick={() => performLogout()}>
        <LogOut className="mr-1.5 h-4 w-4" /> Déconnexion
      </Button>
    </header>
  )
}

/** Parcours de certification : formation gratuite → examen → 15 000 XOF → validation (§9, §24 du plan). */
function CertificationProgress({ status }: { status: PartnerStatus }) {
  const step = STATUS_STEP[status]
  const steps = [
    { n: 1, label: 'Candidature' },
    { n: 2, label: 'Formation (gratuite)' },
    { n: 3, label: 'Évaluation pratique' },
    { n: 4, label: 'Frais de certification — 15 000 XOF' },
    { n: 5, label: 'Opérateur actif' },
  ]
  return (
    <ol className="space-y-3">
      {steps.map((s) => {
        const done = step > s.n
        const current = step === s.n
        return (
          <li key={s.label} className="flex items-center gap-3">
            {done ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
            ) : current ? (
              <Clock className="h-5 w-5 shrink-0 text-amber-500" />
            ) : (
              <div className="h-5 w-5 shrink-0 rounded-full border-2 border-border" />
            )}
            <span
              className={current ? 'font-medium text-foreground' : 'text-sm text-muted-foreground'}
            >
              {s.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Bouton de paiement de certification — n'apparaît que si formation et examen
 * sont déjà validés (§9, §24 du plan). Redirige vers la page de paiement
 * hébergée CinetPay ; le statut ne changera qu'au retour du callback.
 */
function CertificationPayment({ eligible }: { eligible: boolean }) {
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!eligible) return null

  const pay = async () => {
    if (!phone.trim()) {
      setError('Indiquez le numéro mobile money à utiliser.')
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
        Formation et examen validés — reste le paiement des frais de certification (15 000 XOF).
      </p>
      <div className="space-y-2">
        <Label htmlFor="cert-phone">Numéro mobile money</Label>
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

  return (
    <div className="min-h-screen bg-background">
      <OperatorHeader />
      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Espace Opérateur</h1>
              <p className="text-sm text-muted-foreground">Bonjour {user?.firstName ?? ''}</p>
            </div>
          </div>
          {/* Accessible sans candidature déposée — la formation n'exige aucune
              couche organisationnelle ni Haroo (cf. academy_profile_progress). */}
          <Button variant="ghost" size="sm" asChild>
            <Link href="/operator/training">
              <GraduationCap className="mr-1.5 h-4 w-4" /> Formation
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : status?.has_applied && status.status ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-foreground">
                <span className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" /> {status.display_name}
                </span>
                {status.partner_code && (
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono text-muted-foreground">
                    {status.partner_code}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm font-medium text-foreground">{STATUS_LABEL[status.status]}</p>
              {status.status === 'revoked' || status.status === 'suspended' ? (
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <ShieldAlert className="h-4 w-4" /> Contactez l'équipe FaîtiereHub pour plus
                  d'informations.
                </p>
              ) : (
                <>
                  <CertificationProgress status={status.status} />
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/operator/training">
                      <GraduationCap className="mr-1.5 h-4 w-4" />
                      {status.training_completed_at
                        ? 'Revoir la formation'
                        : 'Aller à la formation'}
                    </Link>
                  </Button>
                  <CertificationPayment
                    eligible={
                      !!status.training_completed_at &&
                      !!status.exam_passed_at &&
                      !status.certified_at
                    }
                  />
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <ApplicationForm onApplied={load} />
        )}

        {status?.has_applied &&
          status.status &&
          (status.status === 'certified' || status.status === 'active') && (
            <div className="mt-6">
              <WalletCard />
            </div>
          )}

        {status?.status === 'active' && (
          <div className="mt-6">
            <PrintQueueCard />
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
