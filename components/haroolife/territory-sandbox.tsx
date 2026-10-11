'use client'

import { Territory3DPanel } from '@/components/haroolife/territory-3d-panel'
import {
  HUBS,
  type HubId,
  UPGRADES,
  type UpgradeId,
  advanceTerritoryDays,
  initialTerritoryWorld,
  invest,
} from '@/lib/haroolife/territory-simulation'
import { ArrowRight, Factory, MapPinned, RotateCcw, Sprout, TrendingUp, Truck } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState } from 'react'

const TerritoryMap = dynamic(() => import('./territory-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] items-center justify-center rounded-2xl bg-emerald-50 text-emerald-900 sm:h-[560px]">
      Chargement de la carte…
    </div>
  ),
})

const number = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)
const money = (n: number) => `${number(n)} FCFA`
const cards = [
  { label: 'Irrigation', id: 'irrigation' },
  { label: 'Usine', id: 'factory' },
  { label: 'Camion', id: 'truck' },
  { label: 'Énergie solaire', id: 'solar' },
] as const satisfies ReadonlyArray<{ label: string; id: UpgradeId }>

export function TerritorySandbox() {
  const [world, setWorld] = useState(initialTerritoryWorld)
  const [selected, setSelected] = useState<HubId>('kpalime')
  const [notice, setNotice] = useState('')
  const hub = HUBS.find((item) => item.id === selected) ?? HUBS[1]

  function buy(id: UpgradeId) {
    const result = invest(world, id)
    setWorld(result.world)
    setNotice(result.message)
  }
  function next(days: number) {
    setWorld((previous) => advanceTerritoryDays(previous, days))
    setNotice(`${days} jour${days > 1 ? 's' : ''} simulé${days > 1 ? 's' : ''}.`)
  }
  function reset() {
    setWorld(initialTerritoryWorld())
    setNotice('Nouvelle simulation démarrée.')
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-slate-900 sm:px-6 sm:py-10">
      <nav aria-label="Fil d’Ariane" className="flex flex-wrap gap-2 text-sm text-emerald-900">
        <Link href="/haroolife" className="underline underline-offset-4">
          HarooLife
        </Link>
        <span aria-hidden="true">/</span>
        <span>Territoire du Togo</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            HarooLife · Territoire interactif
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Le Togo devient votre terrain de stratégie
          </h1>
          <p className="text-slate-600">
            Explorez les villes puis développez une chaîne agricole de Kpalimé à Lomé. Chaque
            décision modifie les stocks, les coûts et la trésorerie.
          </p>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong className="block">Démonstration fictive</strong>
          Aucun argent réel, contrat, chantier ou parcelle n’est engagé. Le scénario n’est pas
          sauvegardé.
        </div>
      </header>

      <section
        aria-label="Indicateurs de la simulation"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {[
          { title: 'Trésorerie', value: money(world.treasury), icon: TrendingUp },
          { title: 'Gingembre frais', value: `${number(world.rawKg)} kg`, icon: Sprout },
          { title: 'Stock transformé', value: `${number(world.driedKg)} kg`, icon: Factory },
          { title: 'Chiffre d’affaires cumulé', value: money(world.revenue), icon: Truck },
        ].map(({ title, value, icon: Icon }) => (
          <div key={title} className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <Icon aria-hidden="true" className="mb-3 h-5 w-5 text-emerald-700" />
            <p className="text-xs text-slate-500">{title}</p>
            <p className="mt-1 break-words text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
          </div>
        ))}
      </section>

      <Territory3DPanel hub={selected} world={world} onInvest={buy} onAdvance={() => next(1)} />

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(310px,1fr)]">
        <div className="rounded-3xl border border-emerald-100 bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <MapPinned aria-hidden="true" className="h-5 w-5 text-emerald-700" />
              Carte du Togo
            </h2>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-950">
              Jour {world.day}
            </span>
          </div>
          <TerritoryMap
            selected={selected}
            onSelect={setSelected}
            routeActive={world.projects.truck}
          />
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Choisir une ville">
            {HUBS.map((city) => (
              <button
                key={city.id}
                type="button"
                aria-pressed={selected === city.id}
                onClick={() => setSelected(city.id)}
                className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors ${selected === city.id ? 'border-emerald-800 bg-emerald-900 text-white' : 'border-slate-200 bg-white hover:bg-emerald-50'}`}
              >
                {city.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Ville sélectionnée
            </p>
            <h2 className="mt-1 text-2xl font-bold">{hub.name}</h2>
            <p className="mt-1 text-sm text-slate-600">{hub.role}</p>
            <p className="mt-3 text-sm text-slate-700">
              {hub.id === 'kpalime'
                ? 'Point de départ : production et transformation du gingembre.'
                : hub.id === 'lome'
                  ? 'Marché de destination : livraison et vente des produits transformés.'
                  : 'Cette ville est visible sur la carte ; ses circuits économiques seront ouverts dans une prochaine phase.'}
            </p>
          </section>
          <section className="rounded-3xl bg-emerald-950 p-5 text-white shadow-sm">
            <h2 className="text-xl font-bold">Pilotez votre économie</h2>
            <p className="mt-2 text-sm text-emerald-100">
              Achetez une usine, organisez son transport et avancez dans le temps. Sans camion, la
              production reste en stock.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => next(1)}
                className="rounded-xl bg-emerald-300 px-3 py-3 font-bold text-emerald-950 hover:bg-emerald-200"
              >
                + 1 jour
              </button>
              <button
                type="button"
                onClick={() => next(7)}
                className="rounded-xl bg-white px-3 py-3 font-bold text-emerald-950 hover:bg-emerald-50"
              >
                + 7 jours
              </button>
            </div>
            <button
              type="button"
              onClick={reset}
              className="mt-3 flex items-center gap-2 text-sm text-emerald-100 underline underline-offset-4"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" /> Recommencer
            </button>
            <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-emerald-200">
              {notice}
            </p>
          </section>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
        <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">Investissements disponibles</h2>
          <p className="mt-1 text-sm text-slate-600">
            Prix, rendements et dépenses entièrement illustratifs. Chaque achat est unique.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {cards.map(({ id, label }) => {
              const upgrade = UPGRADES[id]
              const installed = world.projects[id]
              const disabled = installed || world.treasury < upgrade.cost
              return (
                <article key={id} className="flex flex-col rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold">{label}</h3>
                    {installed && (
                      <span className="text-xs font-bold text-emerald-700">Installé</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{upgrade.location}</p>
                  <p className="mt-3 flex-1 text-sm text-slate-700">{upgrade.detail}</p>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => buy(id)}
                    className="mt-4 rounded-xl bg-emerald-800 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600"
                  >
                    {installed
                      ? 'Déjà construit'
                      : world.treasury < upgrade.cost
                        ? 'Budget insuffisant'
                        : `Investir ${money(upgrade.cost)}`}
                  </button>
                </article>
              )
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">Journal du territoire</h2>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-900">
            <span className="rounded-lg bg-emerald-100 px-2 py-1">Kpalimé</span>
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
            <span className="rounded-lg bg-emerald-100 px-2 py-1">Transformation</span>
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
            <span className="rounded-lg bg-emerald-100 px-2 py-1">Lomé</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Ventes cumulées : {number(world.soldKg)} kg · Charges d’exploitation :{' '}
            {money(world.expenses)}.
          </p>
          <ol className="mt-4 space-y-3 text-sm text-slate-700">
            {world.events.map((event, index) => (
              <li
                key={`${world.day}-${index}-${event}`}
                className="border-l-2 border-emerald-200 pl-3"
              >
                {event}
              </li>
            ))}
          </ol>
        </div>
      </section>
      <footer className="border-t border-emerald-100 pt-5 text-xs text-slate-500">
        Simulation économique pédagogique, distincte des activités réelles de FaîtiereHub et Haroo.
        La carte sert à explorer le pays ; seuls Kpalimé et Lomé ont une chaîne économique simulée
        dans cette version.
      </footer>
    </main>
  )
}
