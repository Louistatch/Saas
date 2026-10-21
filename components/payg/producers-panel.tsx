'use client'

/**
 * Producteurs d'une coopérative confiée et émission de leur carte.
 *
 * L'émission envoie une clé d'idempotence tirée à l'ouverture de la fenêtre et réutilisée
 * à chaque nouvel essai : une connexion qui coupe après le débit ne prend jamais un second
 * crédit (payg_issue_member_card renvoie « already_issued »).
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
import { CARD_FORMAT_LABEL, type CardFormat, formatFcfa } from '@/lib/payg/model'
import { CreditCard, Printer, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, newIdempotencyKey, withPartner } from './api'
import type { MemberRow, PaygCooperative, PaygMe } from './types'

type Filter = 'without_card' | 'with_card' | 'all'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'without_card', label: 'Sans carte' },
  { value: 'with_card', label: 'Avec carte' },
  { value: 'all', label: 'Tous' },
]

export function ProducersPanel({ me, onIssued }: { me: PaygMe; onIssued: () => void }) {
  const coops = me.cooperatives ?? []
  const partnerId = me.current?.partner_id ?? ''
  const [coopId, setCoopId] = useState(coops[0]?.id ?? '')
  const [filter, setFilter] = useState<Filter>('without_card')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<MemberRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [error, setError] = useState('')
  const [issuing, setIssuing] = useState<MemberRow | null>(null)

  useEffect(() => {
    if (!coops.some((c) => c.id === coopId)) setCoopId(coops[0]?.id ?? '')
  }, [coops, coopId])

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(async () => {
    if (!coopId) return
    setRows(null)
    setError('')
    const params = new URLSearchParams({ filter, page: String(page) })
    if (query) params.set('q', query)
    const res = await api<{ members: MemberRow[]; total: number; page_size: number }>(
      withPartner(`/api/payg/cooperatives/${coopId}/members?${params}`, partnerId),
    )
    if (!res.ok) {
      setError(res.error)
      setRows([])
      return
    }
    setRows(res.data.members)
    setTotal(res.data.total)
    setPageSize(res.data.page_size)
  }, [coopId, filter, page, query, partnerId])

  useEffect(() => {
    void load()
  }, [load])

  if (coops.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        {me.current?.role === 'agent'
          ? 'Aucune coopérative ne vous est encore confiée. Le gérant de votre institution vous en attribue depuis la console institution.'
          : 'Aucune coopérative ne vous est confiée pour l’instant. Le mandat d’une coopérative (convention signée) est enregistré par l’équipe FaîtièreHub.'}
      </div>
    )
  }

  const coop = coops.find((c) => c.id === coopId)
  const canIssue = me.current?.capabilities.issueCards && coop?.scopes.includes('cards.manage')
  const canPrint = me.current?.capabilities.printCards && coop?.scopes.includes('cards.print')

  return (
    <section aria-labelledby="producers-title" className="space-y-4">
      <h2 id="producers-title" className="sr-only">
        Producteurs
      </h2>
      <div className="space-y-1.5">
        <Label htmlFor="coop-select">Coopérative</Label>
        <Select
          value={coopId}
          onValueChange={(v) => {
            setCoopId(v)
            setPage(0)
          }}
        >
          <SelectTrigger id="coop-select" className="min-h-11 w-full">
            <SelectValue placeholder="Choisir une coopérative" />
          </SelectTrigger>
          <SelectContent>
            {coops.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {coop && coop.freeRemaining > 0 && (
          <p className="text-xs text-muted-foreground">
            Encore {coop.freeRemaining} carte{coop.freeRemaining > 1 ? 's' : ''} numérique
            {coop.freeRemaining > 1 ? 's' : ''} gratuite{coop.freeRemaining > 1 ? 's' : ''} pour
            cette coopérative (sans crédit).
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
            placeholder="Nom du producteur"
            aria-label="Rechercher un producteur"
            className="min-h-11 pl-9"
          />
        </div>
        <fieldset className="flex gap-1 rounded-full bg-muted p-1">
          <legend className="sr-only">Filtrer</legend>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => {
                setFilter(f.value)
                setPage(0)
              }}
              className={`min-h-9 flex-1 rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none ${
                filter === f.value
                  ? 'bg-background font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </fieldset>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-10" aria-busy="true">
          <Spinner className="h-5 w-5" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {error ||
            (filter === 'without_card'
              ? 'Tous les producteurs de cette page ont déjà leur carte.'
              : 'Aucun producteur ne correspond.')}
        </p>
      ) : (
        <ul
          className="divide-y divide-border rounded-2xl border border-border"
          data-testid="members"
        >
          {rows.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {m.first_name} {m.last_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.card
                    ? `${m.card.card_number}, ${m.card.commercial ? CARD_FORMAT_LABEL[m.card.card_format] : 'numérique gratuite'}`
                    : m.village || 'Pas encore de carte'}
                </p>
              </div>
              {m.card ? (
                canPrint ? (
                  <Button variant="outline" size="sm" className="min-h-10 shrink-0" asChild>
                    <a href={withPartner(`/api/payg/cards/${m.card.id}/print`, partnerId)}>
                      <Printer className="mr-1.5 h-4 w-4" /> Imprimer
                    </a>
                  </Button>
                ) : null
              ) : canIssue && m.status === 'active' ? (
                <Button size="sm" className="min-h-10 shrink-0" onClick={() => setIssuing(m)}>
                  <CreditCard className="mr-1.5 h-4 w-4" /> Émettre
                </Button>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {m.status === 'active' ? '' : 'Membre inactif'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Précédents
          </Button>
          <span className="text-muted-foreground">
            Page {page + 1} sur {Math.ceil(total / pageSize)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivants
          </Button>
        </div>
      )}

      {issuing && coop && (
        <IssueDialog
          me={me}
          coop={coop}
          member={issuing}
          onClose={() => setIssuing(null)}
          onDone={() => {
            setIssuing(null)
            onIssued()
            void load()
          }}
        />
      )}
    </section>
  )
}

function IssueDialog({
  me,
  coop,
  member,
  onClose,
  onDone,
}: {
  me: PaygMe
  coop: PaygCooperative
  member: MemberRow
  onClose: () => void
  onDone: () => void
}) {
  const balance = me.wallet?.credit_balance ?? 0
  const free = coop.freeRemaining > 0
  const [mode, setMode] = useState<'commercial' | 'free_allowance'>(
    free && balance === 0 ? 'free_allowance' : 'commercial',
  )
  const [format, setFormat] = useState<CardFormat>('plastified')
  const [price, setPrice] = useState('')
  const [key] = useState(newIdempotencyKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ card_number: string; message: string } | null>(null)

  const suggested = me.pricing.card_prices.find((p) => p.format === format)?.priceFcfa
  const noCredit = mode === 'commercial' && balance < 1

  const issue = async () => {
    setBusy(true)
    setError('')
    const res = await api<{ outcome: string; card_number?: string; message: string }>(
      '/api/payg/cards/issue',
      {
        body: {
          partner_id: me.current?.partner_id,
          member_id: member.id,
          mode,
          card_format: mode === 'free_allowance' ? 'digital' : format,
          producer_price_fcfa:
            mode === 'commercial' && price.trim() ? Number.parseInt(price, 10) : null,
          idempotency_key: key,
        },
      },
    )
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setDone({ card_number: res.data.card_number ?? '', message: res.data.message })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && (done ? onDone() : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Carte de {member.first_name} {member.last_name}
          </DialogTitle>
          <DialogDescription>{coop.name}</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-2" aria-live="polite">
            <p className="text-sm text-foreground">{done.message}</p>
            {done.card_number && (
              <p className="font-mono text-lg tracking-wider text-foreground">{done.card_number}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {free && (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">Type de carte</legend>
                <ModeOption
                  checked={mode === 'commercial'}
                  onSelect={() => setMode('commercial')}
                  title="Carte commerciale"
                  hint={`1 crédit, imprimable. Il vous en reste ${balance}.`}
                />
                <ModeOption
                  checked={mode === 'free_allowance'}
                  onSelect={() => setMode('free_allowance')}
                  title="Carte numérique gratuite"
                  hint={`Sans crédit, ${coop.freeRemaining} restante${coop.freeRemaining > 1 ? 's' : ''} pour la coopérative.`}
                />
              </fieldset>
            )}

            {mode === 'commercial' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="card-format">Format</Label>
                  <Select value={format} onValueChange={(v) => setFormat(v as CardFormat)}>
                    <SelectTrigger id="card-format" className="min-h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plastified">Plastifiée (environ 1 200 FCFA)</SelectItem>
                      <SelectItem value="pvc">PVC (environ 2 500 FCFA)</SelectItem>
                      <SelectItem value="digital">Numérique</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="producer-price">Prix payé par le producteur (FCFA)</Label>
                  <Input
                    id="producer-price"
                    inputMode="numeric"
                    placeholder={suggested ? String(suggested) : 'Facultatif'}
                    value={price}
                    onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Prix indicatif ; il comprend la commission FaîtièreHub de{' '}
                    {formatFcfa(me.pricing.commission_fcfa)}.
                  </p>
                </div>
                {noCredit && (
                  <p role="alert" className="text-sm text-destructive">
                    Plus de crédit :{' '}
                    {me.current?.capabilities.recharge
                      ? 'rechargez'
                      : 'demandez une recharge au gérant'}{' '}
                    avant d’émettre une carte commerciale.
                  </p>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {done ? (
            <Button onClick={onDone} className="min-h-11">
              Fermer
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Annuler
              </Button>
              <Button onClick={issue} disabled={busy || noCredit} className="min-h-11">
                {busy ? (
                  <Spinner className="h-4 w-4" />
                ) : mode === 'commercial' ? (
                  'Émettre (1 crédit)'
                ) : (
                  'Émettre gratuitement'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ModeOption({
  checked,
  onSelect,
  title,
  hint,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  hint: string
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
        checked ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <input
        type="radio"
        name="issue-mode"
        checked={checked}
        onChange={onSelect}
        className="mt-1 accent-[#0d3d22]"
      />
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}
