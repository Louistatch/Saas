'use client'

/**
 * Le carnet de crédits : un crédit = une carte commerciale finalisée. Vert profond comme la
 * carte d'opérateur de /operator. Les crédits offerts sont consommés en premier ; l'agent
 * d'une institution voit le solde partagé mais seul le gérant recharge.
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
import { formatFcfa } from '@/lib/payg/model'
import { ArrowDownCircle, ArrowUpCircle, Download } from 'lucide-react'
import { useState } from 'react'
import { api, formatDateTime, withPartner } from './api'
import type { LedgerEntry, PaygMe } from './types'

export function CreditsCard({ me }: { me: PaygMe }) {
  const wallet = me.wallet ?? { credit_balance: 0, welcome_credits: 0, welcome_granted: false }
  const caps = me.current?.capabilities
  const [pack, setPack] = useState<PaygMe['pricing']['packs'][number] | null>(null)
  const low = wallet.credit_balance <= 3

  return (
    <section
      aria-labelledby="credits-title"
      className="relative overflow-hidden rounded-3xl bg-[#0d3d22] px-5 pb-5 pt-6 text-white shadow-[0_18px_40px_-24px_rgba(13,61,34,0.9)]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full border-[18px] border-white/[0.06]"
      />
      <h2 id="credits-title" className="text-sm text-white/70">
        Crédits de {me.current?.display_name}
      </h2>
      <p className="mt-1 flex items-baseline gap-2" data-testid="credit-balance">
        <span className="text-5xl font-bold tabular-nums leading-none">
          {wallet.credit_balance}
        </span>
        <span className="text-base text-white/80">
          {wallet.credit_balance > 1 ? 'cartes à émettre' : 'carte à émettre'}
        </span>
      </p>
      <p className="mt-2 text-sm text-white/70">
        {wallet.welcome_credits > 0
          ? `Dont ${wallet.welcome_credits} offert${wallet.welcome_credits > 1 ? 's' : ''}, utilisé${wallet.welcome_credits > 1 ? 's' : ''} en premier. `
          : ''}
        Une carte commerciale finalisée prend un crédit ({formatFcfa(me.pricing.commission_fcfa)}
        ), compris dans le prix payé par le producteur.
      </p>
      {me.current?.kind === 'institutional' && (
        <p className="mt-1 text-sm text-white/70">Solde partagé par toute l’équipe.</p>
      )}

      <div className="mt-5 border-t border-white/15 pt-4">
        {caps?.recharge ? (
          <>
            <p className="mb-2 text-sm font-medium">
              {low ? 'Rechargez avant votre prochaine tournée' : 'Recharger'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {me.pricing.packs.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setPack(p)}
                  aria-label={`${p.credits} crédits pour ${formatFcfa(p.price_fcfa)}`}
                  className="min-h-14 rounded-2xl border border-white/25 px-2 py-2 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <span className="block text-lg font-semibold tabular-nums">{p.credits}</span>
                  <span className="block text-xs text-white/75">{formatFcfa(p.price_fcfa)}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-white/60">
              Achat minimum : 20 crédits. Les crédits ne se transfèrent pas à un autre opérateur.
            </p>
          </>
        ) : (
          <p className="text-sm text-white/80">
            {low
              ? 'Solde bas : prévenez le gérant de votre institution pour qu’il recharge.'
              : 'La recharge est faite par le gérant de votre institution.'}
          </p>
        )}
      </div>

      {pack && me.current && (
        <PackDialog partnerId={me.current.partner_id} pack={pack} onClose={() => setPack(null)} />
      )}
    </section>
  )
}

function PackDialog({
  partnerId,
  pack,
  onClose,
}: {
  partnerId: string
  pack: { code: string; credits: number; price_fcfa: number }
  onClose: () => void
}) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pay = async () => {
    setBusy(true)
    setError('')
    const res = await api<{ payment_url: string }>('/api/payg/credits/checkout', {
      body: { partner_id: partnerId, pack_code: pack.code, phone: phone.trim() || undefined },
    })
    if (!res.ok) {
      setError(res.error)
      setBusy(false)
      return
    }
    window.location.href = res.data.payment_url
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {pack.credits} crédits pour {formatFcfa(pack.price_fcfa)}
          </DialogTitle>
          <DialogDescription>
            Vous payez sur la page sécurisée FedaPay (mobile money ou carte). Les crédits s’ajoutent
            dès que FedaPay confirme le paiement.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="pack-phone">Numéro mobile money (facultatif)</Label>
          <Input
            id="pack-phone"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+228 90 00 00 00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={pay} disabled={busy} className="min-h-11">
            {busy ? <Spinner className="h-4 w-4" /> : `Payer ${formatFcfa(pack.price_fcfa)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Historique des crédits (gérant et opérateur individuel), exportable en CSV. */
export function CreditLedger({ partnerId }: { partnerId: string }) {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    const res = await api<{ entries: LedgerEntry[] }>(withPartner('/api/payg/ledger', partnerId))
    if (res.ok) setEntries(res.data.entries)
    else setError(res.error)
  }

  return (
    <section aria-labelledby="ledger-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="ledger-title" className="text-base font-semibold text-foreground">
          Historique des crédits
        </h2>
        <Button variant="outline" size="sm" asChild>
          <a href={withPartner('/api/payg/ledger?format=csv', partnerId)}>
            <Download className="mr-1.5 h-4 w-4" /> CSV
          </a>
        </Button>
      </div>
      {entries === null ? (
        <Button variant="ghost" size="sm" onClick={load}>
          Afficher les mouvements
        </Button>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun mouvement pour l’instant.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
              <span className="flex min-w-0 items-start gap-2">
                {e.credits >= 0 ? (
                  <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                ) : (
                  <ArrowDownCircle
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                )}
                <span className="min-w-0">
                  <span className="block text-foreground">{e.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatDateTime(e.created_at)}
                    {e.actor ? ` · ${e.actor}` : ''}
                    {e.amount_fcfa ? ` · ${formatFcfa(e.amount_fcfa)}` : ''}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className={e.credits >= 0 ? 'font-medium text-primary' : 'text-foreground'}>
                  {e.credits > 0 ? '+' : ''}
                  {e.credits}
                </span>
                <span className="block text-xs text-muted-foreground">solde {e.balance_after}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
