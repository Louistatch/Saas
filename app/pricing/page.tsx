'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, Leaf } from 'lucide-react'
import { useAuth } from '@/app/context/auth-context'

const plans = [
  {
    name: 'Starter',
    description: 'Perfect for new cooperatives',
    price: '0',
    period: 'month',
    trial: '30 days free',
    features: [
      'Up to 500 members',
      'Basic marketplace',
      'Member management',
      'Digital member cards',
      'Email support',
      'Basic analytics',
    ],
    cta: 'Start Free Trial',
    highlighted: false,
  },
  {
    name: 'Professional',
    description: 'For growing cooperatives',
    price: '99',
    period: 'month',
    trial: 'Free 14-day trial',
    features: [
      'Unlimited members',
      'Advanced marketplace',
      'Member scoring & segmentation',
      'Advanced digital cards with QR',
      'KoboToolbox integration',
      'Advanced analytics & reporting',
      'Priority email support',
      'Custom branding',
      'API access',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    description: 'For large cooperatives',
    price: 'Custom',
    period: 'based on needs',
    trial: 'Custom trial available',
    features: [
      'Everything in Professional',
      'Multi-site management',
      'Dedicated account manager',
      'Custom integrations',
      'White-label solutions',
      'Advanced security features',
      'SLA guarantee',
      'Phone & email support',
      'Custom reporting',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
]

export default function PricingPage() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Leaf className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold text-foreground">FaîtiereHub</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-8">
            <Link href="/#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="/pricing" className="text-sm font-medium text-primary">
              Pricing
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button size="sm" className="bg-primary hover:bg-primary/90">
                  Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/auth/login">
                  <Button variant="outline" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link href="/auth/signup">
                  <Button size="sm" className="bg-primary hover:bg-primary/90">
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

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
            Ready to get started?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join agricultural cooperatives using FaîtiereHub to connect members and grow together.
          </p>
          <Link href="/auth/signup">
            <Button size="lg" className="gap-2 bg-primary hover:bg-primary/90">
              Start Your Free Trial
            </Button>
          </Link>
        </div>
      </section>
    </div>
  )
}
