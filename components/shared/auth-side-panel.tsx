'use client'

import Link from 'next/link'
import { Logo } from '@/components/shared/logo'
import { ArrowLeft } from 'lucide-react'

interface AuthSidePanelProps {
  title: string
  description: string
  benefits: string[]
  footer?: string
}

/**
 * Professional side panel for auth pages.
 * Features:
 * - Back to home link
 * - Artistic member card illustration (SVG)
 * - Benefits list
 * - Responsive (hidden on mobile)
 */
export function AuthSidePanel({ title, description, benefits, footer }: AuthSidePanelProps) {
  return (
    <div className="hidden md:flex flex-col justify-between bg-gradient-to-br from-primary/5 via-primary/10 to-accent/5 border-r border-border p-8 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-0 w-48 h-48 bg-primary/3 rounded-full blur-2xl" />
      </div>

      {/* Header: Logo + Back to home */}
      <div className="relative z-10 space-y-4">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Logo size="lg" />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Retour à l&apos;accueil
        </Link>
      </div>

      {/* Center: Card illustration + text */}
      <div className="relative z-10 space-y-8">
        {/* Artistic Member Card Illustration */}
        <div className="relative mx-auto w-full max-w-[320px]">
          {/* Card shadow */}
          <div className="absolute inset-0 translate-y-3 translate-x-2 bg-primary/10 rounded-2xl blur-sm" />
          
          {/* Main card */}
          <div className="relative bg-gradient-to-br from-primary via-primary/90 to-green-700 rounded-2xl p-6 shadow-2xl transform -rotate-2 hover:rotate-0 transition-transform duration-500">
            {/* Card pattern overlay */}
            <div className="absolute inset-0 rounded-2xl opacity-10">
              <svg className="w-full h-full" viewBox="0 0 320 200" fill="none">
                <circle cx="280" cy="30" r="60" fill="white" opacity="0.3" />
                <circle cx="300" cy="50" r="40" fill="white" opacity="0.2" />
                <path d="M0 150 Q80 120 160 140 T320 130 V200 H0 Z" fill="white" opacity="0.1" />
              </svg>
            </div>

            {/* Card content */}
            <div className="relative space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-[10px] uppercase tracking-widest font-medium">Carte Membre</p>
                  <p className="text-white font-bold text-sm">FaîtiereHub</p>
                </div>
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
              </div>

              {/* Member info placeholder */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <svg className="w-7 h-7 text-white/80" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  </div>
                  <div>
                    <div className="h-3 w-24 bg-white/30 rounded-full" />
                    <div className="h-2 w-16 bg-white/20 rounded-full mt-1.5" />
                  </div>
                </div>
              </div>

              {/* Card number */}
              <div className="pt-2 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-white/50 text-[9px] uppercase tracking-wider">N° Carte</p>
                  <p className="text-white font-mono text-xs tracking-wider">FH-2025-XXXX</p>
                </div>
                {/* QR code placeholder */}
                <div className="w-12 h-12 bg-white rounded-lg p-1">
                  <svg className="w-full h-full text-primary" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="2" y="2" width="7" height="7" rx="1" />
                    <rect x="15" y="2" width="7" height="7" rx="1" />
                    <rect x="2" y="15" width="7" height="7" rx="1" />
                    <rect x="11" y="11" width="2" height="2" />
                    <rect x="15" y="15" width="2" height="2" />
                    <rect x="19" y="15" width="2" height="2" />
                    <rect x="15" y="19" width="2" height="2" />
                    <rect x="19" y="19" width="2" height="2" />
                    <rect x="11" y="15" width="2" height="2" />
                    <rect x="11" y="19" width="2" height="2" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Second card (behind, tilted) */}
          <div className="absolute -bottom-3 -right-3 w-full h-full bg-gradient-to-br from-green-800/40 to-green-900/30 rounded-2xl -z-10 rotate-3 border border-primary/10" />
        </div>

        {/* Text content */}
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {title}
            </h2>
            <p className="text-muted-foreground text-sm">
              {description}
            </p>
          </div>

          <ul className="space-y-3">
            {benefits.map((benefit, i) => (
              <li key={i} className="flex gap-3 items-start">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 mt-0.5 shrink-0">
                  <svg className="h-3 w-3 text-primary" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-sm text-muted-foreground">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Footer */}
      <p className="relative z-10 text-xs text-muted-foreground">
        {footer ?? 'Plateforme de gestion pour coopératives agricoles.'}
      </p>
    </div>
  )
}
