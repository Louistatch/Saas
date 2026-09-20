import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Cloud, DatabaseBackup, Gauge, KeyRound, Lock, Shield } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sécurité — FaîtiereHub | Protection de vos données',
  description:
    'Découvrez les protections des comptes, les accès aux organisations et les principes de sécurité de FaîtiereHub.',
}

const securityFeatures = [
  {
    icon: Lock,
    title: 'Protection des secrets',
    description:
      'Les secrets d’intégration sont traités côté serveur. Les clés d’administration ne sont pas transmises au navigateur.',
  },
  {
    icon: Shield,
    title: 'Accès selon votre rôle',
    description:
      'Les accès aux données dépendent de votre rôle, de votre organisation et des mandats accordés. Un compte Opérateur candidat ne donne pas accès aux données des coopératives.',
  },
  {
    icon: KeyRound,
    title: 'Connexion à votre compte',
    description:
      'La connexion et la récupération de mot de passe sont assurées par Supabase Auth. Une carte publique permet de vérifier une identité ; elle ne remplace pas la connexion pour accéder aux informations privées.',
  },
  {
    icon: Gauge,
    title: 'Prévention des abus',
    description:
      'Les points d’entrée sensibles disposent de contrôles d’accès et de limites de requêtes. Ces protections sont vérifiées et améliorées au fil des mises à jour.',
  },
  {
    icon: Cloud,
    title: 'Hébergement',
    description:
      'L’application utilise Vercel et Supabase. Les garanties des hébergeurs dépendent de leurs offres et ne constituent pas une certification de FaîtiereHub.',
  },
  {
    icon: DatabaseBackup,
    title: 'Continuité du service',
    description:
      'Les modalités de sauvegarde et de restauration dépendent de la configuration du service. Contactez-nous pour convenir des besoins de votre organisation et des engagements applicables.',
  },
]

export default function SecuritePage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          La sécurité au cœur de FaîtiereHub
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-3xl mx-auto">
          La protection de vos données repose sur des accès contrôlés et des vérifications
          régulières.
        </p>
      </section>

      {/* Security Features */}
      <section className="bg-card/50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {securityFeatures.map((feature) => (
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

      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h2 className="text-2xl font-bold">Signaler un problème</h2>
        <p className="mt-4 text-muted-foreground">
          Pour une question de sécurité ou un accès inhabituel, contactez notre équipe sans
          transmettre de mot de passe.
        </p>
        <a
          href="mailto:support@faitierehub.com"
          className="mt-4 inline-block text-primary underline"
        >
          support@faitierehub.com
        </a>
      </section>
    </MarketingLayout>
  )
}
