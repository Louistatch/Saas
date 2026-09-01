import Link from 'next/link'
import {
  ArrowRight,
  Users,
  TrendingUp,
  BarChart3,
  Zap,
  ScanLine,
  UserPlus,
  MapPin,
  GraduationCap,
  CreditCard,
  ShoppingBag,
  BookOpen,
  Handshake,
  CheckCircle,
  Briefcase,
  Sprout,
  Network,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MarketingLayout } from '@/components/shared/marketing-layout'

// ─── Data ────────────────────────────────────────────────────────────────────

const FAITIERE_FEATURES = [
  {
    icon: Users,
    color: 'bg-green-50 text-green-700',
    title: 'Gestion des membres',
    description:
      "Cartes numériques, scores Bronze / Silver / Gold, contrôle d'accès et suivi des cotisations.",
  },
  {
    icon: MapPin,
    color: 'bg-emerald-50 text-emerald-700',
    title: 'Carte agricole',
    description:
      'Répartition géographique des membres et parcelles par préfecture sur la carte interactive du Togo.',
  },
  {
    icon: BarChart3,
    color: 'bg-teal-50 text-teal-700',
    title: 'Analytiques',
    description:
      "Indicateurs d'activité, de cotisations et de croissance en temps réel pour chaque niveau hiérarchique.",
  },
  {
    icon: Zap,
    color: 'bg-green-50 text-green-700',
    title: 'Intégration KoboToolbox',
    description:
      "Synchronisez automatiquement les données de terrain depuis KoboToolbox et d'autres sources.",
  },
  {
    icon: ShoppingBag,
    color: 'bg-lime-50 text-lime-700',
    title: 'AgriMarket',
    description:
      'Place de marché agricole — connectez producteurs et acheteurs au sein de la coopérative.',
  },
  {
    icon: CreditCard,
    color: 'bg-emerald-50 text-emerald-700',
    title: 'AgriCredit',
    description:
      'Gérez les demandes de crédit agricole avec scoring automatique et suivi des remboursements.',
  },
  {
    icon: GraduationCap,
    color: 'bg-teal-50 text-teal-700',
    title: 'AgriAcademy',
    description:
      'Modules de formation certifiante pour vos membres — irrigation, cultures, bonnes pratiques.',
  },
  {
    icon: Handshake,
    color: 'bg-green-50 text-green-700',
    title: 'Matching & Carnet',
    description:
      'Mettez en relation producteurs et acheteurs. Gérez contacts, techniciens et partenaires.',
  },
]

const HAROO_PROFILES = [
  {
    role: 'Ouvrier agricole',
    icon: Sprout,
    cardPrefix: 'OUV-',
    color: 'from-amber-600 to-amber-800',
    badgeBg: 'bg-amber-100 text-amber-800',
    tagline: 'Emploi saisonnier',
    description:
      "Déclarez vos compétences agricoles et vos cantons de disponibilité. Accédez aux offres d'emploi de la région, triées par proximité.",
    perks: ["Offres d'emploi géolocalisées", 'Carte professionnelle OUV-XXXXXX', 'Météo & prix marché'],
  },
  {
    role: 'Acheteur',
    icon: TrendingUp,
    cardPrefix: 'ACH-',
    color: 'from-orange-600 to-orange-800',
    badgeBg: 'bg-orange-100 text-orange-800',
    tagline: 'Préventes de production',
    description:
      "Définissez vos produits et zones d'intervention. Accédez aux préventes disponibles filtrées sur vos intérêts.",
    perks: ['Préventes filtrées par produit', 'Carte professionnelle ACH-XXXXXX', 'Contacts producteurs'],
  },
  {
    role: 'Agronome',
    icon: BookOpen,
    cardPrefix: 'AGR-',
    color: 'from-yellow-600 to-yellow-800',
    badgeBg: 'bg-yellow-100 text-yellow-800',
    tagline: 'Missions de conseil',
    description:
      "Créez votre profil d'expert. Recevez des demandes de mission d'agriculteurs et d'organisations.",
    perks: ['Demandes de mission directes', 'Badge de validation professionnelle', 'Carte AGR-XXXXXX vérifiable'],
  },
]

const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Configurez votre coopérative',
    description:
      'Créez votre compte FaîtiereHub et configurez votre espace avec votre hiérarchie (faîtière → union → coopérative), votre image de marque et vos paramètres.',
  },
  {
    step: '2',
    title: 'Ajoutez membres et données',
    description:
      'Importez les listes de membres via KoboToolbox, émettez des cartes numériques avec QR codes et gérez les exploitations et parcelles.',
  },
  {
    step: '3',
    title: "Activez l'écosystème complet",
    description:
      "Les membres accèdent au marché, aux crédits et aux formations. Les ouvriers, acheteurs et agronomes rejoignent via Haroo. Un seul scanner vérifie toutes les cartes.",
  },
]

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <MarketingLayout>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">

          {/* Left copy */}
          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              Plateforme agricole numérique — Togo &amp; Afrique de l'Ouest
            </div>

            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem] leading-[1.08]">
                L'écosystème numérique des{' '}
                <span className="text-primary">coopératives agricoles</span>
              </h1>
              <p className="mt-5 text-lg text-muted-foreground max-w-lg leading-relaxed">
                FaîtiereHub organise vos coopératives. Haroo donne une identité professionnelle aux
                acteurs qui les font vivre. Un seul écosystème, deux expériences complémentaires.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/auth/signup">
                <Button size="lg" className="w-full gap-2 sm:w-auto">
                  Démarrer gratuitement <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/auth/signup/haroo">
                <Button size="lg" variant="outline" className="w-full gap-2 sm:w-auto border-amber-300 text-amber-700 hover:bg-amber-50">
                  <Network className="h-4 w-4" /> Rejoindre Haroo
                </Button>
              </Link>
              <Link href="/scan">
                <Button size="lg" variant="ghost" className="w-full gap-2 sm:w-auto">
                  <ScanLine className="h-4 w-4" /> Scanner
                </Button>
              </Link>
            </div>

            {/* Trust signals */}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {[
                { dot: 'bg-primary', text: 'Essai gratuit 30 jours' },
                { dot: 'bg-amber-500', text: 'Sans carte bancaire' },
                { dot: 'bg-primary', text: 'Scanner QR universel' },
              ].map(({ dot, text }) => (
                <div key={text} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  {text}
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-border">
              {[
                { value: '2 400+', label: 'Membres enregistrés' },
                { value: '12', label: 'Coopératives actives' },
                { value: '850 ha', label: 'Parcelles gérées' },
              ].map(({ value, label }) => (
                <div key={label}>
                  <div className="text-2xl font-extrabold text-primary">{value}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Visual */}
          <div className="relative">
            {/* Glow */}
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-r from-primary/20 via-amber-500/10 to-primary/20 blur-3xl opacity-40" />

            {/* Browser preview */}
            <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
              {/* Chrome bar */}
              <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
                <div className="flex gap-1.5">
                  {['bg-red-400', 'bg-yellow-400', 'bg-green-400'].map((c) => (
                    <div key={c} className={`h-3 w-3 rounded-full ${c}`} />
                  ))}
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="rounded-md border border-border bg-background px-3 py-1 font-mono text-[10px] text-muted-foreground">
                    faitierehub.com/dashboard
                  </div>
                </div>
              </div>

              {/* Dashboard mockup */}
              <div className="bg-muted/30 p-4 space-y-3">
                {/* KPI row */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Membres actifs', value: '2 418', sub: '↑ +12%' },
                    { label: 'Cotisations', value: '1 840', sub: '↑ +8%' },
                    { label: 'Parcelles', value: '856', sub: '850 ha' },
                  ].map(({ label, value, sub }) => (
                    <div key={label} className="rounded-lg border border-border bg-card p-3">
                      <div className="text-[10px] text-muted-foreground">{label}</div>
                      <div className="text-xl font-bold text-foreground mt-0.5">{value}</div>
                      <div className="text-[10px] text-primary mt-0.5">{sub}</div>
                    </div>
                  ))}
                </div>
                {/* Activity bar */}
                <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="text-xs font-semibold text-foreground">Répartition régionale</div>
                  {[
                    { region: 'Maritime', pct: 82, val: 642 },
                    { region: 'Plateaux', pct: 55, val: 430 },
                    { region: 'Kara', pct: 38, val: 298 },
                    { region: 'Centrale', pct: 26, val: 204 },
                  ].map(({ region, pct, val }) => (
                    <div key={region} className="flex items-center gap-2">
                      <span className="w-14 text-[10px] text-muted-foreground">{region}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full">
                        <div className="h-2 bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-6 text-right">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Floating member card */}
            <div className="absolute -bottom-8 -right-4 hidden sm:block w-48 rotate-3 hover:rotate-0 transition-transform duration-500">
              <div className="rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl">
                <div className="bg-gradient-to-br from-green-700 to-green-900 p-3.5 text-white">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] font-bold tracking-wide opacity-80">FaîtiereHub</span>
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-semibold">GOLD</span>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-lg mb-2">
                    👤
                  </div>
                  <div className="text-sm font-bold leading-tight">Abla AKWA</div>
                  <div className="text-[9px] font-mono opacity-60 mt-0.5">ALL-64706</div>
                  <div className="flex justify-between items-end mt-2.5">
                    <span className="text-[8px] opacity-50 max-w-[80px] leading-tight">Coop. Agricole d'Allada</span>
                    <span className="text-lg">⊞</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ECOSYSTEM OVERVIEW ───────────────────────────────────────── */}
      <section className="border-y border-border bg-muted/30 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="flex items-start gap-4 rounded-xl border border-primary/20 bg-primary/5 p-5">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-white">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-0.5">FaîtiereHub</div>
                <div className="font-semibold text-foreground text-sm">Couche organisationnelle</div>
                <div className="mt-1 text-xs text-muted-foreground">Faîtières · Unions · Coopératives · Membres</div>
              </div>
            </div>
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-border bg-background text-xl">🔗</div>
                <div className="text-xs font-semibold text-muted-foreground">Même scanner QR<br />Même base de données</div>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-xl border border-amber-200 bg-amber-50/50 p-5">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
                <Network className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-0.5">Haroo</div>
                <div className="font-semibold text-foreground text-sm">Couche humaine &amp; réseau</div>
                <div className="mt-1 text-xs text-muted-foreground">Ouvriers · Acheteurs · Agronomes</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CARTE MEMBRE PREMIUM ─────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-gradient-to-b from-background to-primary/5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-12">
            <div className="inline-block rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              Identité numérique
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Carte membre premium
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Chaque membre reçoit une carte numérique avec QR code vérifiable, photo
              d&apos;identité et toutes ses informations agricoles.
            </p>
          </div>
          <div className="flex justify-center">
            <div className="relative group w-full max-w-3xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/showcase-card.webp"
                alt="Carte membre FaîtiereHub — Design premium avec photo, QR code, localité, coopérative"
                className="w-full rounded-2xl border border-border shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]"
              />
              <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-r from-primary/20 via-transparent to-primary/20 blur-2xl opacity-50 transition-opacity group-hover:opacity-70" />
              <div className="absolute top-4 right-4 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg">
                ✓ Vérifiable par QR
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAITIEREHUB FEATURES ─────────────────────────────────────── */}
      <section id="features" className="bg-card/50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <Users className="h-3.5 w-3.5" /> FaîtiereHub
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Conçu pour les coopératives agricoles
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Tout ce dont vous avez besoin pour gérer vos membres, exploitations et croissance
              en un seul endroit
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FAITIERE_FEATURES.map(({ icon: Icon, color, title, description }) => (
              <div
                key={title}
                className="rounded-xl border border-border bg-background p-6 space-y-3 transition-shadow hover:shadow-md"
              >
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HAROO SECTION ────────────────────────────────────────────── */}
      <section id="haroo" className="py-20 sm:py-28 bg-gradient-to-br from-amber-50 via-orange-50/50 to-background dark:from-amber-950/20 dark:via-background dark:to-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

          {/* Header */}
          <div className="text-center space-y-4 mb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              <Network className="h-3.5 w-3.5" /> Haroo — L'identité professionnelle agricole
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Les acteurs du terrain ont leur propre identité
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Haroo est la couche humaine de l&apos;écosystème FaîtiereHub. Ouvriers agricoles,
              acheteurs et agronomes bénéficient chacun d&apos;un profil dédié, d&apos;une carte
              professionnelle vérifiable et d&apos;un flux d&apos;opportunités personnalisé.
            </p>
          </div>

          {/* 3 profile cards */}
          <div className="grid gap-6 sm:grid-cols-3">
            {HAROO_PROFILES.map(({ role, icon: Icon, cardPrefix, color, badgeBg, tagline, description, perks }) => (
              <div
                key={role}
                className="rounded-2xl border border-amber-200/60 bg-white dark:bg-card shadow-sm overflow-hidden flex flex-col"
              >
                {/* Card visual header */}
                <div className={`bg-gradient-to-br ${color} p-5 text-white`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-bold tracking-widest opacity-70 mb-1">HAROO</div>
                      <div className="font-bold text-lg leading-tight">{role}</div>
                      <div className="text-xs opacity-75 mt-0.5 font-mono">{cardPrefix}XXXXXX</div>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-3 inline-block rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold">
                    {tagline}
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-1 gap-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
                  <ul className="space-y-2 flex-1">
                    {perks.map((perk) => (
                      <li key={perk} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <span className="text-foreground">{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* Haroo CTA */}
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/auth/signup/haroo">
              <Button
                size="lg"
                className="gap-2 bg-amber-600 text-white hover:bg-amber-700 border-amber-600"
              >
                <UserPlus className="h-4 w-4" /> Créer mon profil Haroo
              </Button>
            </Link>
            <Link href="/auth/login">
              <Button size="lg" variant="outline" className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50">
                Déjà inscrit — Se connecter
              </Button>
            </Link>
          </div>

          {/* Haroo integration note */}
          <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-900/10 dark:border-amber-800 p-5 max-w-2xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
              <ScanLine className="h-4 w-4" />
              Un seul scanner pour toutes les cartes
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Le même QR code scanner vérifie indifféremment les cartes FAITIERE des membres de
              coopérative et les cartes professionnelles Haroo des ouvriers, acheteurs et agronomes.
            </p>
            <Link href="/scan" className="mt-3 inline-block text-sm font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2">
              Essayer le scanner →
            </Link>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Comment fonctionne FaîtiereHub
            </h2>
          </div>
          <div className="grid gap-10 md:grid-cols-3">
            {HOW_IT_WORKS.map(({ step, title, description }, i) => (
              <div key={step} className="relative space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                  {step}
                </div>
                <h3 className="font-semibold text-lg text-foreground">{title}</h3>
                <p className="text-muted-foreground leading-relaxed">{description}</p>
                {i < 2 && (
                  <div className="absolute top-6 -right-5 hidden h-px w-10 bg-border md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PARTNERS ─────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-10">
            Ils nous font confiance
          </p>
          <div className="flex justify-center">
            <div className="flex items-center gap-8 rounded-2xl border border-border bg-card/60 px-8 py-6 shadow-sm hover:shadow-md transition-shadow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/partners/fenomat.png"
                alt="Logo FENOMAT — Fédération Nationale des Organisations de Maraîchers du Togo"
                className="h-14 w-auto object-contain sm:h-16"
              />
              <div>
                <p className="font-semibold text-foreground text-lg">FENOMAT</p>
                <p className="text-sm text-muted-foreground">
                  Fédération Nationale des Organisations
                  <br className="hidden sm:block" /> de Maraîchers du Togo
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DUAL CTA ─────────────────────────────────────────────────── */}
      <section className="border-t border-border py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-2">

            {/* FaîtiereHub CTA */}
            <div className="rounded-2xl bg-primary p-8 text-primary-foreground">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                <Briefcase className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-extrabold mb-3">Gérez votre coopérative</h3>
              <p className="text-primary-foreground/80 mb-6 leading-relaxed">
                Rejoignez les coopératives agricoles du Togo qui utilisent FaîtiereHub pour
                structurer leur organisation, gérer leurs membres et développer leurs activités.
              </p>
              <Link href="/auth/signup">
                <Button
                  size="lg"
                  className="gap-2 bg-white text-primary hover:bg-white/90 border-0"
                >
                  Démarrer l&apos;essai gratuit <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <p className="mt-3 text-xs text-primary-foreground/60">30 jours gratuits · Sans carte bancaire</p>
            </div>

            {/* Haroo CTA */}
            <div className="rounded-2xl bg-gradient-to-br from-amber-600 to-amber-800 p-8 text-white">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                <Network className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-extrabold mb-3">Rejoignez Haroo</h3>
              <p className="text-white/80 mb-6 leading-relaxed">
                Vous êtes ouvrier agricole, acheteur ou agronome ? Créez votre profil
                professionnel Haroo — obtenez votre carte vérifiable et accédez à des
                opportunités dans votre région.
              </p>
              <Link href="/auth/signup/haroo">
                <Button
                  size="lg"
                  className="gap-2 bg-white text-amber-700 hover:bg-white/90 border-0"
                >
                  <UserPlus className="h-4 w-4" /> Créer mon profil Haroo
                </Button>
              </Link>
              <p className="mt-3 text-xs text-white/60">Gratuit · Emploi · Préventes · Missions</p>
            </div>
          </div>

          {/* Already have account */}
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Déjà inscrit ?{' '}
            <Link href="/auth/login" className="font-medium text-primary hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </section>

    </MarketingLayout>
  )
}
