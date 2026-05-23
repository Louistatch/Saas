'use client'

import Link from 'next/link'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Check } from 'lucide-react'

const plans = [
  {
    name: 'Starter',
    description: 'Pour les nouvelles coopératives',
    price: '0',
    period: 'mois',
    trial: '30 jours gratuits',
    features: [
      'Jusqu\'à 500 membres',
      'Comptes d\'exploitation (basique)',
      'Gestion des membres',
      'Cartes numériques avec QR',
      'Marketplace publique',
      'Support email',
      'Statistiques de base',
    ],
    cta: 'Essai gratuit',
    highlighted: false,
  },
  {
    name: 'Professional',
    description: 'Pour les coopératives en croissance',
    price: '99',
    period: 'mois',
    trial: 'Essai gratuit 14 jours',
    features: [
      'Membres illimités',
      'Comptes d\'exploitation (avancé)',
      'Marketplace avec filtres avancés',
      'Cartes QR + vérification premium',
      'Intégration KoboToolbox + sync',
      'Widget embeddable (votre site)',
      'Statistiques avancées',
      'Support prioritaire',
      'Branding personnalisé',
      'Accès API',
    ],
    cta: 'Essai gratuit',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    description: 'Pour les grandes faîtières',
    price: 'Sur mesure',
    period: 'based on needs',
    trial: 'Essai personnalisé',
    features: [
      'Tout le plan Professional',
      'Gestion multi-sites (unions + coopératives)',
      'Widget white-label (domaine custom)',
      'Account manager dédié',
      'Intégrations personnalisées',
      'KoboCollect sync avancée + retry',
      'SLA garanti',
      'Support téléphone + email',
      'Rapports personnalisés',
    ],
    cta: 'Nous contacter',
    highlighted: false,
  },
]

export default function PricingPage() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h1 className="text-4xl font-bold text-foreground sm:text-5xl">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose the perfect plan for your cooperative. All plans include a free trial.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3 lg:gap-12">
          {plans.map((plan, i) => (
            <Card
              key={i}
              className={`border-border flex flex-col ${
                plan.highlighted
                  ? 'ring-2 ring-primary md:scale-105 shadow-lg'
                  : ''
              }`}
            >
              {plan.highlighted && (
                <div className="bg-primary text-primary-foreground px-4 py-2 text-center text-sm font-semibold rounded-t-lg">
                  Most Popular
                </div>
              )}
              <CardHeader className={plan.highlighted ? 'pb-4' : ''}>
                <CardTitle className="text-2xl text-foreground">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    {plan.price !== 'Custom' && (
                      <>
                        <span className="text-4xl font-bold text-foreground">€{plan.price}</span>
                        <span className="text-muted-foreground">/{plan.period}</span>
                      </>
                    )}
                    {plan.price === 'Custom' && (
                      <span className="text-3xl font-bold text-foreground">Custom Pricing</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{plan.trial}</p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex gap-3">
                      <Check className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="text-foreground text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full ${
                    plan.highlighted
                      ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                      : 'border-border hover:bg-accent/10'
                  }`}
                  variant={plan.highlighted ? 'default' : 'outline'}
                >
                  {plan.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-card/50 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground text-center mb-12">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            {[
              {
                q: 'Can I switch plans anytime?',
                a: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle.',
              },
              {
                q: 'Do you offer refunds?',
                a: 'We offer a 30-day money-back guarantee if you are not satisfied with our service.',
              },
              {
                q: 'Is there a setup fee?',
                a: 'No, there are no setup fees or hidden charges. You only pay for the plan you choose.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Absolutely. You can cancel your subscription at any time with no penalty.',
              },
            ].map((item, i) => (
              <div key={i} className="border-b border-border pb-6 last:border-0">
                <h3 className="font-semibold text-foreground mb-2">{item.q}</h3>
                <p className="text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Prêt à commencer ?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join agricultural cooperatives using FaîtiereHub to connect members and grow together.
          </p>
          <Link href="/auth/signup">
            <Button size="lg" className="gap-2 bg-primary hover:bg-primary/90">
              Commencer l'essai gratuit
            </Button>
          </Link>
        </div>
      </section>
    </MarketingLayout>
  )
}
