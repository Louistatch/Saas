'use client'

/**
 * Données personnelles des producteurs : ce que l'opérateur s'engage à respecter, et le dépôt
 * d'une demande de rectification reçue d'un producteur ou de sa coopérative.
 */

import { Spinner } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, formatDate, withPartner } from './api'
import type { PaygMe } from './types'

const STATUS_LABEL: Record<string, string> = {
  open: 'Reçue',
  in_progress: 'En cours',
  resolved: 'Corrigée',
  rejected: 'Refusée',
}

interface Rectification {
  id: string
  description: string
  status: string
  resolution: string | null
  created_at: string
  cooperatives: { name: string } | null
  members: { first_name: string; last_name: string } | null
}

export function DataPanel({ me }: { me: PaygMe }) {
  const partnerId = me.current?.partner_id ?? ''
  const coops = me.cooperatives ?? []
  const [coopId, setCoopId] = useState(coops[0]?.id ?? '')
  const [via, setVia] = useState<'producer' | 'cooperative' | 'agent'>('producer')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [requests, setRequests] = useState<Rectification[]>([])

  const load = () =>
    api<{ requests: Rectification[] }>(withPartner('/api/payg/rectifications', partnerId)).then(
      (res) => res.ok && setRequests(res.data.requests),
    )

  // biome-ignore lint/correctness/useExhaustiveDependencies: lecture à l'ouverture et au changement d'opérateur
  useEffect(() => {
    if (partnerId) void load()
  }, [partnerId])

  const submit = async () => {
    setBusy(true)
    setMessage(null)
    const res = await api('/api/payg/rectifications', {
      body: {
        partner_id: partnerId,
        cooperative_id: coopId,
        requested_via: via,
        description: description.trim(),
      },
    })
    setBusy(false)
    if (!res.ok) {
      setMessage({ ok: false, text: res.error })
      return
    }
    setDescription('')
    setMessage({ ok: true, text: 'Demande transmise à l’équipe FaîtièreHub.' })
    void load()
  }

  return (
    <section aria-labelledby="data-title" className="space-y-6">
      <div className="rounded-2xl border border-border p-4">
        <h2
          id="data-title"
          className="flex items-center gap-2 text-base font-semibold text-foreground"
        >
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden /> Données des producteurs
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            Vous n’accédez qu’aux coopératives qui vous sont confiées, dans le cadre de la
            convention signée avec elles. Chaque consultation et chaque carte est enregistrée.
          </li>
          <li>
            Informez chaque producteur de l’usage de ses données avant d’émettre sa carte. Ne prenez
            sa photo qu’avec son accord et ne la partagez pas hors de FaîtièreHub.
          </li>
          <li>
            La carte FaîtièreHub atteste l’appartenance à une coopérative. Ce n’est pas une pièce
            d’identité officielle.
          </li>
          <li>
            Le QR code de la carte est public : quiconque le scanne voit l’identité du producteur,
            sa localité et sa coopérative. Remettez la carte au producteur seul.
          </li>
        </ul>
      </div>

      {coops.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Demander une rectification</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rect-coop">Coopérative</Label>
              <Select value={coopId} onValueChange={setCoopId}>
                <SelectTrigger id="rect-coop" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {coops.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rect-via">Demandée par</Label>
              <Select value={via} onValueChange={(v) => setVia(v as typeof via)}>
                <SelectTrigger id="rect-via" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="producer">Le producteur</SelectItem>
                  <SelectItem value="cooperative">La coopérative</SelectItem>
                  <SelectItem value="agent">Moi (erreur constatée)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rect-text">Ce qu’il faut corriger</Label>
            <Textarea
              id="rect-text"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nom du producteur, information erronée et valeur correcte"
            />
          </div>
          <Button
            onClick={submit}
            disabled={busy || description.trim().length < 5 || !coopId}
            className="min-h-11"
          >
            {busy ? <Spinner className="h-4 w-4" /> : 'Envoyer la demande'}
          </Button>
          {message && (
            <p
              role={message.ok ? 'status' : 'alert'}
              className={`text-sm ${message.ok ? 'text-primary' : 'text-destructive'}`}
            >
              {message.text}
            </p>
          )}
        </div>
      )}

      {requests.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {requests.map((r) => (
            <li key={r.id} className="px-4 py-3 text-sm">
              <p className="flex justify-between gap-3">
                <span className="text-foreground">{r.cooperatives?.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </p>
              <p className="mt-0.5 line-clamp-2 text-muted-foreground">{r.description}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
              {r.resolution && <p className="mt-1 text-foreground">{r.resolution}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
