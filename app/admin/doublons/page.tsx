'use client'

/**
 * Doublons : organisations au nom proche et personnes inscrites deux fois (graphies, accents,
 * prénom et nom inversés, même téléphone). Le super_admin choisit la fiche à garder ; l'autre est
 * archivée et tout ce qui lui était rattaché (membres, cartes, parcelles, historique) la rejoint.
 * Les numéros de carte ne changent pas : les cartes distribuées restent valables.
 */
import { useCallback, useEffect, useState } from 'react'

interface OrgSide {
  id: string
  name: string
  level: string | null
  created_at: string
  members: number
}
interface MemberSide {
  id: string
  name: string
  cooperative: string | null
  phone_end: string | null
  date_of_birth: string | null
  created_at: string
  card: string | null
  has_photo: boolean
}
interface Pair<T> {
  score: number
  keep: T
  archive: T
}
interface Result {
  organizations: Pair<OrgSide>[]
  members: Pair<MemberSide>[]
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const pct = (s: number) => `${Math.round(s * 100)} %`

function Side({
  title,
  lines,
  tone,
}: { title: string; lines: string[]; tone: 'keep' | 'archive' }) {
  return (
    <div
      className={`rounded-lg border p-3 ${tone === 'keep' ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}
    >
      <p className="text-xs font-medium text-muted-foreground">
        {tone === 'keep' ? 'Fiche gardée' : 'Fiche archivée'}
      </p>
      <p className="font-semibold text-foreground">{title}</p>
      {lines.filter(Boolean).map((l) => (
        <p key={l} className="text-sm text-muted-foreground">
          {l}
        </p>
      ))}
    </div>
  )
}

export default function DuplicatesPage() {
  const [data, setData] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [swapped, setSwapped] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/duplicates', { cache: 'no-store' }).catch(() => null)
    if (res?.ok) {
      setData((await res.json()) as Result)
      setError('')
    } else setError('La recherche de doublons n’a pas abouti. Actualisez dans un instant.')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function orient<T extends { id: string }>(p: Pair<T>) {
    const key = `${p.keep.id}:${p.archive.id}`
    return swapped.has(key)
      ? { key, keep: p.archive, archive: p.keep }
      : { key, keep: p.keep, archive: p.archive }
  }
  function swap(key: string) {
    setSwapped((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function merge(
    type: 'organization' | 'member',
    keep: { id: string },
    archive: { id: string },
    label: string,
  ) {
    if (
      !window.confirm(
        `Fusionner ? ${label}\nLa fiche archivée reste consultable dans le journal ; rien n’est supprimé.`,
      )
    )
      return
    setBusy(archive.id)
    setNotice('')
    const res = await fetch('/api/admin/duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, keep: keep.id, archive: archive.id }),
    }).catch(() => null)
    const body: { error?: string } = res ? await res.json().catch(() => ({})) : {}
    setBusy(null)
    if (!res?.ok) {
      setNotice(body.error ?? 'Connexion interrompue : la fusion n’a pas été faite.')
      return
    }
    setNotice(`Fusion faite : ${label}.`)
    void load()
  }

  const total = (data?.organizations.length ?? 0) + (data?.members.length ?? 0)

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Doublons</h1>
        <p className="text-sm text-muted-foreground">
          Organisations au nom proche et personnes inscrites deux fois, repérées malgré les accents,
          les graphies locales et les prénoms inversés. Choisissez la fiche à garder : l’autre est
          archivée et tout ce qui lui était rattaché la rejoint. Les numéros de carte ne changent
          pas.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {error}
        </p>
      )}
      {notice && (
        <output className="block rounded-lg bg-primary/5 px-4 py-3 text-sm text-foreground">
          {notice}
        </output>
      )}
      {data === null && !error && (
        <p className="text-sm text-muted-foreground">Recherche en cours…</p>
      )}
      {data && total === 0 && (
        <p className="rounded-xl bg-primary/5 px-5 py-4 text-sm text-foreground">
          Aucun doublon repéré. L’import Kobo rattache désormais les graphies proches à la fiche
          existante.
        </p>
      )}

      {data && data.organizations.length > 0 && (
        <section aria-labelledby="org-title" className="space-y-3">
          <h2 id="org-title" className="text-lg font-semibold text-foreground">
            Organisations ({data.organizations.length})
          </h2>
          <ul className="space-y-4">
            {data.organizations.map((p) => {
              const o = orient(p)
              return (
                <li key={o.key} className="space-y-3 rounded-xl border border-border bg-card p-4">
                  <p className="text-sm text-muted-foreground">Ressemblance {pct(p.score)}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Side
                      tone="keep"
                      title={o.keep.name}
                      lines={[`${o.keep.members} membre(s)`, `Créée le ${day(o.keep.created_at)}`]}
                    />
                    <Side
                      tone="archive"
                      title={o.archive.name}
                      lines={[
                        `${o.archive.members} membre(s)`,
                        `Créée le ${day(o.archive.created_at)}`,
                      ]}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void merge(
                          'organization',
                          o.keep,
                          o.archive,
                          `« ${o.archive.name} » rejoint « ${o.keep.name} »`,
                        )
                      }
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {busy === o.archive.id ? 'Fusion…' : 'Fusionner'}
                    </button>
                    <button
                      type="button"
                      onClick={() => swap(o.key)}
                      className="rounded-lg border border-border px-4 py-2 text-sm"
                    >
                      Garder l’autre fiche
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {data && data.members.length > 0 && (
        <section aria-labelledby="mem-title" className="space-y-3">
          <h2 id="mem-title" className="text-lg font-semibold text-foreground">
            Personnes inscrites deux fois ({data.members.length})
          </h2>
          <ul className="space-y-4">
            {data.members.map((p) => {
              const o = orient(p)
              const lines = (m: MemberSide) => [
                m.cooperative ?? '',
                m.card ? `Carte ${m.card}` : 'Sans carte active',
                m.phone_end ? `Téléphone …${m.phone_end}` : '',
                m.has_photo ? 'Avec photo' : 'Sans photo',
                `Inscrit le ${day(m.created_at)}`,
              ]
              return (
                <li key={o.key} className="space-y-3 rounded-xl border border-border bg-card p-4">
                  <p className="text-sm text-muted-foreground">
                    Ressemblance du nom {pct(p.score)}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Side tone="keep" title={o.keep.name} lines={lines(o.keep)} />
                    <Side tone="archive" title={o.archive.name} lines={lines(o.archive)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void merge(
                          'member',
                          o.keep,
                          o.archive,
                          `${o.archive.name} rejoint ${o.keep.name}`,
                        )
                      }
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {busy === o.archive.id ? 'Fusion…' : 'Fusionner'}
                    </button>
                    <button
                      type="button"
                      onClick={() => swap(o.key)}
                      className="rounded-lg border border-border px-4 py-2 text-sm"
                    >
                      Garder l’autre fiche
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
