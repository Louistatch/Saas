'use client'

/**
 * Erreurs du site, regroupées : une ligne par erreur distincte, avec son nombre d'occurrences.
 * Les marquer « résolues » une fois corrigées ; une erreur qui revient se rouvre seule.
 */
import { useCallback, useEffect, useState } from 'react'

interface AppError {
  fingerprint: string
  source: 'serveur' | 'navigateur'
  route: string
  message: string
  digest: string | null
  occurrences: number
  first_seen: string
  last_seen: string
}

const when = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 60) return `il y a ${Math.max(min, 1)} min`
  const h = Math.round(min / 60)
  return h < 48 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`
}

export default function AdminErrorsPage() {
  const [tab, setTab] = useState<'nouvelle' | 'resolue'>('nouvelle')
  const [rows, setRows] = useState<AppError[] | null>(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setRows(null)
    const res = await fetch(`/api/admin/errors?status=${tab}`, { cache: 'no-store' }).catch(
      () => null,
    )
    setRows(res?.ok ? ((await res.json()) as { errors: AppError[] }).errors : [])
    if (!res?.ok) setNotice('Les erreurs n’ont pas pu se charger.')
  }, [tab])

  useEffect(() => {
    void load()
  }, [load])

  async function mark(fp: string) {
    const res = await fetch('/api/admin/errors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fingerprint: fp,
        status: tab === 'nouvelle' ? 'resolue' : 'nouvelle',
      }),
    }).catch(() => null)
    if (res?.ok) setRows((r) => (r ?? []).filter((e) => e.fingerprint !== fp))
    else setNotice('Mise à jour impossible. Réessayez.')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Erreurs du site</h1>
        <p className="text-sm text-muted-foreground">
          Erreurs rencontrées par les utilisateurs ou le serveur, regroupées. Corrigez, puis marquez
          comme résolue : si elle revient, elle réapparaît ici.
        </p>
      </header>
      <div className="flex gap-2" aria-label="Filtrer les erreurs">
        {(
          [
            ['nouvelle', 'À traiter'],
            ['resolue', 'Résolues'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              tab === value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      )}
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-primary/5 px-5 py-4 text-sm">
          {tab === 'nouvelle' ? 'Aucune erreur à traiter.' : 'Aucune erreur résolue.'}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((e) => (
            <li key={e.fingerprint} className="space-y-2 px-4 py-4">
              <div className="flex items-start gap-4">
                <span className="w-12 shrink-0 text-right text-2xl font-bold tabular-nums leading-none text-red-700">
                  {e.occurrences}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium text-foreground">{e.message}</span>
                  <span className="block break-all text-sm text-muted-foreground">
                    {e.source === 'serveur' ? 'Serveur' : 'Navigateur'}, {e.route}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Dernière fois {when(e.last_seen)}, première fois {when(e.first_seen)}
                    {e.digest ? `, référence ${e.digest}` : ''}
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => void mark(e.fingerprint)}
                className="ml-16 rounded-lg border border-border px-3 py-1.5 text-sm"
              >
                {tab === 'nouvelle' ? 'Marquer comme résolue' : 'Rouvrir'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
