import { MarketNav } from '@/components/market/market-nav'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import { publicPageMetadata } from '@/lib/seo'
import { PlusCircle } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import MarcheContent from './market-content'

export const metadata = publicPageMetadata('/marche')

const STEPS = [
  {
    title: 'Trouvez près de chez vous',
    text: 'Votre canton d’abord, puis votre préfecture et votre région.',
  },
  {
    title: 'Répondez en un geste',
    text: '« Je suis intéressé », avec la quantité voulue et votre numéro.',
  },
  {
    title: 'Le vendeur vous retient',
    text: 'Vous recevez alors son numéro, et lui le vôtre. Ni commission ni intermédiaire.',
  },
]

export default function MarchePage() {
  return (
    <MarketingLayout>
      <MarketNav />
      <section className="border-b border-border bg-primary/5">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
            <div>
              <h1 className="max-w-[20ch] text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
                Marché agricole de proximité au Togo
              </h1>
              <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Récoltes à vendre, préventes, conseil et services, du plus proche au plus loin.
                Consultez sans compte ; répondez et publiez avec un compte gratuit.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:max-w-md lg:justify-self-end">
              <Button asChild className="h-12 gap-2 text-base">
                <Link href="/marche/publier?type=prevente">
                  <PlusCircle aria-hidden="true" className="h-5 w-5" /> Vendre
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="hover:bg-muted hover:text-foreground h-12 bg-background text-base"
              >
                <Link href="#annonces">Acheter</Link>
              </Button>
            </div>
          </div>

          <ol className="mt-8 grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3 rounded-xl bg-background/70 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
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

      <section id="annonces" className="scroll-mt-20 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Suspense
            fallback={
              <output className="block py-6 text-muted-foreground">
                Chargement des annonces et des filtres…
              </output>
            }
          >
            <MarcheContent />
          </Suspense>
        </div>
      </section>
    </MarketingLayout>
  )
}
