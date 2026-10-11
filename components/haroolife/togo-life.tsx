'use client'

/**
 * HarooLife national : la vie agricole togolaise, canton par canton. Trois écrans : la carte
 * (où sont les gens), « Ici » (habitants, lieux, équipes d'un canton) et le téléphone (raccourcis).
 * Tout chiffre affiché vient de la base ou d'une source réelle (météo, prix). 2D légère : rien de
 * lourd à télécharger, lisible sur un téléphone d'entrée de gamme.
 */
import { useAuth } from '@/app/context/auth-context'
import {
  type HereGroup,
  ROLE_LABELS,
  type Resident,
  type Role,
  type World,
  initials,
} from '@/lib/haroolife/world'
import { CloudRain, Home, MapPin, Phone, Sprout, Store, Sun, Users, Warehouse } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { TogoMap } from './togo-map'
import { HarooLifeWorkspace } from './workspace'

// Huit pagnes : la couleur de l'avatar, choisie par la personne.
export const PAGNES = [
  '#B5541F',
  '#2F7D4F',
  '#E0B341',
  '#3B82B9',
  '#8E3B8E',
  '#C2410C',
  '#0F766E',
  '#1F2A44',
]
const ROLE_TONE: Record<Role, string> = {
  producteur: 'bg-[#2F7D4F]/15 text-[#1f5a38]',
  ouvrier: 'bg-[#E0B341]/25 text-[#6b4f0a]',
  acheteur: 'bg-[#3B82B9]/15 text-[#1f4f78]',
  agronome: 'bg-[#0F766E]/15 text-[#0b5650]',
  operateur: 'bg-[#B5541F]/15 text-[#7a3511]',
  admin_coop: 'bg-[#1F2A44]/10 text-[#1F2A44]',
  union: 'bg-[#1F2A44]/10 text-[#1F2A44]',
  faitiere: 'bg-[#1F2A44]/10 text-[#1F2A44]',
  equipe: 'bg-[#8E3B8E]/15 text-[#5e2a5e]',
}
const ACTIVITY: Record<string, string> = {
  recolte: 'Récolte',
  semis: 'Semis',
  desherbage: 'Désherbage',
}

const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })

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

function RoleChips({ roles }: { roles: Role[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span
          key={r}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_TONE[r] ?? ''}`}
        >
          {ROLE_LABELS[r] ?? r}
        </span>
      ))}
    </span>
  )
}

function Place({
  icon: Icon,
  title,
  summary,
  children,
  open,
  onToggle,
}: {
  icon: typeof Sprout
  title: string
  summary: string
  children?: React.ReactNode
  open: boolean
  onToggle: () => void
}) {
  return (
    <li className="rounded-2xl border border-[#1F2A44]/10 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2F7D4F]/10 text-[#2F7D4F]">
          <Icon aria-hidden="true" className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[#1F2A44]">{title}</span>
          <span className="block truncate text-sm text-[#1F2A44]/70">{summary}</span>
        </span>
      </button>
      {open && children && (
        <div className="border-t border-[#1F2A44]/10 p-4 text-sm">{children}</div>
      )}
    </li>
  )
}

function HomeDialog({
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
          return { region: r.id, prefecture: p.id, canton: cantonId }
    return { region: world.territory[0]?.id ?? '', prefecture: '', canton: '' }
  }, [world])
  const [region, setRegion] = useState(initial.region)
  const [prefecture, setPrefecture] = useState(initial.prefecture)
  const [canton, setCanton] = useState(initial.canton ?? '')
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
    const res = await fetch('/api/haroolife/home', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canton_id: canton, display_name: name, pagne, visible }),
    }).catch(() => null)
    const data: { error?: string } = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) {
      setError(data.error ?? 'Connexion interrompue : votre maison n’est pas enregistrée.')
      return
    }
    onDone()
  }
  const field = 'w-full rounded-xl border border-[#1F2A44]/20 bg-white p-3 text-base text-[#1F2A44]'
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
            className="flex-1 rounded-xl bg-[#2F7D4F] px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Enregistrement…' : 'M’installer ici'}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#1F2A44]/20 px-4 py-3"
            >
              Annuler
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Explorer({
  world,
  onVisit,
}: {
  world: World
  onVisit: (canton: string) => void
}) {
  const homeRegion = world.territory.find((r) => r.name === world.me.home?.region)?.id ?? null
  const [region, setRegion] = useState<string | null>(homeRegion)
  const [prefecture, setPrefecture] = useState<string | null>(null)
  const r = world.territory.find((x) => x.id === region)
  const p = r?.prefectures.find((x) => x.id === prefecture)
  return (
    <div className="space-y-4">
      <TogoMap
        regions={world.territory}
        selected={region}
        onSelect={(id) => {
          setRegion(id)
          setPrefecture(null)
        }}
      />
      {r && (
        <section aria-labelledby="pref-title" className="space-y-2">
          <h2 id="pref-title" className="font-semibold text-[#1F2A44]">
            {r.name} · {r.prefectures.length} préfectures
          </h2>
          <ul className="flex flex-wrap gap-2">
            {r.prefectures.map((pf) => (
              <li key={pf.id}>
                <button
                  type="button"
                  aria-pressed={prefecture === pf.id}
                  onClick={() => setPrefecture(pf.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    prefecture === pf.id
                      ? 'border-[#1F2A44] bg-[#1F2A44] text-white'
                      : 'border-[#1F2A44]/20 bg-white'
                  }`}
                >
                  {pf.name}
                  {pf.residents > 0 && <span className="ml-1 opacity-70">· {pf.residents}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {p && (
        <ul className="divide-y divide-[#1F2A44]/10 rounded-2xl border border-[#1F2A44]/10 bg-white">
          {p.cantons.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onVisit(c.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="font-medium text-[#1F2A44]">
                  {c.name}
                  {world.me.home?.canton_id === c.id && (
                    <span className="ml-2 rounded-full bg-[#E0B341]/30 px-2 text-xs">chez moi</span>
                  )}
                </span>
                <span className="text-sm text-[#1F2A44]/70">
                  {c.residents === 0
                    ? 'personne encore'
                    : `${c.residents} habitant${c.residents > 1 ? 's' : ''}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Here({
  world,
  onOpenTeams,
  onGoHome,
}: {
  world: World
  onOpenTeams: () => void
  onGoHome: () => void
}) {
  const here = world.here
  const [open, setOpen] = useState<string | null>(null)
  if (!here) return null
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k))
  const atHome = world.me.home?.canton_id === here.canton.canton_id
  const teams = here.groups.filter((g) => g.kind === 'team')
  const works = here.groups.filter((g) => g.kind === 'work')
  const roles = world.me.roles
  const operators = here.residents.filter((r) => r.roles.includes('operateur')).length
  const today = here.sky[0]
  const groupLine = (g: HereGroup) =>
    `${ACTIVITY[g.activity] ?? g.activity} · ${fmtDay(g.starts_on)} · ${g.people} personne${g.people > 1 ? 's' : ''}${
      g.kind === 'work' ? ` · ${g.total} / ${g.target} ha` : ` / ${g.target}`
    }`
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-sm text-[#1F2A44]/70">
          {here.canton.prefecture}, région {here.canton.region}
        </p>
        <h1 className="text-2xl font-bold text-[#1F2A44]">
          {here.canton.canton}
          {atHome && (
            <span className="ml-2 rounded-full bg-[#E0B341]/30 px-2 text-sm font-medium">
              chez moi
            </span>
          )}
        </h1>
        {!atHome && world.me.home && (
          <button
            type="button"
            onClick={onGoHome}
            className="text-sm font-medium text-[#2F7D4F] underline"
          >
            Revenir chez moi, à {world.me.home.canton}
          </button>
        )}
      </header>

      <section aria-labelledby="hab-title" className="space-y-2">
        <h2 id="hab-title" className="font-semibold text-[#1F2A44]">
          {here.residents.length === 0
            ? 'Personne ne s’est encore installé ici'
            : `${here.residents.length} habitant${here.residents.length > 1 ? 's' : ''}`}
        </h2>
        {here.residents.length === 0 ? (
          <p className="text-sm text-[#1F2A44]/70">
            Les habitants sont les comptes qui ont choisi ce canton. Invitez vos voisins producteurs
            et ouvriers.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {here.residents.map((r: Resident, i) => (
              <li
                key={`${r.display_name}-${i}`}
                className={`flex items-center gap-3 rounded-2xl border p-3 ${
                  r.is_me ? 'border-[#E0B341] bg-[#E0B341]/10' : 'border-[#1F2A44]/10 bg-white'
                }`}
              >
                <Avatar name={r.display_name} pagne={r.pagne} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[#1F2A44]">
                    {r.display_name}
                    {r.is_me && <span className="text-[#1F2A44]/60"> (moi)</span>}
                  </span>
                  <RoleChips roles={r.roles} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="lieux-title" className="space-y-2">
        <h2 id="lieux-title" className="font-semibold text-[#1F2A44]">
          Les lieux
        </h2>
        <ul className="space-y-2">
          <Place
            icon={Sprout}
            title="Les champs"
            summary={
              works.length === 0
                ? 'Aucun travail proposé pour l’instant'
                : works.length === 1
                  ? '1 travail proposé'
                  : `${works.length} travaux proposés`
            }
            open={open === 'champs'}
            onToggle={() => toggle('champs')}
          >
            <ul className="space-y-1">
              {works.map((g) => (
                <li key={g.id}>
                  <strong>{g.title}</strong> — {groupLine(g)}
                </li>
              ))}
            </ul>
            {(roles.includes('producteur') || roles.includes('admin_coop')) && (
              <button
                type="button"
                onClick={onOpenTeams}
                className="mt-3 rounded-xl bg-[#2F7D4F] px-4 py-2 font-medium text-white"
              >
                Proposer des travaux sur mes parcelles
              </button>
            )}
          </Place>
          <Place
            icon={Users}
            title="La maison des équipes"
            summary={
              teams.length === 0
                ? 'Aucune équipe en formation'
                : `${teams.length} équipe${teams.length > 1 ? 's' : ''} en formation`
            }
            open={open === 'equipes'}
            onToggle={() => toggle('equipes')}
          >
            <ul className="space-y-1">
              {teams.map((g) => (
                <li key={g.id}>
                  <strong>{g.title}</strong> — {groupLine(g)}
                </li>
              ))}
            </ul>
            {(roles.includes('ouvrier') || roles.includes('agronome')) && (
              <button
                type="button"
                onClick={onOpenTeams}
                className="mt-3 rounded-xl bg-[#2F7D4F] px-4 py-2 font-medium text-white"
              >
                {roles.includes('agronome') ? 'Recruter une équipe' : 'Rejoindre une équipe'}
              </button>
            )}
          </Place>
          <Place
            icon={Store}
            title="Le marché"
            summary={
              here.market.length === 0
                ? 'Pas de prix relevé ces 14 derniers jours dans la région'
                : `${here.market[0].culture} à ${here.market[0].price} FCFA/${here.market[0].unit}${here.market.length > 1 ? `, et ${here.market.length - 1} autres` : ''}`
            }
            open={open === 'marche'}
            onToggle={() => toggle('marche')}
          >
            <ul className="divide-y divide-[#1F2A44]/10">
              {here.market.map((m) => (
                <li key={m.culture} className="flex items-center justify-between py-1.5">
                  <span>
                    {m.icon ? `${m.icon} ` : ''}
                    {m.culture}
                    {m.market && <span className="text-[#1F2A44]/60"> · {m.market}</span>}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {m.price} FCFA/{m.unit}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/marche" className="mt-3 inline-block font-medium text-[#2F7D4F] underline">
              Tous les prix du marché
            </Link>
          </Place>
          <Place
            icon={today && today.precipitation_probability >= 50 ? CloudRain : Sun}
            title="Le ciel"
            summary={
              today
                ? `Aujourd’hui ${Math.round(today.temperature_min)}–${Math.round(today.temperature_max)} °C, pluie ${Math.round(today.precipitation_probability)} %`
                : 'Prévisions indisponibles pour le moment'
            }
            open={open === 'ciel'}
            onToggle={() => toggle('ciel')}
          >
            <ul className="grid grid-cols-3 gap-2 text-center">
              {here.sky.map((d) => (
                <li key={d.date} className="rounded-xl bg-[#3B82B9]/10 p-2">
                  <span className="block text-xs text-[#1F2A44]/70">{fmtDay(d.date)}</span>
                  <span className="block font-semibold">
                    {Math.round(d.temperature_min)}–{Math.round(d.temperature_max)} °C
                  </span>
                  <span className="block text-xs">
                    pluie {Math.round(d.precipitation_probability)} %
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[#1F2A44]/60">
              Prévision régionale ({here.canton.region}), modèles Open-Meteo.
            </p>
          </Place>
          <Place
            icon={Warehouse}
            title="Les coopératives"
            summary={
              here.cooperatives.length === 0
                ? 'Aucune coopérative n’a encore de membre inscrit dans ce canton'
                : here.cooperatives.map((c) => c.name).join(', ')
            }
            open={open === 'coops'}
            onToggle={() => toggle('coops')}
          >
            <ul className="space-y-1">
              {here.cooperatives.map((c) => (
                <li key={c.id}>
                  <strong>{c.name}</strong> · {c.members} membre{c.members > 1 ? 's' : ''} ici
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-[#1F2A44]/70">
              Pas encore de coopérative ? Demandez un accès depuis la page d’accueil.
            </p>
          </Place>
          <Place
            icon={MapPin}
            title="Le bureau de l’opérateur"
            summary={
              operators === 0
                ? 'Aucun opérateur certifié installé ici'
                : `${operators} opérateur${operators > 1 ? 's' : ''} de zone`
            }
            open={open === 'operateur'}
            onToggle={() => toggle('operateur')}
          >
            <p>
              L’opérateur de zone émet les cartes membres et accompagne les coopératives.{' '}
              {roles.includes('operateur') ? (
                <Link href="/operator" className="font-medium text-[#2F7D4F] underline">
                  Ouvrir mon espace opérateur
                </Link>
              ) : (
                <Link href="/operator" className="font-medium text-[#2F7D4F] underline">
                  Devenir opérateur
                </Link>
              )}
            </p>
          </Place>
        </ul>
      </section>
    </div>
  )
}

function PhoneScreen({
  world,
  onTeams,
  onMap,
}: { world: World; onTeams: () => void; onMap: () => void }) {
  const roles = world.me.roles
  const space = roles.some((r) => ['admin_coop', 'union', 'faitiere', 'producteur'].includes(r))
    ? { href: '/dashboard', label: 'Mon tableau de bord' }
    : roles.includes('operateur')
      ? { href: '/operator', label: 'Mon espace opérateur' }
      : { href: '/haroo', label: 'Mon espace Haroo' }
  const apps: { label: string; hint: string; onClick?: () => void; href?: string }[] = [
    { label: 'Carte', hint: 'Où sont les gens', onClick: onMap },
    { label: 'Équipes', hint: 'Former, rejoindre', onClick: onTeams },
    { label: 'Marché', hint: 'Prix du jour', href: '/marche' },
    { label: 'Messages', hint: 'Mes échanges', href: space.href },
    { label: space.label, hint: 'Cartes, cotisations', href: space.href },
    { label: 'Académie', hint: 'Se former', href: '/dashboard/academy' },
  ]
  const now = new Date()
  return (
    <div className="mx-auto max-w-sm rounded-[2rem] border-8 border-[#1F2A44] bg-gradient-to-b from-[#3B82B9] to-[#E0B341] p-5 text-white shadow-xl">
      <p className="text-4xl font-bold tabular-nums">
        {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="mb-6 text-sm opacity-90">
        {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        {world.me.home ? ` · ${world.me.home.canton}` : ''}
      </p>
      <ul className="grid grid-cols-3 gap-3">
        {apps.map((a) => {
          const inner = (
            <>
              <span className="block text-sm font-semibold">{a.label}</span>
              <span className="block text-xs opacity-80">{a.hint}</span>
            </>
          )
          const cls =
            'block rounded-2xl bg-white/20 p-3 text-center backdrop-blur hover:bg-white/30'
          return (
            <li key={a.label}>
              {a.href ? (
                <Link href={a.href} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={a.onClick} className={`${cls} w-full`}>
                  {inner}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function TogoLife() {
  const { user } = useAuth()
  const [world, setWorld] = useState<World | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading')
  const [canton, setCanton] = useState<string | null>(null)
  const [tab, setTab] = useState<'carte' | 'ici' | 'telephone' | 'equipes'>('ici')
  const [editingHome, setEditingHome] = useState(false)

  const load = useCallback(async (c: string | null) => {
    const res = await fetch(`/api/haroolife/world${c ? `?canton=${c}` : ''}`, {
      cache: 'no-store',
    }).catch(() => null)
    if (!res) return setStatus('error')
    if (res.status === 503) return setStatus('unavailable')
    if (!res.ok) return setStatus('error')
    setWorld((await res.json()) as World)
    setStatus('ready')
  }, [])
  useEffect(() => {
    void load(canton)
  }, [load, canton])

  if (status === 'unavailable')
    return (
      <p className="p-6 text-[#1F2A44]">
        HarooLife est en préparation. Vos services habituels restent disponibles.
      </p>
    )
  if (status === 'error')
    return (
      <p role="alert" className="p-6 text-[#1F2A44]">
        Chargement impossible. Vérifiez votre connexion puis actualisez.
      </p>
    )
  if (!world) return <p className="p-6 text-[#1F2A44]/70">Le territoire se prépare…</p>

  const needsHome = !world.me.home
  const defaultName = [user?.firstName, user?.lastName?.[0] ? `${user.lastName[0]}.` : '']
    .filter(Boolean)
    .join(' ')
  const today = world.here?.sky[0]
  const tabs = [
    ['carte', 'Carte', MapPin],
    ['ici', 'Ici', Home],
    ['telephone', 'Téléphone', Phone],
  ] as const

  return (
    <div className="mx-auto max-w-3xl pb-24 text-[#1F2A44]">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[#1F2A44]/10 bg-[#FAFAF7]/95 px-4 py-2 backdrop-blur">
        <span className="text-sm">
          {new Date().toLocaleDateString('fr-FR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })}
          {today && (
            <span className="ml-2 text-[#1F2A44]/70">
              · {Math.round(today.temperature_max)} °C, pluie{' '}
              {Math.round(today.precipitation_probability)} %
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setEditingHome(true)}
          className="ml-auto flex items-center gap-2 rounded-full pr-2 hover:bg-[#1F2A44]/5"
          aria-label="Ma maison et mon avatar"
        >
          <Avatar
            name={world.me.display_name ?? defaultName ?? '?'}
            pagne={world.me.pagne ?? 1}
            size={36}
          />
          <span className="hidden text-sm font-medium sm:inline">
            {world.me.display_name ?? 'Ma maison'}
          </span>
        </button>
      </div>

      <main className="px-4 py-5">
        {tab === 'carte' && (
          <Explorer
            world={world}
            onVisit={(c) => {
              setCanton(c)
              setTab('ici')
            }}
          />
        )}
        {tab === 'ici' &&
          (world.here ? (
            <Here
              world={world}
              onOpenTeams={() => setTab('equipes')}
              onGoHome={() => setCanton(null)}
            />
          ) : (
            <div className="space-y-3">
              <h1 className="text-2xl font-bold">Bienvenue sur le territoire</h1>
              <p>
                Choisissez votre canton pour voir vos voisins, les équipes, le marché et le ciel.
              </p>
              <button
                type="button"
                onClick={() => setEditingHome(true)}
                className="rounded-xl bg-[#2F7D4F] px-4 py-3 font-semibold text-white"
              >
                Choisir ma maison
              </button>
            </div>
          ))}
        {tab === 'telephone' && (
          <PhoneScreen
            world={world}
            onTeams={() => setTab('equipes')}
            onMap={() => setTab('carte')}
          />
        )}
        {tab === 'equipes' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setTab('ici')}
              className="text-sm font-medium text-[#2F7D4F] underline"
            >
              ← Retour au canton
            </button>
            <HarooLifeWorkspace />
          </div>
        )}
      </main>

      <nav
        aria-label="Navigation HarooLife"
        className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-3xl justify-around border-t border-[#1F2A44]/10 bg-white py-2"
      >
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => setTab(key)}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-5 py-1 text-xs ${
              tab === key ? 'bg-[#1F2A44] text-white' : 'text-[#1F2A44]/80'
            }`}
          >
            <Icon aria-hidden="true" className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>

      {(needsHome || editingHome) && (
        <HomeDialog
          world={world}
          defaultName={defaultName || 'Habitant'}
          onDone={() => {
            setEditingHome(false)
            void load(canton)
          }}
          onClose={needsHome ? undefined : () => setEditingHome(false)}
        />
      )}
    </div>
  )
}
