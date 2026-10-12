'use client'

/**
 * HarooLife : la vie agricole togolaise, canton par canton. Quatre écrans : ma maison, le village
 * (habitants réels, lieux, paroles), la carte du pays (où sont les gens) et le téléphone
 * (raccourcis). Tout chiffre affiché vient de la base ou d'une source réelle (météo, prix).
 */
import { useAuth } from '@/app/context/auth-context'
import {
  type HereGroup,
  PLACES,
  type PlaceKey,
  ROLE_LABELS,
  type Resident,
  type Role,
  type World,
  anchorFor,
} from '@/lib/haroolife/world'
import { CloudRain, Home, Map as MapIcon, Phone, Sun, Trees } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { HomeRoom } from './home-room'
import { Avatar, HomeDialog, FIELD as field, post, PRIMARY as primary } from './residence-dialog'
import { TogoMap } from './togo-map'
import { VillageIso } from './village-iso'
import { HarooLifeWorkspace } from './workspace'

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
const QUICK = [
  'Bonjour la famille 👋',
  'Qui est libre demain ?',
  'Prix du maïs aujourd’hui ?',
  'On se retrouve au champ',
]
const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

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

function Explorer({ world, onVisit }: { world: World; onVisit: (canton: string) => void }) {
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
                  className={`rounded-full border px-3 py-1.5 text-sm ${prefecture === pf.id ? 'border-[#1F2A44] bg-[#1F2A44] text-white' : 'border-[#1F2A44]/20 bg-white'}`}
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

function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[70dvh] max-w-3xl overflow-y-auto rounded-t-3xl border-t border-[#1F2A44]/10 bg-white p-5 pb-24 shadow-2xl">
      <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#1F2A44]/15" />
      <div className="mb-3 flex items-start gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-[#1F2A44]">{title}</h2>
          {subtitle && <p className="text-sm text-[#1F2A44]/70">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[#1F2A44]/15 px-3 py-1 text-sm"
        >
          Fermer
        </button>
      </div>
      {children}
    </div>
  )
}

function groupLine(g: HereGroup) {
  return `${ACTIVITY[g.activity] ?? g.activity} · ${fmtDay(g.starts_on)} · ${g.people} personne${g.people > 1 ? 's' : ''}${
    g.kind === 'work' ? ` · ${g.total} / ${g.target} ha` : ` / ${g.target}`
  }`
}

function PlaceSheet({
  place,
  world,
  myPlace,
  onGo,
  onClose,
  onTeams,
  onSaid,
}: {
  place: PlaceKey
  world: World
  myPlace: PlaceKey
  onGo: () => void
  onClose: () => void
  onTeams: () => void
  onSaid: () => void
}) {
  const here = world.here
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!here) return null
  const roles = world.me.roles
  const people = here.residents.filter((r) =>
    r.is_me ? myPlace === place : anchorFor(r.roles) === place,
  )
  const teams = here.groups.filter((g) => g.kind === 'team')
  const works = here.groups.filter((g) => g.kind === 'work')
  const today = here.sky[0]
  const operators = here.residents.filter((r) => r.roles.includes('operateur')).length

  async function say(body: string) {
    setBusy(true)
    setError('')
    const err = await post('/api/haroolife/say', { canton_id: here?.canton.canton_id, body })
    setBusy(false)
    if (err) setError(err)
    else {
      setText('')
      onSaid()
    }
  }

  const actions: { label: string; onClick?: () => void; href?: string }[] =
    place === 'champs'
      ? [
          ...(roles.includes('producteur') || roles.includes('admin_coop')
            ? [{ label: '🌾 Proposer des travaux', onClick: onTeams }]
            : []),
          { label: '📒 Mon carnet', href: '/dashboard/carnet' },
          { label: '🗺️ Mes parcelles', href: '/dashboard/parcelles' },
        ]
      : place === 'equipes'
        ? [
            ...(roles.includes('ouvrier')
              ? [{ label: '🤝 Rejoindre une équipe', onClick: onTeams }]
              : []),
            ...(roles.includes('agronome')
              ? [{ label: '📣 Recruter une équipe', onClick: onTeams }]
              : []),
            { label: '👀 Voir les équipes', onClick: onTeams },
          ]
        : place === 'marche'
          ? [
              { label: '📈 Tous les prix', href: '/marche' },
              { label: '🛍️ AgriMarket', href: '/dashboard/agrimarket' },
            ]
          : place === 'cooperative'
            ? [
                { label: '🪪 Ma carte membre', href: '/dashboard/cards' },
                { label: '💰 Cotisations', href: '/dashboard/cotisations' },
                { label: '🏛️ Demander un accès', href: '/#acces' },
              ]
            : place === 'ecole'
              ? [{ label: '🎓 AgriAcadémie', href: '/dashboard/academy' }]
              : place === 'bureau'
                ? [
                    {
                      label: roles.includes('operateur')
                        ? '🧑‍💼 Mon espace opérateur'
                        : '🧑‍💼 Devenir opérateur',
                      href: '/operator',
                    },
                  ]
                : [{ label: '✉️ Écrire à l’équipe', href: '/dashboard' }]

  return (
    <Sheet
      title={PLACES[place].label}
      subtitle={`${here.canton.canton}, ${here.canton.prefecture}`}
      onClose={onClose}
    >
      <ul className="mb-4 flex flex-wrap gap-2">
        {actions.map((a) => (
          <li key={a.label}>
            {a.href ? (
              <Link
                href={a.href}
                className="inline-block rounded-full bg-[#1F2A44]/5 px-3 py-2 text-sm font-medium"
              >
                {a.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={a.onClick}
                className="rounded-full bg-[#1F2A44]/5 px-3 py-2 text-sm font-medium"
              >
                {a.label}
              </button>
            )}
          </li>
        ))}
      </ul>

      {place === 'champs' && (
        <ul className="mb-4 space-y-1 text-sm">
          {works.length === 0 && (
            <li className="text-[#1F2A44]/70">Aucun travail proposé pour l’instant.</li>
          )}
          {works.map((g) => (
            <li key={g.id}>
              <strong>{g.title}</strong> — {groupLine(g)}
            </li>
          ))}
        </ul>
      )}
      {place === 'equipes' && (
        <ul className="mb-4 space-y-1 text-sm">
          {teams.length === 0 && <li className="text-[#1F2A44]/70">Aucune équipe en formation.</li>}
          {teams.map((g) => (
            <li key={g.id}>
              <strong>{g.title}</strong> — {groupLine(g)}
            </li>
          ))}
        </ul>
      )}
      {place === 'marche' && (
        <div className="mb-4 text-sm">
          {here.market.length === 0 ? (
            <p className="text-[#1F2A44]/70">
              Pas de prix relevé ces 14 derniers jours dans la région.
            </p>
          ) : (
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
          )}
        </div>
      )}
      {place === 'cooperative' && (
        <ul className="mb-4 space-y-1 text-sm">
          {here.cooperatives.length === 0 && (
            <li className="text-[#1F2A44]/70">
              Aucune coopérative n’a encore de membre inscrit ici.
            </li>
          )}
          {here.cooperatives.map((c) => (
            <li key={c.id}>
              <strong>{c.name}</strong> · {c.members} membre{c.members > 1 ? 's' : ''} dans ce
              canton
            </li>
          ))}
        </ul>
      )}
      {place === 'bureau' && (
        <p className="mb-4 text-sm">
          {operators === 0
            ? 'Aucun opérateur certifié installé ici. '
            : `${operators} opérateur${operators > 1 ? 's' : ''} de zone ici. `}
          L’opérateur émet les cartes membres et accompagne les coopératives.
        </p>
      )}
      {place === 'place' && (
        <div className="mb-4 space-y-3">
          <div className="rounded-2xl bg-[#3B82B9]/10 p-3 text-sm">
            {today ? (
              <>
                {today.precipitation_probability >= 50 ? '🌧️' : '☀️'} Aujourd’hui{' '}
                {Math.round(today.temperature_min)}–{Math.round(today.temperature_max)} °C, pluie{' '}
                {Math.round(today.precipitation_probability)} %
                {here.sky.slice(1).map((d) => (
                  <span key={d.date} className="block text-[#1F2A44]/70">
                    {fmtDay(d.date)} : {Math.round(d.temperature_max)} °C, pluie{' '}
                    {Math.round(d.precipitation_probability)} %
                  </span>
                ))}
              </>
            ) : (
              'Prévisions indisponibles pour le moment.'
            )}
          </div>
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {here.messages.length === 0 && (
              <li className="text-sm text-[#1F2A44]/70">
                Personne n’a encore parlé ici. Dites bonjour.
              </li>
            )}
            {here.messages.map((m) => (
              <li key={m.id} className={`flex gap-2 ${m.is_me ? 'flex-row-reverse' : ''}`}>
                <Avatar name={m.display_name} pagne={m.pagne} size={28} />
                <span
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.is_me ? 'bg-[#2563eb] text-white' : 'bg-[#1F2A44]/5'}`}
                >
                  <span className="block text-xs opacity-70">
                    {m.display_name} · {fmtTime(m.created_at)}
                  </span>
                  {m.body}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                disabled={busy || !world.me.home}
                onClick={() => void say(q)}
                className="rounded-full bg-[#1F2A44]/5 px-3 py-1.5 text-sm"
              >
                {q}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) void say(text)
            }}
          >
            <input
              className={field}
              value={text}
              maxLength={200}
              disabled={!world.me.home}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Dire quelque chose aux ${here.residents.length} habitant${here.residents.length > 1 ? 's' : ''} ici…`}
              aria-label="Message pour la place"
            />
            <button type="submit" disabled={busy || !text.trim()} className={primary}>
              Dire
            </button>
          </form>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      )}

      <h3 className="mb-2 text-sm font-semibold text-[#1F2A44]">Ici maintenant</h3>
      {people.length === 0 ? (
        <p className="mb-4 text-sm text-[#1F2A44]/70">Personne pour l’instant.</p>
      ) : (
        <ul className="mb-4 flex flex-wrap gap-2">
          {people.map((r, i) => (
            <li
              key={`${r.display_name}-${i}`}
              className="flex items-center gap-2 rounded-full bg-[#1F2A44]/5 py-1 pr-3 pl-1"
            >
              <Avatar name={r.display_name} pagne={r.pagne} size={28} />
              <span className="text-sm font-medium">{r.display_name}</span>
              <RoleChips roles={r.roles} />
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onGo}
        disabled={myPlace === place}
        className={`w-full ${primary}`}
      >
        {myPlace === place ? 'Vous êtes ici' : 'Y aller · à pied, gratuit'}
      </button>
    </Sheet>
  )
}

export function TogoLife() {
  const { user } = useAuth()
  const [world, setWorld] = useState<World | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading')
  const [canton, setCanton] = useState<string | null>(null)
  const [tab, setTab] = useState<'maison' | 'village' | 'carte' | 'telephone' | 'equipes'>(
    'village',
  )
  const [editingHome, setEditingHome] = useState(false)
  const [myPlace, setMyPlace] = useState<PlaceKey>('place')
  const [sheet, setSheet] = useState<PlaceKey | null>(null)
  const [met, setMet] = useState<Resident | null>(null)

  const load = useCallback(async (c: string | null) => {
    const res = await fetch(`/api/haroolife/world${c ? `?canton=${c}` : ''}`, {
      cache: 'no-store',
    }).catch(() => null)
    if (!res) return setStatus('error')
    if (res.status === 503) return setStatus('unavailable')
    if (!res.ok) return setStatus('error')
    const w = (await res.json()) as World
    setWorld(w)
    setStatus('ready')
  }, [])
  useEffect(() => {
    void load(canton)
  }, [load, canton])
  // Mon personnage se tient d'abord au lieu de mon rôle.
  useEffect(() => {
    if (world?.me.roles) setMyPlace(anchorFor(world.me.roles))
  }, [world?.me.roles])
  // Le village vit : rechargement léger toutes les 45 secondes.
  useEffect(() => {
    if (status !== 'ready') return
    const timer = window.setInterval(() => void load(canton), 45_000)
    return () => window.clearInterval(timer)
  }, [status, load, canton])

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
  const myName = world.me.display_name ?? defaultName ?? 'Habitant'
  const myPagne = world.me.pagne ?? 1
  const here = world.here
  const today = here?.sky[0]
  const atHome = !!here && world.me.home?.canton_id === here.canton.canton_id
  const tabs = [
    ['maison', 'Maison', Home],
    ['village', 'Village', Trees],
    ['carte', 'Carte', MapIcon],
    ['telephone', 'Téléphone', Phone],
  ] as const
  const marketLine = here?.market[0]
    ? `${here.market[0].culture} ${here.market[0].price} F/${here.market[0].unit}`
    : null

  return (
    <div className="mx-auto max-w-3xl pb-24 text-[#1F2A44]">
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-[#1F2A44]/10 bg-[#FAFAF7]/95 px-3 py-2 text-sm backdrop-blur">
        {today ? (
          today.precipitation_probability >= 50 ? (
            <CloudRain aria-hidden="true" className="h-4 w-4 text-[#3B82B9]" />
          ) : (
            <Sun aria-hidden="true" className="h-4 w-4 text-[#E0B341]" />
          )
        ) : null}
        <span>
          {new Date().toLocaleDateString('fr-FR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })}
          {today && (
            <span className="text-[#1F2A44]/70"> · {Math.round(today.temperature_max)} °C</span>
          )}
        </span>
        {here && (
          <span className="rounded-full bg-[#2F7D4F]/10 px-2 py-0.5 text-xs font-medium text-[#1f5a38]">
            {here.residents.length} habitant{here.residents.length > 1 ? 's' : ''} ·{' '}
            {here.canton.canton}
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditingHome(true)}
          className="ml-auto rounded-full"
          aria-label="Ma maison et mon avatar"
        >
          <Avatar name={myName} pagne={myPagne} size={34} />
        </button>
      </div>

      <main className={tab === 'village' ? 'py-2' : 'px-4 py-5'}>
        {tab === 'maison' &&
          (world.me.home ? (
            <HomeRoom
              name={myName}
              pagne={myPagne}
              roles={world.me.roles}
              canton={world.me.home.canton}
              onLeave={() => setTab('village')}
              onEdit={() => setEditingHome(true)}
            />
          ) : (
            <button type="button" onClick={() => setEditingHome(true)} className={primary}>
              Choisir ma maison
            </button>
          ))}

        {tab === 'village' &&
          (here ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-4">
                <h1 className="text-lg font-bold">
                  {here.canton.canton}
                  <span className="ml-2 text-sm font-normal text-[#1F2A44]/70">
                    {here.canton.prefecture}, {here.canton.region}
                  </span>
                </h1>
                {!atHome && world.me.home && (
                  <button
                    type="button"
                    onClick={() => setCanton(null)}
                    className="ml-auto text-sm font-medium text-[#2F7D4F] underline"
                  >
                    Rentrer à {world.me.home.canton}
                  </button>
                )}
              </div>
              <VillageIso
                residents={here.residents}
                messages={here.messages}
                me={world.me.home ? { display_name: myName, pagne: myPagne } : null}
                myPlace={myPlace}
                sky={today}
                marketLine={marketLine}
                coopName={here.cooperatives[0]?.name ?? null}
                onPlace={(p) => setSheet(p)}
                onResident={(r) => setMet(r)}
              />
              {here.residents.length <= 1 && (
                <p className="px-4 text-sm text-[#1F2A44]/70">
                  Le village se remplit avec les comptes qui choisissent ce canton. Invitez vos
                  voisins producteurs et ouvriers.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3 px-4">
              <h1 className="text-2xl font-bold">Bienvenue sur le territoire</h1>
              <p>Choisissez votre canton pour entrer dans votre village.</p>
              <button type="button" onClick={() => setEditingHome(true)} className={primary}>
                Choisir ma maison
              </button>
            </div>
          ))}

        {tab === 'carte' && (
          <Explorer
            world={world}
            onVisit={(c) => {
              setCanton(c)
              setTab('village')
            }}
          />
        )}

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
              onClick={() => setTab('village')}
              className="text-sm font-medium text-[#2F7D4F] underline"
            >
              ← Retour au village
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
            onClick={() => {
              setTab(key)
              setSheet(null)
            }}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-4 py-1 text-xs ${tab === key ? 'bg-[#1F2A44] text-white' : 'text-[#1F2A44]/80'}`}
          >
            <Icon aria-hidden="true" className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>

      {sheet && here && (
        <PlaceSheet
          place={sheet}
          world={world}
          myPlace={myPlace}
          onGo={() => {
            setMyPlace(sheet)
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
          onTeams={() => {
            setSheet(null)
            setTab('equipes')
          }}
          onSaid={() => void load(canton)}
        />
      )}
      {met && (
        <Sheet
          title={met.display_name}
          subtitle={met.roles.map((r) => ROLE_LABELS[r]).join(' · ')}
          onClose={() => setMet(null)}
        >
          <div className="flex items-center gap-3">
            <Avatar name={met.display_name} pagne={met.pagne} size={56} />
            <p className="text-sm text-[#1F2A44]/70">
              Habitant de {here?.canton.canton}. Pour lui parler, passez par la place du village.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setMet(null)
              setSheet('place')
            }}
            className={`mt-4 w-full ${primary}`}
          >
            Aller sur la place
          </button>
        </Sheet>
      )}
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
