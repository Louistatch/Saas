'use client'

import { useCascadingLocations } from '@/hooks/use-cascading-locations'
import type { AccessProof } from '@/lib/ce-it/access-flow'
import type { CatalogueItem } from '@/lib/ce-it/schema'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { type FileLink, button, field, request } from './api'
import { DataForm } from './form'

interface Candidate {
  agronome_id: string
  name: string
  location_rank: number
}
export default function Catalogue() {
  const [items, setItems] = useState<CatalogueItem[]>([])
  const [culture, setCulture] = useState('')
  const [owner, setOwner] = useState('')
  const [selected, setSelected] = useState<CatalogueItem | null>(null)
  const [proof, setProof] = useState<AccessProof | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [links, setLinks] = useState<FileLink[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const geo = useCascadingLocations()
  const load = useCallback(async () => {
    setBusy(true)
    setMessage('')
    const q = new URLSearchParams()
    if (culture.trim()) q.set('culture', culture.trim().toLowerCase())
    if (owner) q.set('owner', owner)
    if (geo.selection.region_id) q.set('region', geo.selection.region_id)
    if (geo.selection.prefecture_id) q.set('prefecture', geo.selection.prefecture_id)
    if (geo.selection.canton_id) q.set('canton', geo.selection.canton_id)
    try {
      setItems((await request<{ items: CatalogueItem[] }>(`catalogue?${q}`)).items)
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [
    culture,
    owner,
    geo.selection.region_id,
    geo.selection.prefecture_id,
    geo.selection.canton_id,
  ])
  useEffect(() => {
    void request<{ items: CatalogueItem[] }>('catalogue')
      .then((v) => setItems(v.items))
      .catch((e) => setMessage(e.message))
  }, [])
  async function access(form: FormData) {
    if (!selected) return
    setBusy(true)
    setMessage('')
    try {
      const result = await request<AccessProof & { candidates: Candidate[] }>('access', {
        action: 'card',
        product_id: selected.id,
        card_number: form.get('card'),
        pin: form.get('pin'),
      })
      setProof({ grant_id: result.grant_id, token: result.token })
      setCandidates(result.candidates)
      const download = await request<{ files: FileLink[] }>('access', {
        action: 'download',
        grant_id: result.grant_id,
        token: result.token,
      })
      setLinks(download.files)
      setMessage('Accès autorisé. Vos deux documents sont prêts.')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function propose(form: FormData) {
    if (!proof) return
    setBusy(true)
    try {
      await request('access', {
        ...proof,
        action: 'propose',
        agronome_id: form.get('agronome'),
        scope: form.get('scope'),
        acknowledged: form.get('terms') === 'on',
      })
      setCandidates([])
      setMessage(
        'Proposition envoyée dans l’espace de l’agronome. Son acceptation reste nécessaire.',
      )
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="min-h-screen bg-[#f4f7f2] px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <Link href="/" className="font-bold text-emerald-900">
            FaîtièreHub
          </Link>
          <h1 className="mt-5 text-3xl font-black">Préparer sa campagne agricole</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Filtrez les comptes d’exploitation et leurs itinéraires techniques validés. Les
            hypothèses et recommandations sont contextualisées à la culture et au territoire.
          </p>
          <Link href="/ce-it/studio" className="mt-3 inline-block underline">
            Espace de production et de validation
          </Link>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void load()
          }}
          className="grid gap-4 rounded-2xl bg-white p-5 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Filtres des documents"
        >
          <label>
            Culture
            <input
              className={field}
              value={culture}
              onChange={(e) => setCulture(e.target.value)}
              placeholder="mais, tomate…"
            />
          </label>
          <label>
            Propriétaire
            <select className={field} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Tous</option>
              <option value="faitiere">Faîtière</option>
              <option value="operator">Opérateur</option>
              <option value="platform">FaîtièreHub</option>
            </select>
          </label>
          {(['region_id', 'prefecture_id', 'canton_id'] as const).map((key, i) => (
            <label key={key}>
              {['Région', 'Préfecture', 'Canton'][i]}
              <select
                className={field}
                value={geo.selection[key]}
                onChange={(e) => geo.setLevel(key, e.target.value)}
              >
                <option value="">Tous</option>
                {geo.options[key].map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button className={button} disabled={busy} type="submit">
            Filtrer
          </button>
        </form>
        <output aria-live="polite">
          {message || `${items.length} ensemble(s) CE + itinéraire technique`}
        </output>
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-emerald-100 bg-white p-5">
              <p className="text-sm text-emerald-800">
                {item.owner_name} · {item.culture}
              </p>
              <h2 className="mt-2 text-xl font-bold">{item.title}</h2>
              <p className="mt-3 font-semibold">1 500 FCFA · CE + itinéraire technique</p>
              {item.owner_kind === 'faitiere' ? (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    Gratuit pour les producteurs de cette faîtière avec leur carte agricole active
                    et leur PIN.
                  </p>
                  <button
                    className={`${button} mt-4`}
                    onClick={() => {
                      setSelected(item)
                      setProof(null)
                      setCandidates([])
                      setLinks([])
                      setMessage('')
                    }}
                    type="button"
                  >
                    Vérifier ma carte et mon PIN
                  </button>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  Une carte agricole ne donne pas de gratuité sur cet ensemble.
                </p>
              )}
              <button className={`${button} mt-3 w-full`} disabled type="button">
                Achat payant bientôt disponible
              </button>
            </article>
          ))}
        </div>
        {selected && (
          <section className="rounded-2xl bg-white p-6" aria-label="Accès avec carte et PIN">
            <div className="flex justify-between gap-3">
              <h2 className="text-xl font-bold">{selected.title}</h2>
              <button
                type="button"
                onClick={() => {
                  setSelected(null)
                  setProof(null)
                  setLinks([])
                  setCandidates([])
                }}
                className="underline"
              >
                Fermer
              </button>
            </div>
            {!proof && (
              <DataForm onData={access} className="mt-4 grid gap-4 sm:grid-cols-2">
                <label>
                  Numéro de carte
                  <input name="card" required autoComplete="off" className={field} />
                </label>
                <label>
                  PIN secret
                  <input
                    name="pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    className={field}
                  />
                </label>
                <button type="submit" className={button} disabled={busy}>
                  Vérifier et obtenir les documents
                </button>
              </DataForm>
            )}
            {links.length > 0 && (
              <div className="my-4 flex flex-wrap gap-3">
                {links.map((f) => (
                  <a key={f.kind} href={f.url} rel="noreferrer" className={button}>
                    Télécharger{' '}
                    {f.kind === 'ce' ? 'le compte d’exploitation' : 'l’itinéraire technique'}
                  </a>
                ))}
              </div>
            )}
            {proof && (
              <p className="mt-3 text-sm">
                Accès sécurisé valable 15 minutes ; liens de téléchargement valables 5 minutes. Vous
                pouvez vérifier à nouveau votre carte pour les renouveler.
              </p>
            )}
            {candidates.length > 0 ? (
              <DataForm onData={propose} className="mt-6 space-y-3 border-t pt-5">
                <h3 className="font-bold">Proposer une mission à un agronome disponible</h3>
                <label className="block">
                  Agronome
                  <select name="agronome" className={field}>
                    {candidates.map((a) => (
                      <option key={a.agronome_id} value={a.agronome_id}>
                        {a.name} ·{' '}
                        {
                          ['même canton', 'même préfecture', 'même région', 'autre territoire'][
                            a.location_rank
                          ]
                        }
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Besoin et périmètre
                  <textarea
                    name="scope"
                    className={field}
                    minLength={20}
                    maxLength={2000}
                    required
                    placeholder="Objectif, durée et modalités à convenir avec l’agronome."
                  />
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" name="terms" required className="mt-1" />
                  Je comprends que 1 500 FCFA couvre les documents. La consultation personnalisée
                  nécessite l’acceptation de l’agronome et, si nécessaire, un accord distinct.
                </label>
                <button type="submit" className={button} disabled={busy}>
                  Proposer la mission
                </button>
              </DataForm>
            ) : (
              proof && (
                <p className="mt-4 text-sm text-slate-600">
                  Aucune affectation automatique. Si aucun agronome compétent n’est disponible, les
                  documents restent accessibles.
                </p>
              )
            )}
          </section>
        )}
      </div>
    </main>
  )
}
