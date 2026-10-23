import { MarketNav } from '@/components/market/market-nav'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import { publicPageMetadata } from '@/lib/seo'
import { Briefcase, Search } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import TravailContent from './travail-content'

export const metadata = publicPageMetadata('/travail')

const STEPS = [
  {
    title: 'L’offre dit tout',
    text: 'Le travail, le salaire par jour, le nombre d’ouvriers, les dates et le canton.',
  },
  {
    title: 'Les ouvriers proches répondent',
    text: '« Je suis disponible ». Vous pouvez aussi inviter vous-même les ouvriers disponibles.',
  },
  {
    title: 'Vous retenez, les numéros s’échangent',
    text: 'Pas avant : le numéro d’un ouvrier n’est jamais affiché à tout le monde.',
  },
]

export default function TravailPage() {
  return (
    <MarketingLayout>
      <MarketNav />
      <section className="border-b border-amber-200/70 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
            <div>
              <h1 className="max-w-[18ch] text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
                Travail agricole à la journée au Togo
              </h1>
              <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Des ouvriers près de votre champ, un salaire annoncé avant de commencer. Les offres
                se consultent sans compte.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:max-w-md lg:justify-self-end">
              <Button
                asChild
                className="h-12 gap-2 bg-amber-700 text-base text-white hover:bg-amber-800"
              >
                <Link href="/marche/publier?type=job">
                  <Briefcase aria-hidden="true" className="h-5 w-5" /> Je cherche des ouvriers
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-12 gap-2 bg-background text-base">
                <Link href="#offres">
                  <Search aria-hidden="true" className="h-5 w-5" /> Je cherche du travail
                </Link>
              </Button>
            </div>
          </div>

          <ol className="mt-8 grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3 rounded-xl bg-background/70 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-700 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{step.title}</span>
                  <span className="block text-sm text-muted-foreground">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="offres" className="scroll-mt-20 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Suspense
            fallback={
              <output className="block py-6 text-muted-foreground">
                Chargement des offres de travail…
              </output>
            }
          >
            <TravailContent />
          </Suspense>
        </div>
      </section>
    </MarketingLayout>
  )
}
