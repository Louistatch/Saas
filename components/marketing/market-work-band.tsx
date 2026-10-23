import { Briefcase, HandCoins, Search, Sprout } from 'lucide-react'
import Link from 'next/link'

/**
 * Accueil : les quatre choses que l'on vient faire sur le marché et le travail, chacune à un
 * toucher. Le vert pour les récoltes, l'ocre pour le travail, comme sur leurs pages.
 */
const INTENTS = [
  {
    href: '/marche/publier?type=prevente',
    title: 'Vendre ma récolte',
    hint: 'Récoltée ou à venir, au prix que vous fixez',
    icon: Sprout,
    tone: 'market',
  },
  {
    href: '/marche',
    title: 'Acheter près de chez moi',
    hint: 'Votre canton d’abord, puis plus loin',
    icon: HandCoins,
    tone: 'market',
  },
  {
    href: '/marche/publier?type=job',
    title: 'Trouver des ouvriers',
    hint: 'Annoncez le salaire par jour, invitez les plus proches',
    icon: Briefcase,
    tone: 'work',
  },
  {
    href: '/travail',
    title: 'Trouver du travail',
    hint: 'Des offres payées à la journée, près de chez vous',
    icon: Search,
    tone: 'work',
  },
] as const

const TONE = {
  market: {
    tile: 'border-primary/25 bg-primary/5 hover:border-primary/60',
    icon: 'bg-primary text-primary-foreground',
  },
  work: {
    tile: 'border-amber-300/70 bg-amber-50 hover:border-amber-600 dark:border-amber-800 dark:bg-amber-950/20',
    icon: 'bg-amber-700 text-white',
  },
}

export function MarketWorkBand() {
  return (
    <section
      id="marche-travail"
      aria-labelledby="marche-travail-titre"
      className="scroll-mt-20 border-b border-border py-10 sm:py-14"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2
            id="marche-travail-titre"
            className="text-2xl font-extrabold tracking-tight text-balance text-foreground sm:text-3xl"
          >
            Vendre, acheter, embaucher, travailler : près de chez vous
          </h2>
          <p className="mt-2 text-base text-muted-foreground">
            Le marché de proximité et le travail agricole à la journée, gratuits. Les numéros ne
            s’échangent qu’une fois que les deux sont d’accord.
          </p>
        </div>
        <ul className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {INTENTS.map(({ href, title, hint, icon: Icon, tone }) => (
            <li key={href}>
              <Link
                href={href}
                className={`flex h-full min-h-36 flex-col gap-3 rounded-2xl border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-5 ${TONE[tone].tile}`}
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${TONE[tone].icon}`}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <span className="text-base font-bold leading-tight text-foreground sm:text-lg">
                  {title}
                </span>
                <span className="text-sm leading-snug text-muted-foreground">{hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
