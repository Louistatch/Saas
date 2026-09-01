import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import { Target, Eye, Users, Handshake, Network, ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: "À propos — FaîtiereHub | Notre mission pour l'agriculture africaine",
  description:
    "FaîtiereHub a pour mission de digitaliser les faîtières agricoles africaines. Notre vision : chaque coopérative connectée, chaque membre identifié, chaque acteur du terrain valorisé.",
}

const teamMembers = [
  { name: 'TATCHIDA Louis', role: 'Fondateur & CEO', initials: 'TL' },
]

const partners = [
  {
    name: 'FENOMAT',
    logo: '/images/partners/fenomat.png',
    description: 'Fédération Nationale des Organisations de Maraîchers du Togo',
  },
]

const VALUES = [
  {
    title: 'Ancrage terrain',
    description:
      "Chaque fonctionnalité est conçue avec et pour les acteurs réels — coopératives, maraîchers, ouvriers agricoles, agronomes. Nous ne développons pas en chambre.",
  },
  {
    title: 'Transparence',
    description:
      "Données isolées par coopérative, sécurité enterprise, aucune revente de données. Vos membres vous appartiennent.",
  },
  {
    title: 'Accessibilité',
    description:
      "Interface en français adaptée aux usages mobiles africains. Fonctionnement dégradé hors connexion là où c'est possible.",
  },
  {
    title: 'Complémentarité',
    description:
      "FaîtiereHub structure les organisations. Haroo valorise les personnes. Un même écosystème, deux expériences pensées ensemble.",
  },
]

export default function AProposPage() {
  return (
    <MarketingLayout>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            À propos de FaîtiereHub
          </h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Nous construisons la technologie qui permet aux organisations agricoles africaines
            de se structurer, se digitaliser et prospérer. Et nous donnons une identité
            professionnelle aux acteurs du terrain qui les font vivre.
          </p>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="bg-card/50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background p-8 space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Notre mission</h2>
              <p className="text-muted-foreground leading-relaxed">
                Digitaliser les faîtières agricoles africaines en leur fournissant des outils
                numériques accessibles, adaptés à leurs réalités terrain et capables de transformer
                leur gestion quotidienne. Nous croyons que la technologie doit servir ceux qui
                nourrissent le continent.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-8 space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Eye className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Notre vision</h2>
              <p className="text-muted-foreground leading-relaxed">
                Un monde où chaque coopérative est connectée, chaque membre est identifié et chaque
                acteur du terrain — ouvrier, acheteur, agronome — a une identité professionnelle
                valorisée. Un écosystème agricole africain structuré, transparent et résilient,
                porté par le numérique.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* L'écosystème */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
              Un écosystème, deux expériences
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              FaîtiereHub et Haroo partagent la même base de données, le même scanner QR
              et les mêmes valeurs — mais servent des besoins complémentaires.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary mb-5">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div className="text-xs font-bold uppercase tracking-wider text-primary mb-2">FaîtiereHub</div>
              <h3 className="text-xl font-bold text-foreground mb-3">Couche organisationnelle</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                Structurez votre organisation en faîtière, unions et coopératives. Gérez vos membres,
                leurs cotisations, leurs exploitations et leur accès aux services agricoles.
              </p>
              <div className="text-sm font-medium text-primary">
                Coopératives · Membres · Données · Gestion
              </div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-600 mb-5">
                <Network className="h-5 w-5 text-white" />
              </div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">Haroo</div>
              <h3 className="text-xl font-bold text-foreground mb-3">Couche humaine &amp; réseau</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                Donnez une identité professionnelle aux acteurs du terrain. Ouvriers, acheteurs et
                agronomes accèdent à des opportunités dans leur région via leur carte professionnelle.
              </p>
              <div className="text-sm font-medium text-amber-700">
                Ouvriers · Acheteurs · Agronomes · Réseau
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Valeurs */}
      <section className="bg-card/50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
              Nos valeurs
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(({ title, description }) => (
              <div key={title} className="rounded-xl border border-border bg-background p-6 space-y-3">
                <h3 className="font-bold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Notre équipe</h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              Une équipe passionnée par l&apos;agriculture et la technologie, basée en Afrique de l&apos;Ouest.
            </p>
          </div>
          <div className="flex justify-center">
            {teamMembers.map((member) => (
              <div
                key={member.name}
                className="rounded-2xl border border-border bg-background p-8 text-center space-y-3 max-w-xs w-full"
              >
                <div className="h-24 w-24 mx-auto rounded-full overflow-hidden border-2 border-primary/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/founder.jpeg"
                    alt={member.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="font-bold text-foreground text-lg">{member.name}</h3>
                <p className="text-sm text-primary font-semibold">{member.role}</p>
                <p className="text-xs text-muted-foreground">Lomé, Togo · +228 92 54 88 38</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners */}
      <section className="bg-card/50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Handshake className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Nos partenaires</h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              Nous collaborons avec des institutions de référence pour maximiser notre impact.
            </p>
          </div>
          <div className="flex justify-center">
            {partners.map((partner) => (
              <div
                key={partner.name}
                className="rounded-2xl border border-border bg-background p-10 flex items-center gap-8 hover:shadow-lg hover:border-primary/20 transition-all duration-300"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={partner.logo}
                  alt={`Logo ${partner.name}`}
                  className="h-16 w-auto object-contain"
                />
                <div>
                  <p className="font-bold text-foreground text-lg">{partner.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">{partner.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground mb-4">
            Rejoignez l&apos;écosystème
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Que vous soyez une coopérative agricole, un ouvrier, un acheteur ou un agronome —
            il y a une place pour vous dans l&apos;écosystème FaîtiereHub.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/auth/signup">
              <Button size="lg" className="gap-2 w-full sm:w-auto">
                Démarrer gratuitement <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/auth/signup/haroo">
              <Button size="lg" variant="outline" className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 w-full sm:w-auto">
                <Network className="h-4 w-4" /> Rejoindre Haroo
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="ghost" className="w-full sm:w-auto">
                Nous contacter
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
