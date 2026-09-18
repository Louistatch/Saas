'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ScanLine, Network, CheckCircle, CreditCard, Users, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'

/* ── Animated counter ── */
function useCountUp(target: number, duration = 1400) {
  const [value, setValue] = useState(0)
  const [done, setDone] = useState(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - p) ** 3
      setValue(Math.round(eased * target))
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDone(true)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return { value, done }
}

function Stat({ target, suffix, label }: { target: number; suffix: string; label: string }) {
  const { value, done } = useCountUp(target)
  const display = done
    ? target >= 1000
      ? `${(target / 1000).toFixed(1).replace('.0', '').replace('.', ',')} ${target >= 1000 ? 'k' : ''}${suffix}`
      : `${target}${suffix}`
    : value >= 1000
      ? `${(value / 1000).toFixed(1).replace('.', ',')} k${suffix}`
      : `${value}${suffix}`

  return (
    <div className="text-center sm:text-left">
      <div className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight leading-none">
        {display}
      </div>
      <div className="mt-1 text-xs text-muted-foreground leading-snug">{label}</div>
    </div>
  )
}

/* ── Trust chip ── */
function TrustChip({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/15 bg-white/70 backdrop-blur-sm px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
      <span className="text-xs font-medium text-foreground/80">{label}</span>
    </div>
  )
}

/* ── Floating UI card: Coopérative ── */
function CoopCard() {
  return (
    <div
      className="absolute top-6 left-2 sm:left-6 w-44 sm:w-52 rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl border border-white/60 p-4 z-10"
      style={{ animation: 'heroFloat1 5s ease-in-out infinite' }}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
          <Users className="h-4.5 w-4.5 text-white h-[18px] w-[18px]" />
        </div>
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Coopérative</div>
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground mb-0.5">Membres</div>
      <div className="text-3xl font-extrabold text-primary tracking-tight leading-none">2 400+</div>
      <div className="mt-2 h-1.5 bg-primary/10 rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: '82%', animation: 'heroBar 1.2s ease-out 0.6s both' }} />
      </div>
    </div>
  )
}

/* ── Floating UI card: QR identité ── */
function QrCard() {
  return (
    <div
      className="absolute bottom-16 right-2 sm:right-6 sm:bottom-24 w-40 sm:w-48 rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl border border-white/60 p-4 z-10"
      style={{ animation: 'heroFloat2 6.5s ease-in-out infinite 0.8s' }}
    >
      {/* QR code placeholder */}
      <div className="flex items-center justify-center mb-3">
        <div className="h-14 w-14 bg-foreground/90 rounded-lg flex items-center justify-center">
          <QrCode className="h-9 w-9 text-white" />
        </div>
      </div>
      <div className="text-[10px] font-semibold text-muted-foreground text-center mb-1.5">Identité professionnelle</div>
      <div className="flex items-center justify-center gap-1.5 bg-primary/10 rounded-lg py-1.5 px-2">
        <CheckCircle className="h-3 w-3 text-primary" />
        <span className="text-[11px] font-semibold text-primary">Vérifié</span>
      </div>
    </div>
  )
}

/* ── Main hero ── */
export function HeroSection() {
  return (
    <>
      {/* Global keyframes injected once */}
      <style>{`
        @keyframes heroPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes heroFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.45); }
          60% { box-shadow: 0 0 0 12px rgba(22,163,74,0); }
        }
        @keyframes heroFloat1 {
          0%, 100% { transform: translateY(0px) rotate(-1deg); }
          50% { transform: translateY(-8px) rotate(-1deg); }
        }
        @keyframes heroFloat2 {
          0%, 100% { transform: translateY(0px) rotate(1.5deg); }
          50% { transform: translateY(-7px) rotate(1.5deg); }
        }
        @keyframes heroBar {
          from { width: 0%; }
        }
        .hero-a1 { animation: heroFadeUp 0.55s ease both 0.05s; }
        .hero-a2 { animation: heroFadeUp 0.55s ease both 0.18s; }
        .hero-a3 { animation: heroFadeUp 0.55s ease both 0.3s; }
        .hero-a4 { animation: heroFadeUp 0.55s ease both 0.44s; }
        .hero-a5 { animation: heroFadeUp 0.55s ease both 0.56s; }
        .hero-a6 { animation: heroFadeUp 0.55s ease both 0.7s; }
        .hero-dot { animation: heroPulse 1.8s ease-in-out infinite; }
        .hero-cta-primary { animation: heroGlow 2.8s ease-in-out infinite; }
        .hero-cta-primary:hover { opacity: 0.92; transform: translateY(-1px); }
        .hero-cta-primary:active { transform: scale(0.97); }
        .hero-cta-secondary:hover { background: #fff7f4 !important; }
        .hero-cta-secondary:active { transform: scale(0.97); }
      `}</style>

      <section
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(148deg,#edfaf3 0%,#f2efe8 55%,#fef8ea 100%)' }}
      >
        {/* Ambient blobs */}
        <div className="pointer-events-none absolute -top-24 right-0 h-[500px] w-[500px] rounded-full opacity-50"
          style={{ background: 'radial-gradient(circle,rgba(22,163,74,0.13) 0%,transparent 65%)' }} />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-[300px] w-[300px] rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle,rgba(234,88,12,0.08) 0%,transparent 65%)' }} />

        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-center">

            {/* ── LEFT: copy ── */}
            <div className="flex flex-col gap-6">

              {/* Live badge */}
              <div className="hero-a1 inline-flex items-center gap-2 self-start rounded-full border px-4 py-1.5 text-sm font-semibold"
                style={{ background: 'rgba(22,163,74,0.09)', borderColor: 'rgba(22,163,74,0.22)', color: '#15803d' }}>
                <span className="hero-dot h-2 w-2 rounded-full bg-green-600 inline-block" />
                Plateforme agricole numérique — Togo &amp; Afrique de l'Ouest
              </div>

              {/* H1 */}
              <div className="hero-a2">
                <h1 className="text-4xl font-extrabold tracking-tight leading-[1.1] sm:text-5xl lg:text-[3.25rem]" style={{ color: '#0d1f0e' }}>
                  L'écosystème<br />numérique des<br />
                  <span className="text-primary">coopératives agricoles</span>
                </h1>
              </div>

              {/* Sub */}
              <p className="hero-a3 text-base sm:text-lg leading-relaxed max-w-lg" style={{ color: '#4a5e4c' }}>
                FaîtiereHub organise vos coopératives. Haroo donne une identité professionnelle aux
                acteurs qui les font vivre. Un seul écosystème, deux expériences complémentaires.
              </p>

              {/* CTAs */}
              <div className="hero-a4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/auth/signup">
                  <Button
                    size="lg"
                    className="hero-cta-primary w-full sm:w-auto gap-2 transition-all duration-150"
                    style={{ background: '#16a34a', borderRadius: '13px', fontWeight: 700, fontSize: '15.5px' }}
                  >
                    Démarrer gratuitement <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/auth/signup/haroo">
                  <Button
                    size="lg"
                    variant="outline"
                    className="hero-cta-secondary w-full sm:w-auto gap-2 border-amber-400 text-amber-700 hover:bg-amber-50 transition-all duration-150"
                    style={{ borderRadius: '13px', fontWeight: 600 }}
                  >
                    <Network className="h-4 w-4" /> Rejoindre Haroo
                  </Button>
                </Link>
                <Link href="/scan">
                  <Button size="lg" variant="ghost" className="w-full sm:w-auto gap-2 text-muted-foreground hover:text-foreground">
                    <ScanLine className="h-4 w-4" /> Scanner
                  </Button>
                </Link>
              </div>

              {/* Trust chips */}
              <div className="hero-a5 flex flex-wrap gap-2">
                <TrustChip icon={CheckCircle} label="Essai gratuit 30 jours" />
                <TrustChip icon={CreditCard} label="Sans carte bancaire" />
                <TrustChip icon={QrCode} label="Scanner QR universel" />
              </div>

              {/* Stats */}
              <div className="hero-a6 grid grid-cols-3 gap-4 border-t pt-5" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
                <Stat target={2400} suffix="+" label="Membres enregistrés" />
                <Stat target={12} suffix="" label="Coopératives actives" />
                <Stat target={850} suffix=" ha" label="Parcelles gérées" />
              </div>
            </div>

            {/* ── RIGHT: photo + floating cards ── */}
            <div className="relative flex items-end justify-center lg:justify-end">
              {/* Photo */}
              <div className="relative w-full max-w-sm lg:max-w-md xl:max-w-lg">
                {/* Glow behind photo */}
                <div className="absolute inset-0 rounded-3xl"
                  style={{ background: 'radial-gradient(circle at 60% 50%,rgba(22,163,74,0.18) 0%,transparent 70%)', filter: 'blur(32px)', transform: 'scale(1.1)' }} />

                <Image
                  src="/hero-farmer.png"
                  alt="Agricultrice utilisant FaîtiereHub dans son champ"
                  width={640}
                  height={800}
                  className="relative z-[1] w-full h-auto rounded-3xl object-cover"
                  style={{ maxHeight: '520px', objectPosition: 'center top' }}
                  priority
                />

                {/* Handwriting annotation top-right */}
                <div className="absolute top-4 right-0 z-20 text-right pr-2 hidden sm:block"
                  style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: '#166534', fontSize: '14px', lineHeight: 1.4, textShadow: '1px 1px 0 rgba(255,255,255,0.8)', transform: 'rotate(3deg)' }}>
                  Des coopératives<br />plus fortes,<br />un avenir durable !
                </div>

                {/* Handwriting annotation bottom */}
                <div className="absolute bottom-6 right-6 z-20 hidden sm:block"
                  style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: '#166534', fontSize: '13px', lineHeight: 1.4, textShadow: '1px 1px 0 rgba(255,255,255,0.8)', transform: 'rotate(-2deg)' }}>
                  Le numérique<br />au service des<br />producteurs
                </div>

                {/* Floating cards */}
                <CoopCard />
                <QrCard />
              </div>
            </div>

          </div>
        </div>
      </section>
    </>
  )
}
