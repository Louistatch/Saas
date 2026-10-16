'use client'

/**
 * Modération du chat HarooLife (super_admin). Les joueurs signalent un message ou un joueur depuis
 * le jeu ; ici l'équipe décide : masquer le message, classer sans suite, suspendre l'écriture d'un
 * joueur pour quelques jours (il lit toujours), lever une suspension. Toutes les règles et le
 * journal sont en base (haroolife_mod_queue / haroolife_mod_act) ; l'équipe ne voit que le message
 * signalé, jamais le reste d'une conversation privée.
 */
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useState } from 'react'

interface Person {
  id: string
  key: string
  name: string
  email: string | null
  suspended_until: string | null
}
interface MessageReport {
  id: string
  room: string
  body: string
  hidden: boolean
  created_at: string
  author: Person
  count: number
  last: string
  reasons: string[]
}
interface PlayerReport {
  player: Person
  count: number
  last: string
  reasons: string[]
}
interface Queue {
  messages: MessageReport[]
  players: PlayerReport[]
  suspended: (Person & { reason: string })[]
  log: { kind: string; action: string; reason: string | null; at: string; target: string }[]
}

const TOGO = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Lome',
})
const when = (iso: string) => TOGO.format(new Date(iso))
const ACTION: Record<string, string> = {
  hide: 'Message masqué',
  dismiss: 'Classé sans suite',
  suspend: 'Joueur suspendu',
  unsuspend: 'Suspension levée',
}

/** Where the message was written, in words (a private conversation is only named as such). */
function roomLabel(room: string) {
  if (room === 'world:togo') return 'Salon Togo'
  if (room === 'locality:lome') return 'Salon Lomé'
  if (room === 'locality:kara') return 'Salon Kara'
  if (room.startsWith('canton:')) return 'Place du canton'
  if (room.startsWith('coop:')) return 'Salon de coopérative'
  if (room.startsWith('dm:')) return 'Message privé'
  return room
}

function Who({ p }: { p: Person }) {
  return (
    <span>
      <strong>{p.name}</strong>
      {p.email && <span className="text-muted-foreground"> · {p.email}</span>}
      {p.suspended_until && (
        <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
          Suspendu jusqu’au {when(p.suspended_until)}
        </span>
      )}
    </span>
  )
}

export default function HarooLifeModerationPage() {
  const [queue, setQueue] = useState<Queue | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [days, setDays] = useState(3)

  const load = useCallback(async () => {
    const { data, error: e } = await createClient().rpc('haroolife_mod_queue')
    if (e) setError('La file de modération n’a pas pu être chargée.')
    else {
      setError('')
      setQueue(data as Queue)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function act(kind: 'message' | 'player', target: string, action: string, reason: string) {
    setBusy(`${kind}:${target}:${action}`)
    const { error: e } = await createClient().rpc('haroolife_mod_act', {
      p_kind: kind,
      p_target: target,
      p_action: action,
      p_reason: reason,
      p_days: days,
    })
    setBusy(null)
    if (e) setError(e.message)
    await load()
  }

  const open = (queue?.messages.length ?? 0) + (queue?.players.length ?? 0)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Modération HarooLife"
        description="Les signalements des joueurs : masquer un message, classer, suspendre l’écriture d’un joueur."
      />
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm">
          <span>
            <strong>{queue ? open : '…'}</strong> signalement{open > 1 ? 's' : ''} à traiter
          </span>
          <label className="ml-auto flex items-center gap-2">
            Durée d’une suspension
            <select
              aria-label="Durée d’une suspension"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1"
            >
              {[1, 3, 7, 30].map((d) => (
                <option key={d} value={d}>
                  {d} jour{d > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Actualiser
          </Button>
        </CardContent>
      </Card>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <section aria-labelledby="mod-messages" className="space-y-3">
        <h2 id="mod-messages" className="text-lg font-bold">
          Messages signalés
        </h2>
        {queue && queue.messages.length === 0 && (
          <EmptyState
            title="Aucun message à traiter"
            description="Les nouveaux signalements apparaîtront ici."
          />
        )}
        {queue?.messages.map((m) => (
          <Card key={m.id} data-testid="mod-message">
            <CardContent className="space-y-3 pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <Who p={m.author} />
                <span className="text-muted-foreground">
                  {roomLabel(m.room)} · écrit le {when(m.created_at)}
                </span>
              </div>
              <blockquote className="whitespace-pre-wrap break-words rounded-lg border-l-4 border-amber-400 bg-muted px-3 py-2">
                {m.hidden ? <em>Message déjà masqué</em> : m.body}
              </blockquote>
              <p className="text-sm text-muted-foreground">
                Signalé {m.count} fois · {m.reasons.join(' · ')} · dernier le {when(m.last)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!!busy}
                  onClick={() => void act('message', m.id, 'hide', m.reasons[0] ?? '')}
                >
                  Masquer le message
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!!busy}
                  onClick={() => void act('message', m.id, 'suspend', m.reasons[0] ?? '')}
                >
                  Masquer et suspendre {m.author.name} ({days} j)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => void act('message', m.id, 'dismiss', 'Pas de manquement')}
                >
                  Classer sans suite
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-labelledby="mod-players" className="space-y-3">
        <h2 id="mod-players" className="text-lg font-bold">
          Joueurs signalés
        </h2>
        {queue && queue.players.length === 0 && (
          <EmptyState
            title="Aucun joueur à traiter"
            description="Les signalements depuis la fiche d’un joueur apparaîtront ici."
          />
        )}
        {queue?.players.map((p) => (
          <Card key={p.player.id} data-testid="mod-player">
            <CardContent className="space-y-3 pt-6">
              <Who p={p.player} />
              <p className="text-sm text-muted-foreground">
                Signalé {p.count} fois · {p.reasons.join(' · ')} · dernier le {when(p.last)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!!busy}
                  onClick={() => void act('player', p.player.id, 'suspend', p.reasons[0] ?? '')}
                >
                  Suspendre ({days} j)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => void act('player', p.player.id, 'dismiss', 'Pas de manquement')}
                >
                  Classer sans suite
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-labelledby="mod-suspended" className="space-y-3">
        <h2 id="mod-suspended" className="text-lg font-bold">
          Suspensions en cours
        </h2>
        {queue && queue.suspended.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun joueur suspendu.</p>
        )}
        {queue?.suspended.map((s) => (
          <Card key={s.id} data-testid="mod-suspended">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm">
              <span>
                <Who p={s} />
                <span className="block text-muted-foreground">Motif : {s.reason}</span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() => void act('player', s.id, 'unsuspend', 'Suspension levée')}
              >
                Lever la suspension
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-labelledby="mod-log" className="space-y-2">
        <h2 id="mod-log" className="text-lg font-bold">
          Dernières décisions
        </h2>
        <ul className="space-y-1 text-sm">
          {queue?.log.map((l) => (
            <li key={`${l.at}-${l.target}-${l.action}`}>
              {when(l.at)} · {ACTION[l.action] ?? l.action}
              {l.reason ? ` · ${l.reason}` : ''}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
