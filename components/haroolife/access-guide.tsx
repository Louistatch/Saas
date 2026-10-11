import { VillageScene } from '@/components/haroolife/village-scene'
import { Building2, HardHat, Microscope, Sprout } from 'lucide-react'
import Link from 'next/link'

const WAYS = [
  {
    icon: HardHat,
    who: 'Vous êtes ouvrier',
    how: 'Déclarez-vous disponible dans le canton du pilote depuis votre espace Haroo. Vous pourrez alors former ou rejoindre une équipe.',
    action: 'Ouvrir mon espace Haroo',
    href: '/haroo',
  },
  {
    icon: Sprout,
    who: 'Vous êtes membre d’une coopérative',
    how: 'Connectez-vous avec l’adresse e-mail enregistrée sur votre fiche de membre. Vos parcelles apparaîtront ici pour regrouper les travaux.',
    action: 'Vérifier mon compte',
    href: '/compte',
  },
  {
    icon: Microscope,
    who: 'Vous êtes agronome',
    how: 'Ce premier pilote s’adresse aux ouvriers et aux producteurs. Votre accès conseil viendra ensuite ; vos missions restent dans votre espace Haroo.',
    action: 'Voir mes missions',
    href: '/haroo',
  },
  {
    icon: Building2,
    who: 'Vous gérez une coopérative',
    how: 'Le pilote est ouvert à une coopérative à la fois. Demandez l’ouverture pour votre organisation.',
    action: 'Demander l’ouverture',
    href: '/contact',
  },
] as const

export function AccessGuide() {
  return (
    <section aria-labelledby="hl-access-title" className="space-y-6">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none overflow-hidden rounded-3xl border border-emerald-200 saturate-[.85] [&>svg]:mb-0"
      >
        <VillageScene counts={{ team: 0, work: 0, all: 0 }} />
      </div>

      <div className="max-w-2xl space-y-2">
        <h2 id="hl-access-title" className="text-2xl font-bold text-emerald-950">
          Votre place dans ce village n’est pas encore ouverte
        </h2>
        <p className="text-slate-700">
          HarooLife démarre avec une coopérative et un canton. Votre compte n’en fait pas encore
          partie. Choisissez ce qui vous correspond :
        </p>
      </div>

      <ul className="divide-y divide-emerald-900/10 rounded-2xl border border-emerald-900/10 bg-white">
        {WAYS.map(({ icon: Icon, who, how, action, href }) => (
          <li key={href} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6">
            <Icon aria-hidden="true" className="h-8 w-8 shrink-0 text-emerald-800" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-950">{who}</p>
              <p className="mt-1 text-sm text-slate-600">{how}</p>
            </div>
            <Link
              href={href}
              className="self-start rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 sm:self-center"
            >
              {action}
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-sm text-slate-600">
        Vos cartes, vos annonces et vos services FaîtiereHub restent accessibles comme d’habitude.
      </p>
    </section>
  )
}
