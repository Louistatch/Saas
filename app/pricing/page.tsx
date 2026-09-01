import Link from 'next/link'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import { Check, ArrowRight, Network, Users } from 'lucide-react'

const FAITIERE_PLANS = [
  {
    name: 'Starter',
    description: 'Pour les nouvelles coopératives',
    price: 'Gratuit',
    period: null,
    trial: '30 jours, sans carte bancaire',
    highlighted: false,
    cta: 'Démarrer gratuitement',
    ctaHref: '/auth/signup',
    features: [
      "Jusqu'à 500 membres",
      'Gestion des membres et cotisations',
      'Cartes numériques avec QR code',
      'Place de marché basique',
      'Analytiques de base',
      'Support email',
    ],
  },
  {
    name: 'Professional',
    description: 'Pour les coopératives en croissance',
    price: '99 000',
    period: 'mois',
    currency: 'XOF',
    trial: 'Essai gratuit 14 jours',
    highlighted: true,
    cta: 'Essai gratuit',
    ctaHref: '/auth/signup',
    features: [
      'Membres illimités',
      'AgriMarket — place de marché avancée',
      'AgriCredit — crédit agricole avec scoring',
      'AgriAcademy — modules de formation',
      'Carte agricole interactive',
      'Matching producteurs / acheteurs',
      'Intégration KoboToolbox complète',
      'Widget embeddable',
      'Analytiques avancées',
      'Branding personnalisé',
      'Support prioritaire',
    ],
  },
  {
    name: 'Enterprise',
    description: 'Pour les grandes faîtières et unions',
    price: 'Sur mesure',
    period: null,
    trial: 'Démo personnalisée',
    highlighted: false,
    cta: 'Nous contacter',
    ctaHref: '/contact',
    features: [
      'Tout le plan Professional',
      'Multi-sites (faîtière → unions → coopératives)',
      'Widget white-label (domaine personnalisé)',
      'Account manager dédié',
      'Intégrations personnalisées',
      'SLA garanti',
      'Rapports personnalisés',
      'Formation de votre équipe',
    ],
  },
]

const FAQ = [
  {
    q: 'Puis-je changer de plan à tout moment ?',
    a: "Oui, vous pouvez passer à un plan supérieur ou inférieur à tout moment. Les modifications prennent effet au début du cycle de facturation suivant.",
  },
  {
    q: 'Y a-t-il des frais de configuration ?',
    a: "Non. Aucun frais de configuration ni de frais cachés. Vous ne payez que le plan choisi.",
  },
  {
    q: 'Puis-je résilier à tout moment ?',
    a: "Oui, vous pouvez résilier votre abonnement à tout moment sans pénalité.",
  },
  {
    q: "Haroo est-il inclus dans les plans FaîtiereHub ?",
    a: "Haroo est entièrement gratuit et indépendant des plans FaîtiereHub. Ouvriers agricoles, acheteurs et agronomes créent leur profil sans abonnement.",
  },
]

export default function PricingPage() {
  return (
    <MarketingLayout>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Users className="h-3.5 w-3.5" /> FaîtiereHub
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            Des tarifs simples et transparents
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Choisissez le plan qui correspond à votre coopérative. Tous les plans
            incluent une période d&apos;essai gratuite.
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid gap-8 md:grid-cols-3 lg:gap-10">
          {FAITIERE_PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border bg-card ${
                plan.highlighted
                  ? 'border-primary shadow-xl md:scale-105 ring-2 ring-primary'
                  : 'border-border shadow-sm'
              }`}
            >
              {plan.highlighted && (
                <div className="rounded-t-xl bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
                  Le plus populaire
                </div>
              )}
              <div className="flex flex-1 flex-col p-6">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-foreground">{plan.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-foreground">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-muted-foreground text-sm">
                        {' '}{plan.currency} /{plan.period}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{plan.trial}</p>
                </div>

                <ul className="flex-1 space-y-2.5 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                <Link href={plan.ctaHref}>
                  <Button
                    className="w-full gap-2"
                    variant={plan.highlighted ? 'default' : 'outline'}
                  >
                    {plan.cta}
                    {plan.highlighted && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Haroo — gratuit et séparé */}
      <section className="py-16 bg-gradient-to-br from-amber-50 via-orange-50/40 to-background dark:from-amber-950/20 dark:to-background">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-amber-200 bg-white dark:bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-100">
              <Network className="h-7 w-7 text-amber-700" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800 mb-4">
              Haroo — Toujours gratuit
            </div>
            <h2 className="text-2xl font-extrabold text-foreground mb-3">
              Vous êtes ouvrier, acheteur ou agronome ?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              Haroo est entièrement gratuit. Créez votre profil professionnel, obtenez
              votre carte vérifiable par QR code et accédez aux opportunités de votre région —
              emploi saisonnier, préventes de production, missions de conseil.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link href="/auth/signup/haroo">
                <Button className="gap-2 bg-amber-600 text-white hover:bg-amber-700 border-0 w-full sm:w-auto">
                  Créer mon profil Haroo — gratuit
                </Button>
              </Link>
              <Link href="/#haroo">
                <Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-50 w-full sm:w-auto">
                  En savoir plus
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-card/50 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground text-center mb-12">
            Questions fréquentes
          </h2>
          <div className="space-y-6">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="border-b border-border pb-6 last:border-0">
                <h3 className="font-semibold text-foreground mb-2">{q}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground mb-4">
            Prêt à commencer ?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Rejoignez les coopératives agricoles qui utilisent FaîtiereHub pour structurer
            leur organisation et développer leurs activités.
          </p>
          <Link href="/auth/signup">
            <Button size="lg" className="gap-2">
              Démarrer l&apos;essai gratuit <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </MarketingLayout>
  )
}
