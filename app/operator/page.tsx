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
import type { PartnerStatus } from '@/types/domain'
import {
  Award,
  Briefcase,
  CheckCircle2,
  Clock,
  GraduationCap,
  LogOut,
  ShieldAlert,
} from 'lucide-react'
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
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Espace Opérateur</h1>
            <p className="text-sm text-muted-foreground">Bonjour {user?.firstName ?? ''}</p>
          </div>
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
                <CertificationProgress status={status.status} />
              )}
            </CardContent>
          </Card>
        ) : (
          <ApplicationForm onApplied={load} />
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
