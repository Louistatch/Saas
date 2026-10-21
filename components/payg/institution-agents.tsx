'use client'

/**
 * Équipe d'une institution (FENOMAT, MAPTO…) : inviter un agent, lui confier des
 * coopératives, décider qui paie sa formation, le retirer. Le portefeuille reste unique ; ce
 * que fait chaque agent est suivi (cartes émises, dernière activité, formation).
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
import { formatFcfa } from '@/lib/payg/model'
import { Copy, MessageCircle, UserPlus, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, formatDate, withPartner } from './api'
import { roleLabel } from './console-shell'
import type { AgentRow, PaygMe, PendingInvitation } from './types'

export function AgentsPanel({ me }: { me: PaygMe }) {
  const partnerId = me.current?.partner_id ?? ''
  const [agents, setAgents] = useState<AgentRow[] | null>(null)
  const [invitations, setInvitations] = useState<PendingInvitation[]>([])
  const [error, setError] = useState('')
  const [inviting, setInviting] = useState(false)
  const [open, setOpen] = useState<AgentRow | null>(null)

  const load = useCallback(async () => {
    const res = await api<{ agents: AgentRow[]; invitations: PendingInvitation[] }>(
      withPartner('/api/institution/agents', partnerId),
    )
    if (!res.ok) {
      setError(res.error)
      setAgents([])
      return
    }
    setAgents(res.data.agents)
    setInvitations(res.data.invitations)
    setOpen((current) =>
      current ? (res.data.agents.find((a) => a.user_id === current.user_id) ?? null) : null,
    )
  }, [partnerId])

  useEffect(() => {
    void load()
  }, [load])

  const active = (agents ?? []).filter((a) => a.status === 'active')
  const certified = active.filter((a) => a.certification?.certified_at).length

  return (
    <section aria-labelledby="agents-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="agents-title" className="text-base font-semibold text-foreground">
            Équipe
          </h2>
          {agents && (
            <p className="text-sm text-muted-foreground" data-testid="team-summary">
              {active.length} membre{active.length > 1 ? 's' : ''} actif
              {active.length > 1 ? 's' : ''}, {certified} certifié{certified > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <Button className="min-h-11" onClick={() => setInviting(true)}>
          <UserPlus className="mr-1.5 h-4 w-4" /> Inviter un agent
        </Button>
      </div>

      {agents === null ? (
        <div className="flex justify-center py-10" aria-busy="true">
          <Spinner className="h-5 w-5" />
        </div>
      ) : agents.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {error || 'Personne dans l’équipe pour l’instant. Invitez vos agents de terrain.'}
        </p>
      ) : (
        <ul
          className="divide-y divide-border rounded-2xl border border-border"
          data-testid="agents"
        >
          {agents.map((a) => (
            <li key={a.user_id}>
              <button
                type="button"
                onClick={() => setOpen(a)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {a.name || a.email}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {roleLabel(a.role)}
                    {a.status !== 'active' ? ', retiré' : ''}
                    {`, ${a.cooperatives.length} coopérative${a.cooperatives.length > 1 ? 's' : ''}`}
                    {`, ${a.cards_issued} carte${a.cards_issued > 1 ? 's' : ''}`}
                  </span>
                </span>
                <CertificationChip agent={a} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {invitations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Invitations en attente</h3>
          <ul className="divide-y divide-border rounded-2xl border border-dashed border-border">
            {invitations.map((i) => (
              <li key={i.id} className="px-4 py-3 text-sm">
                <span className="block text-foreground">{i.full_name}</span>
                <span className="block text-xs text-muted-foreground">
                  {i.email}, {roleLabel(i.membership_role).toLowerCase()}, expire le{' '}
                  {formatDate(i.expires_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {inviting && (
        <InviteDialog
          partnerId={partnerId}
          canInviteManager={me.current?.role === 'owner'}
          onClose={() => setInviting(false)}
          onInvited={load}
        />
      )}
      {open && <AgentDialog me={me} agent={open} onClose={() => setOpen(null)} onChanged={load} />}
    </section>
  )
}

function CertificationChip({ agent }: { agent: AgentRow }) {
  const certified = !!agent.certification?.certified_at
  const t = agent.training
  const label = certified
    ? 'Certifié'
    : agent.certification?.exam_passed_at
      ? 'Évaluation réussie'
      : agent.certification?.training_completed_at
        ? 'Leçons finies'
        : 'En formation'
  return (
    <span className="shrink-0 text-right">
      <span
        className={`block rounded-full px-2.5 py-0.5 text-xs ${
          certified ? 'bg-[#0d3d22] text-white' : 'bg-muted text-muted-foreground'
        }`}
      >
        {label}
      </span>
      {t && t.status !== 'paid' && t.status !== 'waived' && (
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {formatFcfa(t.paid_fcfa)} / {formatFcfa(t.total_fcfa)}
        </span>
      )}
    </span>
  )
}

function InviteDialog({
  partnerId,
  canInviteManager,
  onClose,
  onInvited,
}: {
  partnerId: string
  canInviteManager: boolean
  onClose: () => void
  onInvited: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'agent' | 'manager'>('agent')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)

  const invite = async () => {
    setBusy(true)
    setError('')
    const res = await api<{ link: string }>('/api/institution/agents', {
      body: {
        partner_id: partnerId,
        full_name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        role,
      },
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setLink(res.data.link)
    onInvited()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `Bonjour ${name.trim()}, voici votre invitation à rejoindre notre équipe sur FaîtièreHub : ${link}`,
  )}`

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{link ? 'Invitation prête' : 'Inviter un agent'}</DialogTitle>
          <DialogDescription>
            {link
              ? 'Envoyez ce lien à la personne. Il est valable 14 jours et ne sert qu’une fois, avec cette adresse e-mail.'
              : 'L’agent crée son compte depuis le lien, suit sa formation, puis émet des cartes sur les coopératives que vous lui confiez.'}
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="space-y-3">
            <p className="break-all rounded-xl bg-muted px-3 py-2 font-mono text-xs text-foreground">
              {link}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="min-h-11 flex-1" onClick={copy}>
                <Copy className="mr-1.5 h-4 w-4" /> {copied ? 'Lien copié' : 'Copier le lien'}
              </Button>
              <Button className="min-h-11 flex-1" asChild>
                <a href={whatsapp} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-1.5 h-4 w-4" /> Envoyer par WhatsApp
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Nom complet</Label>
              <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">E-mail</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-phone">Téléphone (facultatif)</Label>
              <Input
                id="invite-phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            {canInviteManager && (
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Rôle</Label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                  <SelectTrigger id="invite-role" className="min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Agent de terrain</SelectItem>
                    <SelectItem value="manager">Gérant (recharge, équipe, rapports)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          {link ? (
            <Button variant="ghost" onClick={onClose}>
              Fermer
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Annuler
              </Button>
              <Button
                className="min-h-11"
                onClick={invite}
                disabled={busy || name.trim().length < 2 || !email.includes('@')}
              >
                {busy ? <Spinner className="h-4 w-4" /> : 'Créer l’invitation'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AgentDialog({
  me,
  agent,
  onClose,
  onChanged,
}: {
  me: PaygMe
  agent: AgentRow
  onClose: () => void
  onChanged: () => void
}) {
  const partnerId = me.current?.partner_id ?? ''
  const assigned = new Set(agent.cooperatives.map((c) => c.id))
  const available = (me.cooperatives ?? []).filter((c) => !assigned.has(c.id))
  const [coopId, setCoopId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const isSelf = agent.user_id === me.user_id
  const canRevoke =
    !isSelf &&
    agent.status === 'active' &&
    agent.role !== 'owner' &&
    (agent.role === 'agent' || me.current?.role === 'owner')

  const run = async (key: string, url: string, method: string, body: unknown) => {
    setBusy(key)
    setError('')
    const res = await api(url, { method, body })
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    onChanged()
    return true
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{agent.name || agent.email}</DialogTitle>
          <DialogDescription>
            {roleLabel(agent.role)}
            {agent.email ? `, ${agent.email}` : ''}
            {agent.last_activity_at
              ? `. Dernière activité le ${formatDate(agent.last_activity_at)}.`
              : '. Aucune activité pour l’instant.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Coopératives confiées</h3>
            {agent.cooperatives.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune : cet agent ne voit encore aucun producteur.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {agent.cooperatives.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <span className="truncate">{c.name}</span>
                    {agent.status === 'active' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0"
                        disabled={busy !== null}
                        aria-label={`Retirer ${c.name}`}
                        onClick={() =>
                          run(
                            `rm-${c.id}`,
                            `/api/institution/agents/${agent.user_id}/cooperatives`,
                            'DELETE',
                            { partner_id: partnerId, cooperative_id: c.id },
                          )
                        }
                      >
                        {busy === `rm-${c.id}` ? (
                          <Spinner className="h-4 w-4" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {agent.status === 'active' && available.length > 0 && (
              <div className="flex gap-2">
                <Select value={coopId} onValueChange={setCoopId}>
                  <SelectTrigger className="min-h-11 flex-1" aria-label="Coopérative à confier">
                    <SelectValue placeholder="Confier une coopérative" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="min-h-11"
                  disabled={!coopId || busy !== null}
                  onClick={async () => {
                    if (
                      await run(
                        'assign',
                        `/api/institution/agents/${agent.user_id}/cooperatives`,
                        'POST',
                        { partner_id: partnerId, cooperative_id: coopId },
                      )
                    )
                      setCoopId('')
                  }}
                >
                  {busy === 'assign' ? <Spinner className="h-4 w-4" /> : 'Confier'}
                </Button>
              </div>
            )}
          </div>

          {agent.training && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Formation</h3>
              <p className="text-sm text-muted-foreground">
                {formatFcfa(agent.training.paid_fcfa)} réglés sur{' '}
                {formatFcfa(agent.training.total_fcfa)}.{' '}
                {agent.certification?.certified_at
                  ? `Certifié le ${formatDate(agent.certification.certified_at)}.`
                  : 'Pas encore certifié : il ne peut pas émettre de carte.'}
              </p>
              <fieldset className="flex gap-1 rounded-full bg-muted p-1">
                <legend className="sr-only">Qui paie la formation</legend>
                {(
                  [
                    ['institution', 'L’institution paie'],
                    ['self', 'L’agent paie'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={agent.training?.payer === value}
                    disabled={busy !== null || agent.training?.status === 'paid'}
                    onClick={() =>
                      run('payer', `/api/institution/agents/${agent.user_id}`, 'PATCH', {
                        action: 'set_payer',
                        partner_id: partnerId,
                        payer: value,
                      })
                    }
                    className={`min-h-9 flex-1 rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
                      agent.training?.payer === value
                        ? 'bg-background font-medium text-foreground shadow-sm'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        {canRevoke && (
          <DialogFooter className="border-t border-border pt-4">
            {confirmRevoke ? (
              <div className="w-full space-y-2">
                <p className="text-sm text-foreground">
                  L’agent perd tout accès aux producteurs tout de suite. Ses cartes déjà émises
                  restent valables et le solde de crédits ne change pas.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => setConfirmRevoke(false)}
                  >
                    Annuler
                  </Button>
                  <Button
                    variant="destructive"
                    className="min-h-11 flex-1"
                    disabled={busy !== null}
                    onClick={async () => {
                      if (
                        await run('revoke', `/api/institution/agents/${agent.user_id}`, 'PATCH', {
                          action: 'revoke',
                          partner_id: partnerId,
                        })
                      )
                        onClose()
                    }}
                  >
                    {busy === 'revoke' ? <Spinner className="h-4 w-4" /> : 'Retirer l’agent'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => setConfirmRevoke(true)}
              >
                Retirer de l’équipe
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
