'use client'

/**
 * Where the account lives in HarooLife (region → préfecture → canton), its displayed name and
 * pagne. Shared by the 3D world (sheet « Ma résidence ») and the former TogoLife page.
 * Phone and e-mail never transit here; roles come from the account.
 */
import { type World, initials } from '@/lib/haroolife/world'
import { useMemo, useState } from 'react'
import { PAGNES } from './pagnes'

const field = 'w-full rounded-xl border border-[#1F2A44]/20 bg-white p-3 text-base text-[#1F2A44]'
const primary = 'rounded-xl bg-[#2F7D4F] px-4 py-3 font-semibold text-white disabled:opacity-50'
const secondary = 'rounded-xl border border-[#1F2A44]/20 px-4 py-3'
export const FIELD = field
export const PRIMARY = primary

export function Avatar({ name, pagne, size = 40 }: { name: string; pagne: number; size?: number }) {
  const tone = PAGNES[(pagne - 1) % PAGNES.length] ?? PAGNES[0]
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: `repeating-linear-gradient(135deg, ${tone} 0 6px, ${tone}cc 6px 10px)`,
        fontSize: size * 0.38,
      }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-white"
    >
      {initials(name)}
    </span>
  )
}

export async function post(url: string, body: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null)
  if (res?.ok) return null
  const data: { error?: string } = res ? await res.json().catch(() => ({})) : {}
  return data.error ?? 'Connexion interrompue. Réessayez.'
}

export function HomeDialog({
  world,
  defaultName,
  onDone,
  onClose,
}: {
  world: World
  defaultName: string
  onDone: () => void
  onClose?: () => void
}) {
  const initial = useMemo(() => {
    const cantonId = world.me.home?.canton_id ?? world.me.suggested_canton
    for (const r of world.territory)
      for (const p of r.prefectures)
        if (p.cantons.some((c) => c.id === cantonId))
          return { region: r.id, prefecture: p.id, canton: cantonId ?? '' }
    return { region: world.territory[0]?.id ?? '', prefecture: '', canton: '' }
  }, [world])
  const [region, setRegion] = useState(initial.region)
  const [prefecture, setPrefecture] = useState(initial.prefecture)
  const [canton, setCanton] = useState(initial.canton)
  const [name, setName] = useState(world.me.display_name ?? defaultName)
  const [pagne, setPagne] = useState(world.me.pagne ?? 1)
  const [visible, setVisible] = useState(world.me.visible ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const prefectures = world.territory.find((r) => r.id === region)?.prefectures ?? []
  const cantons = prefectures.find((p) => p.id === prefecture)?.cantons ?? []

  async function save() {
    setBusy(true)
    setError('')
    const err = await post('/api/haroolife/home', {
      canton_id: canton,
      display_name: name,
      pagne,
      visible,
    })
    setBusy(false)
    if (err) setError(err)
    else onDone()
  }
  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: feuille modale plein écran sur mobile, hors flux du document
      role="dialog"
      aria-modal="true"
      aria-labelledby="home-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#1F2A44]/50 p-0 sm:items-center sm:p-4"
    >
      <div className="max-h-[92dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-[#FAFAF7] p-5 sm:rounded-3xl">
        <div className="flex items-center gap-3">
          <Avatar name={name || '?'} pagne={pagne} size={48} />
          <div>
            <h2 id="home-title" className="text-xl font-bold text-[#1F2A44]">
              {world.me.home ? 'Ma maison' : 'Où habitez-vous ?'}
            </h2>
            <p className="text-sm text-[#1F2A44]/70">
              Votre canton place votre maison sur la carte. Vous pouvez en changer.
            </p>
          </div>
        </div>
        <label className="block space-y-1 text-sm font-medium text-[#1F2A44]">
          Région
          <select
            className={field}
            value={region}
            onChange={(e) => {
              setRegion(e.target.value)
              setPrefecture('')
              setCanton('')
            }}
          >
            {world.territory.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium text-[#1F2A44]">
          Préfecture
          <select
            className={field}
            value={prefecture}
            onChange={(e) => {
              setPrefecture(e.target.value)
              setCanton('')
            }}
          >
            <option value="">Choisir</option>
            {prefectures.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium text-[#1F2A44]">
          Canton
          <select className={field} value={canton} onChange={(e) => setCanton(e.target.value)}>
            <option value="">Choisir</option>
            {cantons.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium text-[#1F2A44]">
          Nom affiché aux autres habitants
          <input
            className={field}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="Prénom ou surnom"
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-[#1F2A44]">Mon pagne</legend>
          <div className="flex flex-wrap gap-2">
            {PAGNES.map((tone, i) => (
              <button
                key={tone}
                type="button"
                aria-label={`Pagne ${i + 1}`}
                aria-pressed={pagne === i + 1}
                onClick={() => setPagne(i + 1)}
                style={{
                  background: `repeating-linear-gradient(135deg, ${tone} 0 6px, ${tone}cc 6px 10px)`,
                }}
                className={`h-10 w-10 rounded-full ${pagne === i + 1 ? 'ring-4 ring-[#1F2A44]' : 'ring-2 ring-white'}`}
              />
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-3 text-sm text-[#1F2A44]">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
            className="h-5 w-5"
          />
          Les autres habitants de mon canton peuvent me voir
        </label>
        <p className="text-xs text-[#1F2A44]/60">
          Votre téléphone et votre e-mail ne sont jamais montrés. Vos rôles viennent de votre
          compte.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !canton || name.trim().length === 0}
            onClick={() => void save()}
            className={`flex-1 ${primary}`}
          >
            {busy ? 'Enregistrement…' : 'M’installer ici'}
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className={secondary}>
              Annuler
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
