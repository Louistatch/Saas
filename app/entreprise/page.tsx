import { Metadata } from 'next'
import Link from 'next/link'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import { Building2, Headphones, Clock, Puzzle, GraduationCap, ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Entreprise — FaîtiereHub | Solutions pour grandes faîtières et fédérations',
  description:
    'Solutions entreprise FaîtiereHub : support dédié, SLA garanti, déploiement personnalisé, intégrations sur mesure et formation des équipes terrain.',
}

const enterpriseFeatures = [
  {
    icon: Headphones,
    title: 'Support dédié',
    description:
      'Un gestionnaire de compte dédié et une équipe support prioritaire disponible par téléphone, email et WhatsApp. Temps de réponse garanti sous 2 heures.',
  },
  {
    icon: Clock,
    title: 'SLA garanti',
    description:
      'Accord de niveau de service avec garantie de disponibilité de 99,9%. Monitoring proactif, alertes en temps réel et résolution prioritaire des incidents.',
  },
  {
    icon: Building2,
    title: 'Déploiement personnalisé',
    description:
      'Instance dédiée avec configuration sur mesure : branding personnalisé, domaine propre, paramètres spécifiques à votre organisation et migration assistée.',
  },
  {
    icon: Puzzle,
    title: 'Intégrations sur mesure',
    description:
      'Connectez FaîtiereHub à vos systèmes existants : ERP, comptabilité, mobile money, SMS gateway, systèmes gouvernementaux. API complète et webhooks configurables.',
  },
  {
    icon: GraduationCap,
    title: 'Formation des équipes terrain',
    description:
      'Programme de formation complet pour vos agents de terrain, coordinateurs et administrateurs. Sessions en présentiel ou à distance, supports en français et langues locales.',
  },
]

export default function EntreprisePage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-primary mb-4">Plan Entreprise</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Pour les grandes faîtières et fédérations
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Vous gérez des milliers de membres répartis sur plusieurs régions ? FaîtiereHub Entreprise
            vous offre la puissance, la flexibilité et l&apos;accompagnement dont vous avez besoin.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <Link href="/contact">
              <Button size="lg" className="gap-2">
                Contactez-nous <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline">
                Voir les tarifs
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-card/50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground mb-12">
            Ce qui est inclus dans le plan Entreprise
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {enterpriseFeatures.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-background p-8 space-y-4"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3 text-center">
            {[
              { value: '10 000+', label: 'Membres gérés' },
              { value: '99,9%', label: 'Disponibilité garantie' },
              { value: '< 2h', label: 'Temps de réponse support' },
            ].map((stat) => (
              <div key={stat.label} className="space-y-2">
                <p className="text-4xl font-bold text-primary">{stat.value}</p>
                <p className="text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary/5 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground">
            Discutons de vos besoins
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Notre équipe est prête à vous accompagner dans la digitalisation de votre faîtière.
            Contactez-nous pour une démonstration personnalisée.
          </p>
          <Link href="/contact" className="mt-8 inline-block">
            <Button size="lg" className="gap-2">
              Contactez-nous <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </MarketingLayout>
  )
}
