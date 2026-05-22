import { Metadata } from 'next'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Target, Eye, Users, Handshake } from 'lucide-react'

export const metadata: Metadata = {
  title: 'À propos — FaîtiereHub | Notre mission pour l\'agriculture africaine',
  description:
    'FaîtiereHub a pour mission de digitaliser les faîtières agricoles africaines. Notre vision : chaque coopérative connectée, chaque membre identifié.',
}

const teamMembers = [
  { name: 'TATCHIDA Louis', role: 'Fondateur & CEO', initials: 'TL' },
]

const partners = [
  'Ministère de l\'Agriculture (Togo)',
  'GIZ - Coopération Allemande',
  'FAO - Nations Unies',
  'Banque Mondiale - IFC',
]

export default function AProposPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          À propos de FaîtiereHub
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-3xl mx-auto">
          Nous construisons la technologie qui permet aux organisations agricoles africaines
          de se structurer, se digitaliser et prospérer.
        </p>
      </section>

      {/* Mission & Vision */}
      <section className="bg-card/50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-8 space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
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
            <div className="rounded-xl border border-border bg-background p-8 space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Eye className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Notre vision</h2>
              <p className="text-muted-foreground leading-relaxed">
                Un monde où chaque coopérative est connectée, chaque membre est identifié et chaque
                transaction est traçable. Nous imaginons un écosystème agricole africain structuré,
                transparent et résilient, porté par le numérique.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="flex justify-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-foreground">Notre équipe</h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              Une équipe passionnée par l&apos;agriculture et la technologie, basée en Afrique de l&apos;Ouest.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {teamMembers.map((member) => (
              <div
                key={member.name}
                className="rounded-xl border border-border bg-background p-6 text-center space-y-3 max-w-xs mx-auto"
              >
                <div className="h-24 w-24 mx-auto rounded-full overflow-hidden border-2 border-primary/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/founder.jpeg"
                    alt={member.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="font-semibold text-foreground text-lg">{member.name}</h3>
                <p className="text-sm text-primary font-medium">{member.role}</p>
                <p className="text-xs text-muted-foreground">Lomé, Togo • +228 92 54 88 38</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners */}
      <section className="bg-card/50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="flex justify-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Handshake className="h-6 w-6 text-primary" />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-foreground">Nos partenaires</h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              Nous collaborons avec des institutions de référence pour maximiser notre impact.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {partners.map((partner) => (
              <div
                key={partner}
                className="rounded-lg border border-border bg-background p-6 flex items-center justify-center min-h-[100px]"
              >
                <p className="text-sm font-medium text-foreground text-center">{partner}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
