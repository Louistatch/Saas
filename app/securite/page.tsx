import { Metadata } from 'next'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Shield, Lock, KeyRound, Gauge, Cloud, DatabaseBackup } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Sécurité — FaîtiereHub | Protection de vos données',
  description:
    'FaîtiereHub protège vos données avec le chiffrement AES-256-GCM, Row Level Security, authentification sécurisée et hébergement conforme SOC2/GDPR.',
}

const securityFeatures = [
  {
    icon: Lock,
    title: 'Chiffrement AES-256-GCM',
    description:
      'Tous les secrets et données sensibles sont chiffrés avec l\'algorithme AES-256-GCM, le standard utilisé par les institutions financières. Les clés de chiffrement sont gérées de manière sécurisée et ne sont jamais exposées.',
  },
  {
    icon: Shield,
    title: 'Row Level Security (RLS)',
    description:
      'Chaque table de la base de données est protégée par des politiques RLS. Un utilisateur ne peut accéder qu\'aux données de sa propre coopérative. L\'isolation des données est garantie au niveau de la base de données.',
  },
  {
    icon: KeyRound,
    title: 'Authentification sécurisée',
    description:
      'Authentification gérée par Supabase Auth avec support du MFA, tokens JWT signés, sessions sécurisées et protection contre les attaques par force brute. Mots de passe hashés avec bcrypt.',
  },
  {
    icon: Gauge,
    title: 'Rate limiting sur les APIs',
    description:
      'Toutes les routes API sont protégées par un système de rate limiting qui prévient les abus, les attaques DDoS et les tentatives d\'extraction massive de données.',
  },
  {
    icon: Cloud,
    title: 'Hébergement Vercel + Supabase',
    description:
      'Infrastructure hébergée sur Vercel (Edge Network mondial) et Supabase (PostgreSQL managé). Les deux plateformes sont certifiées SOC2 Type II et conformes au RGPD/GDPR.',
  },
  {
    icon: DatabaseBackup,
    title: 'Sauvegardes automatiques',
    description:
      'Sauvegardes automatiques quotidiennes de la base de données avec rétention de 30 jours. Point-in-time recovery disponible pour restaurer les données à n\'importe quel moment.',
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
          Vos données sont précieuses. Nous mettons en œuvre les meilleures pratiques de l&apos;industrie
          pour garantir leur confidentialité, intégrité et disponibilité.
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

      {/* Compliance */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground">Conformité et certifications</h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              Notre infrastructure respecte les normes internationales de sécurité et de protection des données.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-4">
            {['SOC2 Type II', 'RGPD / GDPR', 'ISO 27001', 'CEDEAO'].map((cert) => (
              <div
                key={cert}
                className="rounded-lg border border-border bg-background p-6 text-center"
              >
                <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="font-semibold text-foreground">{cert}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
