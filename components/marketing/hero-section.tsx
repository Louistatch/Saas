'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ScanLine, Network, CheckCircle, CreditCard, ShieldCheck, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'

/* ── Trust chips ── */
const TRUST = [
  { icon: CheckCircle, label: 'Essai gratuit 30 jours' },
  { icon: CreditCard, label: 'Sans carte bancaire' },
  { icon: QrCode, label: 'Scanner QR universel' },
]

function TrustRow() {
  return (
    <div className="flex flex-wrap gap-2">
      {TRUST.map(({ icon: Icon, label }) => (
        <div
          key={label}
          className="flex items-center gap-2 rounded-lg border border-primary/15 bg-white/70 px-3 py-1.5 backdrop-blur-sm"
        >
          <Icon className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
          <span className="text-xs font-medium text-foreground/80">{label}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Preuve produit posée sur la photo : carte membre vérifiable ──
   Compacte et horizontale sur mobile, verticale sur desktop. */
function MemberProof() {
  return (
    <div
      className="absolute bottom-3 left-3 right-3 z-10 flex items-center gap-3 rounded-xl border border-white/60 bg-white/95 p-3 shadow-xl backdrop-blur-md
                 lg:bottom-auto lg:right-auto lg:top-6 lg:left-6 lg:w-52 lg:flex-col lg:items-start lg:gap-0 lg:rounded-2xl lg:p-4"
      style={{ animation: 'heroFloat1 5s ease-in-out infinite' }}
    >
      <div className="flex flex-shrink-0 items-center gap-2.5 lg:mb-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary">
          <ShieldCheck className="h-[18px] w-[18px] text-white" />
        </div>
        <div className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
          Carte
          <br className="hidden lg:inline" /> membre
        </div>
      </div>
      <div className="min-w-0">
        <div className="font-mono text-sm font-bold tracking-wider text-foreground">FAI-2024-0847</div>
        <div className="mt-1 flex items-center gap-1.5 lg:mt-2">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
          <span className="truncate text-[11px] font-medium text-muted-foreground">
            Active · Niveau Bronze
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Second badge, desktop seulement : l'espace mobile ne le porte pas ── */
function QrProof() {
  return (
    <div
      className="absolute bottom-24 right-6 z-10 hidden w-48 rounded-2xl border border-white/60 bg-white/95 p-4 shadow-2xl backdrop-blur-md lg:block"
      style={{ animation: 'heroFloat2 6.5s ease-in-out infinite 0.8s' }}
    >
      <div className="mb-3 flex items-center justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-foreground/90">
          <QrCode className="h-9 w-9 text-white" />
        </div>
      </div>
      <div className="mb-1.5 text-center text-[10px] font-semibold text-muted-foreground">
        Identité professionnelle
      </div>
      <div className="flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-2 py-1.5">
        <CheckCircle className="h-3 w-3 text-primary" />
        <span className="text-[11px] font-semibold text-primary">Vérifié</span>
      </div>
    </div>
  )
}

export function HeroSection() {
  return (
    <>
      <style>{`
        @keyframes heroPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes heroFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.4); }
          60% { box-shadow: 0 0 0 10px rgba(22,163,74,0); }
        }
        @keyframes heroFloat1 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes heroFloat2 {
          0%, 100% { transform: translateY(0px) rotate(1.5deg); }
          50% { transform: translateY(-7px) rotate(1.5deg); }
        }
        .hero-a1 { animation: heroFadeUp 0.5s ease both 0.05s; }
        .hero-a2 { animation: heroFadeUp 0.5s ease both 0.16s; }
        .hero-a3 { animation: heroFadeUp 0.5s ease both 0.27s; }
        .hero-a4 { animation: heroFadeUp 0.5s ease both 0.38s; }
        .hero-a5 { animation: heroFadeUp 0.5s ease both 0.5s; }
        .hero-dot { animation: heroPulse 1.8s ease-in-out infinite; }
        .hero-cta { animation: heroGlow 2.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .hero-a1, .hero-a2, .hero-a3, .hero-a4, .hero-a5,
          .hero-dot, .hero-cta, [style*="heroFloat"] { animation: none !important; }
        }
      `}</style>

      <section
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(148deg,#edfaf3 0%,#f2efe8 55%,#fef8ea 100%)' }}
      >
        <div
          className="pointer-events-none absolute -top-24 right-0 h-[500px] w-[500px] rounded-full opacity-50"
          style={{ background: 'radial-gradient(circle,rgba(22,163,74,0.13) 0%,transparent 65%)' }}
        />

        <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 sm:pb-14 sm:pt-10 lg:px-8 lg:py-20">
          <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-16">
            {/* ── Copy ── */}
            <div className="flex flex-col">
              <div className="hero-a1 mb-3.5 self-start">
                <div
                  className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold sm:text-sm"
                  style={{
                    background: 'rgba(22,163,74,0.09)',
                    borderColor: 'rgba(22,163,74,0.22)',
                    color: '#15803d',
                  }}
                >
                  <span className="hero-dot inline-block h-2 w-2 flex-shrink-0 rounded-full bg-green-600" />
                  Togo &amp; Afrique de l'Ouest
                </div>
              </div>

              <h1
                className="hero-a2 mb-3 text-[28px] font-extrabold leading-[1.12] tracking-tight sm:text-4xl lg:text-[3.25rem] lg:leading-[1.1]"
                style={{ color: '#0d1f0e' }}
              >
                L'écosystème numérique des{' '}
                <span className="text-primary">coopératives agricoles</span>
              </h1>

              <p
                className="hero-a3 mb-5 max-w-lg text-[15px] leading-relaxed sm:text-base lg:text-lg"
                style={{ color: '#4a5e4c' }}
              >
                FaîtiereHub organise vos coopératives. Haroo donne une identité professionnelle à
                ceux qui les font vivre.
              </p>

              {/* CTA : primaire pleine largeur, secondaires côte à côte —
                  trois boutons empilés mangeaient 50 px du premier écran. */}
              <div className="hero-a4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
                <Link href="/auth/signup" className="sm:w-auto">
                  <Button
                    size="lg"
                    className="hero-cta h-12 w-full gap-2 rounded-xl font-bold sm:h-11 sm:w-auto"
                    style={{ background: '#16a34a' }}
                  >
                    Démarrer gratuitement <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <div className="flex gap-2.5 sm:gap-3">
                  <Link href="/auth/signup/haroo" className="flex-1 sm:flex-initial">
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-12 w-full gap-2 rounded-xl border-amber-400 font-semibold text-amber-700 hover:bg-amber-50 sm:h-11"
                    >
                      <Network className="h-4 w-4" /> Rejoindre Haroo
                    </Button>
                  </Link>
                  <Link href="/scan" className="flex-shrink-0">
                    <Button
                      size="lg"
                      variant="ghost"
                      className="h-12 w-full gap-2 rounded-xl text-muted-foreground hover:text-foreground sm:h-11"
                    >
                      <ScanLine className="h-4 w-4" /> Scanner
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Desktop : la réassurance reste dans la colonne de texte */}
              <div className="hero-a5 mt-7 hidden lg:block">
                <TrustRow />
              </div>
            </div>

            {/* ── Photo : dans le premier écran sur mobile ── */}
            <div className="hero-a5 relative">
              <div
                className="pointer-events-none absolute inset-0 rounded-3xl"
                style={{
                  background:
                    'radial-gradient(circle at 60% 50%,rgba(22,163,74,0.18) 0%,transparent 70%)',
                  filter: 'blur(32px)',
                  transform: 'scale(1.08)',
                }}
              />
              <div className="relative overflow-hidden rounded-2xl lg:rounded-3xl">
                <Image
                  src="/hero-farmer.png"
                  alt="Agricultrice consultant FaîtiereHub depuis son champ"
                  width={640}
                  height={800}
                  priority
                  sizes="(max-width: 1023px) 100vw, 40vw"
                  className="h-[260px] w-full object-cover object-[50%_26%] sm:h-[380px] lg:h-[500px] lg:object-[50%_20%]"
                />
                <MemberProof />
                <QrProof />
              </div>
            </div>

            {/* Mobile : la réassurance passe après la photo */}
            <div className="hero-a5 lg:hidden">
              <TrustRow />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
