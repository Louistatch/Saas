'use client'

import { Button } from '@/components/ui/button'
import { ArrowRight, CheckCircle, CreditCard, Network, QrCode, ScanLine } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

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

        <div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 sm:pb-14 sm:pt-10 lg:px-8 lg:py-20">
          <div className="grid items-center gap-5 lg:grid-cols-2 lg:gap-16">
            {/* ── Copy ── */}
            <div className="flex flex-col">
              <div className="hero-a1 mb-3 self-start">
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
                className="hero-a3 mb-4 max-w-lg sm:mb-5 text-[15px] leading-relaxed sm:text-base lg:text-lg"
                style={{ color: '#4a5e4c' }}
              >
                FaîtiereHub organise vos coopératives. Haroo connecte ouvriers, acheteurs et
                agronomes aux emplois, préventes et missions de conseil.
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
                  <Link href="/#haroo" className="flex-1 sm:flex-initial">
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-12 w-full gap-2 rounded-xl border-amber-400 font-semibold text-amber-700 hover:bg-amber-50 sm:h-11"
                    >
                      <Network className="h-4 w-4" /> Découvrir Haroo
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

            {/* ── Visuel : composite 4:5 (app + carte membre + QR).
                Pas de cartouche en surimpression : l'image les porte déjà.
                Sur mobile, le cadrage bas privilégie le téléphone et la carte —
                le bandeau du haut redouble le logo de la navigation. ── */}
            <div className="hero-a5 relative mx-auto w-full max-w-[460px] lg:ml-auto lg:mr-0 lg:max-w-[464px]">
              <div
                className="pointer-events-none absolute inset-0 rounded-3xl"
                style={{
                  background:
                    'radial-gradient(circle at 55% 50%,rgba(22,163,74,0.16) 0%,transparent 70%)',
                  filter: 'blur(32px)',
                  transform: 'scale(1.08)',
                }}
              />
              <div className="relative overflow-hidden rounded-2xl lg:rounded-3xl">
                <Image
                  src="/hero-farmer-app.png"
                  alt="Agricultrice consultant le tableau de bord FaîtiereHub, à côté d'une carte membre vérifiable par QR code"
                  width={1122}
                  height={1402}
                  priority
                  sizes="(max-width: 1023px) 100vw, 464px"
                  className="h-[284px] w-full object-cover object-[50%_72%] sm:h-[430px] sm:object-[50%_68%] lg:h-[580px] lg:object-center"
                />
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
