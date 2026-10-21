'use client'

/**
 * Formation de la personne connectée : 15 000 FCFA, en une fois ou en tranches de 3 000.
 * Séparée des crédits : un paiement de formation ne crée jamais de crédit, et inversement.
 * Quand l'institution paie, l'agent le voit et n'a rien à régler.
 */

import { Spinner } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatFcfa, trainingChoices } from '@/lib/payg/model'
import { GraduationCap } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { api } from './api'
import type { PaygMe, TrainingAccount } from './types'

export function TrainingPanel({ me }: { me: PaygMe }) {
  const account = me.training
  const cert = me.certification
  if (!account) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Aucun dossier de formation n’est ouvert sur ce compte.
      </p>
    )
  }
  return (
    <section aria-labelledby="training-title" className="space-y-5">
      <div>
        <h2 id="training-title" className="text-base font-semibold text-foreground">
          Ma formation
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          La formation et la certification sont personnelles : chaque agent suit la sienne. Elles ne
          donnent aucun crédit de carte.
        </p>
      </div>
      <TrainingProgress account={account} />
      <ol className="space-y-2 text-sm">
        <Step done={!!cert?.training_completed_at} label="Leçons terminées" />
        <Step done={!!cert?.exam_passed_at} label="Évaluation réussie" />
        <Step
          done={account.status === 'paid' || account.status === 'waived'}
          label="Frais réglés"
        />
        <Step done={!!cert?.certified_at} label="Certifié : vous pouvez émettre des cartes" />
      </ol>
      <Button variant="outline" className="min-h-11 w-full sm:w-auto" asChild>
        <Link href="/operator/training">
          <GraduationCap className="mr-1.5 h-4 w-4" /> Ouvrir les leçons
        </Link>
      </Button>
      {account.payer === 'institution' ? (
        <p className="text-sm text-muted-foreground">
          Votre institution règle votre formation. Vous n’avez rien à payer.
        </p>
      ) : (
        <TrainingPayment account={account} />
      )}
    </section>
  )
}

export function TrainingProgress({
  account,
}: { account: Pick<TrainingAccount, 'paid_fcfa' | 'total_fcfa' | 'installment_fcfa' | 'status'> }) {
  const parts = Math.max(1, Math.round(account.total_fcfa / account.installment_fcfa))
  const paidParts = Math.floor(account.paid_fcfa / account.installment_fcfa)
  return (
    <div>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: parts }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: tranches fixes, ordonnées
            key={i}
            className={`h-2.5 flex-1 rounded-full ${i < paidParts ? 'bg-[#0d3d22]' : 'bg-muted'}`}
          />
        ))}
      </div>
      <p className="mt-2 text-sm text-foreground">
        {account.status === 'waived'
          ? 'Frais de formation offerts.'
          : `${formatFcfa(account.paid_fcfa)} réglés sur ${formatFcfa(account.total_fcfa)}`}
      </p>
    </div>
  )
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
          done ? 'border-[#0d3d22] bg-[#0d3d22] text-white' : 'border-border'
        }`}
      >
        {done ? '✓' : ''}
      </span>
      <span className={done ? 'text-foreground' : 'text-muted-foreground'}>
        {label}
        <span className="sr-only">{done ? ' : fait' : ' : à faire'}</span>
      </span>
    </li>
  )
}

function TrainingPayment({ account }: { account: TrainingAccount }) {
  const remaining = account.total_fcfa - account.paid_fcfa
  const choices = trainingChoices(remaining, account.installment_fcfa)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')

  if (choices.length === 0) {
    return <p className="text-sm text-foreground">Frais de formation entièrement réglés.</p>
  }

  const pay = async (amount: number) => {
    setBusy(amount)
    setError('')
    const res = await api<{ payment_url: string }>('/api/payg/training/checkout', {
      body: { account_id: account.id, amount_fcfa: amount, phone: phone.trim() || undefined },
    })
    if (!res.ok) {
      setError(res.error)
      setBusy(null)
      return
    }
    window.location.href = res.data.payment_url
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border p-4">
      <p className="text-sm font-medium text-foreground">
        Reste à régler : {formatFcfa(remaining)}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="training-phone">Numéro mobile money (facultatif)</Label>
        <Input
          id="training-phone"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+228 90 00 00 00"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {choices.map((c) => (
          <Button
            key={c.amount}
            variant={c.amount === remaining ? 'default' : 'outline'}
            className="min-h-11 flex-1"
            disabled={busy !== null}
            onClick={() => pay(c.amount)}
          >
            {busy === c.amount ? <Spinner className="h-4 w-4" /> : c.label}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
