'use client'

import { useCascadingLocations } from '@/hooks/use-cascading-locations'
import { calculateEnterpriseBudget } from '@/lib/agronomy/enterprise-budget'
import type { VersionInput } from '@/lib/ce-it/schema'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { type FileLink, button, field, request } from './api'
import { DataForm } from './form'
import VersionEditor from './version-editor'

interface Version {
  id: string
  number: number
  state: string
  payload: VersionInput
  ceit_reviews: Array<{ decision: string; notes: string }>
}
interface Product {
  id: string
  title: string
  culture: string
  owner_kind: string
  ceit_versions: Version[]
}
interface Owner {
  kind: string
  id: string | null
  name: string
}
interface StudioData {
  products: Product[]
  missions: Array<{ id: string; scope: string; status: string; expires_at: string }>
  admin: boolean
  workspace: {
    owners: Owner[]
    experts: Array<{ id: string; user_id: string; name: string }>
    reviewer: boolean
    agronome: boolean
  }
}
const stateLabel: Record<string, string> = {
  draft: 'Brouillon',
  submitted: 'En revue scientifique',
  approved: 'Approuvé · à publier',
  rejected: 'Corrections requises',
  published: 'Publié',
}

export default function Studio() {
  const [data, setData] = useState<StudioData | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [links, setLinks] = useState<Record<string, FileLink[]>>({})
  const geo = useCascadingLocations()
  const refresh = useCallback(async () => {
    try {
      setData(await request<StudioData>('studio'))
    } catch (e) {
      setMessage((e as Error).message)
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  async function command(action: string, value: unknown) {
    setBusy(true)
    setMessage('')
    try {
      const result = await request<{ result: unknown }>('studio', { action, data: value })
      await refresh()
      setMessage('Action enregistrée.')
      return result.result
    } catch (e) {
      setMessage((e as Error).message)
      return null
    } finally {
      setBusy(false)
    }
  }
  async function create(form: FormData) {
    const index = Number(form.get('owner'))
    const owner = data?.workspace.owners[index]
    if (!owner) return
    const result = await command('create', {
      owner_kind: owner.kind,
      faitiere_id: owner.kind === 'faitiere' ? owner.id : null,
      operator_id: owner.kind === 'operator' ? owner.id : null,
      title: form.get('title'),
      culture: String(form.get('culture')).trim().toLowerCase(),
      skills: String(form.get('skills'))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      region_id: geo.selection.region_id || null,
      prefecture_id: geo.selection.prefecture_id || null,
      canton_id: geo.selection.canton_id || null,
    })
    if (typeof result === 'string') setEditing(result)
  }
  async function files(version: string) {
    try {
      const result = await request<{ files: FileLink[] }>('review-files', { version })
      setLinks((old) => ({ ...old, [version]: result.files }))
    } catch (e) {
      setMessage((e as Error).message)
    }
  }
  async function authorize(form: FormData) {
    const kind = String(form.get('kind'))
    const expert = data?.workspace.experts.find((e) => e.id === form.get('expert'))
    const revoked = form.get('revoked') === 'on'
    if (kind === 'expertise')
      await command('qualify', {
        agronome_id: expert?.id,
        cultures: String(form.get('cultures'))
          .split(',')
          .map((v) => v.trim()),
        skills: String(form.get('skills'))
          .split(',')
          .map((v) => v.trim()),
        revoked,
      })
    else
      await command('authorize', {
        kind,
        target: kind === 'reviewer' ? expert?.user_id : form.get('partner'),
        faitiere: kind === 'mandate' ? form.get('faitiere') : null,
        until: new Date(String(form.get('until'))).toISOString(),
        revoked,
      })
  }
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <Link href="/ce-it" className="font-bold text-emerald-900">
            FaîtièreHub · catalogue CE/IT
          </Link>
          <h1 className="mt-4 text-3xl font-black">Studio des comptes d’exploitation</h1>
          <p className="mt-3 text-slate-600">
            Production, références et validation scientifique. Chaque version garde ses documents et
            sa revue. Les prix des ensembles sont fixés à 1 500 FCFA.
          </p>
        </header>
        <output aria-live="polite" className="rounded-xl bg-white p-3">
          {message || 'Les droits sont vérifiés à chaque opération.'}
        </output>
        {data?.workspace.owners.length !== 0 && data && (
          <DataForm
            onData={create}
            className="grid gap-4 rounded-2xl bg-white p-5 sm:grid-cols-2"
            aria-label="Créer un ensemble CE IT"
          >
            <h2 className="text-xl font-bold sm:col-span-2">Nouveau compte et itinéraire</h2>
            <label>
              Propriétaire
              <select name="owner" className={field}>
                {data.workspace.owners.map((o, i) => (
                  <option key={`${o.kind}:${o.id}`} value={i}>
                    {o.name} ·{' '}
                    {o.kind === 'platform'
                      ? 'Administration'
                      : o.kind === 'operator'
                        ? 'Opérateur'
                        : 'Faîtière'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Titre
              <input name="title" required minLength={3} maxLength={160} className={field} />
            </label>
            <label>
              Culture (identifiant)
              <input
                name="culture"
                required
                pattern="[a-z0-9_-]{2,60}"
                placeholder="mais"
                className={field}
              />
            </label>
            <label>
              Compétences requises (séparées par virgules)
              <input
                name="skills"
                required
                placeholder="fertilisation,irrigation"
                className={field}
              />
            </label>
            {(['region_id', 'prefecture_id', 'canton_id'] as const).map((key, i) => (
              <label key={key}>
                {['Région', 'Préfecture', 'Canton'][i]}
                <select
                  className={field}
                  value={geo.selection[key]}
                  onChange={(e) => geo.setLevel(key, e.target.value)}
                >
                  <option value="">Non précisé</option>
                  {geo.options[key].map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button type="submit" disabled={busy} className={button}>
              Créer le dossier
            </button>
          </DataForm>
        )}
        {editing && (
          <section>
            <div className="mb-3 flex justify-between">
              <h2 className="font-bold">{data?.products.find((p) => p.id === editing)?.title}</h2>
              <button className="underline" type="button" onClick={() => setEditing(null)}>
                Fermer l’éditeur
              </button>
            </div>
            <VersionEditor
              key={editing}
              product={editing}
              onSaved={() => {
                setEditing(null)
                setMessage('Version privée créée. Soumettez-la à la revue scientifique.')
                void refresh()
              }}
            />
          </section>
        )}
        <section className="space-y-4" aria-label="Dossiers accessibles">
          <h2 className="text-2xl font-bold">Dossiers et versions</h2>
          {data?.products.map((p) => (
            <article key={p.id} className="rounded-2xl border bg-white p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <h3 className="text-xl font-bold">
                  {p.title} · {p.culture}
                </h3>
                <button type="button" className={button} onClick={() => setEditing(p.id)}>
                  Nouvelle version · selon habilitation
                </button>
              </div>
              <details className="my-3">
                <summary className="cursor-pointer">
                  Inviter un agronome vérifié à contribuer
                </summary>
                <DataForm
                  onData={async (form) => {
                    await command('contributor', { product: p.id, agronome: form.get('agronome') })
                  }}
                  className="mt-3 flex flex-wrap gap-3"
                >
                  <label>
                    Identifiant Haroo de l’agronome
                    <input name="agronome" required className={field} />
                  </label>
                  <button type="submit" className={button} disabled={busy}>
                    Ajouter un contributeur
                  </button>
                </DataForm>
                <p className="mt-2 text-xs">
                  Seul le gestionnaire du propriétaire peut inviter un contributeur. La contribution
                  ne donne pas le droit d’auto-valider.
                </p>
              </details>
              {p.ceit_versions.map((v) => (
                <section
                  key={v.id}
                  className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4"
                >
                  <h4 className="font-bold">
                    Version {v.number} · {stateLabel[v.state]}
                  </h4>
                  <details>
                    <summary className="cursor-pointer text-emerald-800">
                      Examiner les données et références
                    </summary>
                    <p className="mt-3">{v.payload.context}</p>
                    <div className="overflow-x-auto">
                      <table className="mt-3 w-full text-left text-sm">
                        <caption className="text-left">
                          Compte prévisionnel pour {v.payload.areaHa} ha · FCFA
                        </caption>
                        <thead>
                          <tr>
                            <th>Scénario</th>
                            <th>Produit</th>
                            <th>Charges</th>
                            <th>Résultat</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calculateEnterpriseBudget(v.payload).map((s) => (
                            <tr key={s.id}>
                              <td>{s.label}</td>
                              <td>{Math.round(s.revenue)}</td>
                              <td>{Math.round(s.totalCost)}</td>
                              <td>{Math.round(s.result)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <h5 className="mt-3 font-semibold">Itinéraire</h5>
                    <ol className="space-y-2">
                      {v.payload.itinerary.map((step, i) => (
                        <li key={`${step.operation}:${i}`}>
                          J{step.dayStart}–J{step.dayEnd} : {step.operation}. {step.instructions}{' '}
                          Précautions : {step.precautions}
                        </li>
                      ))}
                    </ol>
                    <h5 className="mt-3 font-semibold">Sources et droits</h5>
                    <ul>
                      {v.payload.sources.map((s) => (
                        <li key={`${s.url}:${s.title}`}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="underline"
                          >
                            {s.title}
                          </a>{' '}
                          · {s.rights} · {s.checkedOn} · {s.notes}
                        </li>
                      ))}
                    </ul>
                  </details>
                  <button type="button" className="underline" onClick={() => void files(v.id)}>
                    Obtenir les PDF à examiner
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {links[v.id]?.map((f) => (
                      <a key={f.kind} href={f.url} className={button}>
                        PDF {f.kind.toUpperCase()}
                      </a>
                    ))}
                  </div>
                  {v.ceit_reviews.map((r) => (
                    <p key={r.decision} className="rounded-xl bg-emerald-50 p-3">
                      Revue : {r.notes}
                    </p>
                  ))}
                  {v.state === 'draft' && (
                    <button
                      type="button"
                      disabled={busy}
                      className={button}
                      onClick={() =>
                        void command('transition', { version: v.id, action: 'submit' })
                      }
                    >
                      Soumettre à la revue
                    </button>
                  )}
                  {v.state === 'submitted' && data.workspace.reviewer && (
                    <DataForm
                      onData={async (form) => {
                        await command('transition', {
                          version: v.id,
                          action: form.get('decision'),
                          notes: form.get('notes'),
                        })
                      }}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      <label className="sm:col-span-2">
                        Avis scientifique indépendant
                        <textarea
                          name="notes"
                          minLength={20}
                          maxLength={3000}
                          required
                          className={field}
                        />
                      </label>
                      <label>
                        Décision
                        <select name="decision" className={field}>
                          <option value="reject">Demander une nouvelle version corrigée</option>
                          <option value="approve">Approuver scientifiquement</option>
                        </select>
                      </label>
                      <button type="submit" className={button} disabled={busy}>
                        Enregistrer la revue
                      </button>
                    </DataForm>
                  )}
                  {v.state === 'approved' && (
                    <button
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        void command('transition', { version: v.id, action: 'publish' })
                      }
                    >
                      Publier cette version approuvée
                    </button>
                  )}
                </section>
              ))}
            </article>
          ))}
        </section>
        {data?.workspace.agronome && (
          <section className="space-y-4 rounded-2xl bg-white p-5">
            <h2 className="text-xl font-bold">Mon activité d’agronome</h2>
            <DataForm
              onData={async (form) => {
                await command('availability', {
                  available: form.get('available') === 'on',
                  cultures: String(form.get('cultures'))
                    .split(',')
                    .map((v) => v.trim()),
                  skills: String(form.get('skills'))
                    .split(',')
                    .map((v) => v.trim()),
                  capacity: Number(form.get('capacity')),
                })
              }}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label>
                Cultures proposées
                <input name="cultures" required placeholder="mais" className={field} />
              </label>
              <label>
                Compétences proposées
                <input name="skills" required placeholder="fertilisation" className={field} />
              </label>
              <label>
                Nombre de missions simultanées
                <input
                  name="capacity"
                  type="number"
                  min="1"
                  max="5"
                  defaultValue="1"
                  className={field}
                />
              </label>
              <label className="flex items-center gap-2">
                <input name="available" type="checkbox" />
                Disponible pour des propositions
              </label>
              <p className="text-xs sm:col-span-2">
                La recherche tient compte des compétences validées par l’administration ; déclarer
                une compétence ici ne la certifie pas.
              </p>
              <button type="submit" className={button} disabled={busy}>
                Enregistrer ma disponibilité
              </button>
            </DataForm>
            {data.missions.map((m) => (
              <article key={m.id} className="rounded-xl border p-4">
                <p>{m.scope}</p>
                <p className="text-sm">
                  État : {m.status} · réponse avant le{' '}
                  {new Date(m.expires_at).toLocaleString('fr-FR')}
                </p>
                <p className="mt-2 text-sm">
                  Cette proposition n’inclut aucune consultation illimitée. Convenez du périmètre et
                  des conditions avant d’accepter.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(m.status === 'proposed'
                    ? ['accept', 'decline']
                    : m.status === 'accepted'
                      ? ['complete']
                      : []
                  ).map((decision) => (
                    <button
                      key={decision}
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() => void command('respond', { mission: m.id, decision })}
                    >
                      {decision === 'accept'
                        ? 'Accepter la mission'
                        : decision === 'decline'
                          ? 'Décliner'
                          : 'Marquer terminée'}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}
        {data?.admin && (
          <details className="rounded-2xl bg-white p-5">
            <summary className="cursor-pointer text-xl font-bold">
              Administration · habilitations CE/IT
            </summary>
            <p className="my-3 text-sm">
              Ces autorisations sont propres au module CE/IT. Elles ne modifient ni certification,
              ni PAYG, ni facturation.
            </p>
            <DataForm onData={authorize} className="grid gap-3 sm:grid-cols-2">
              <label>
                Autorisation
                <select name="kind" className={field}>
                  <option value="operator">Droit opérateur CE/IT</option>
                  <option value="mandate">Mandat de faîtière</option>
                  <option value="reviewer">Évaluateur scientifique</option>
                  <option value="expertise">Compétences agronomiques validées</option>
                </select>
              </label>
              <label>
                Opérateur
                <select name="partner" className={field}>
                  {data.workspace.owners
                    .filter((o) => o.kind === 'operator')
                    .map((o) => (
                      <option key={o.id} value={o.id ?? ''}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Faîtière
                <select name="faitiere" className={field}>
                  {data.workspace.owners
                    .filter((o) => o.kind === 'faitiere')
                    .map((o) => (
                      <option key={o.id} value={o.id ?? ''}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Agronome
                <select name="expert" className={field}>
                  {data.workspace.experts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Expiration du droit / mandat
                <input type="datetime-local" name="until" className={field} />
              </label>
              <label>
                Cultures validées
                <input name="cultures" placeholder="mais,tomate" className={field} />
              </label>
              <label>
                Compétences validées
                <input name="skills" placeholder="fertilisation,irrigation" className={field} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="revoked" />
                Révoquer cette autorisation
              </label>
              <button type="submit" className={button} disabled={busy}>
                Enregistrer l’autorisation
              </button>
            </DataForm>
            <p className="mt-4 text-sm font-semibold">
              Reversements CE/IT désactivés. Aucune commission cartes de 250 FCFA.
            </p>
          </details>
        )}
      </div>
    </main>
  )
}
