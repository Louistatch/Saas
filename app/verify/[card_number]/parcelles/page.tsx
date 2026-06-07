import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Sprout, Droplets } from 'lucide-react'
import { Logo } from '@/components/shared/logo'

/* ─── Premium Styles (same as verify page) ─── */
const vfpStyles = `
  :root {
    --vfp-accent: oklch(0.72 0.18 142);
    --vfp-accent-dim: oklch(0.58 0.14 142);
    --vfp-accent-bright: oklch(0.84 0.16 142);
    --vfp-cta: oklch(0.75 0.20 142);
    --vfp-cta-fg: oklch(0.10 0.03 142);
  }
  .vfp-bg {
    background:
      radial-gradient(80% 55% at 18% 8%, oklch(0.45 0.18 142 / 0.10), transparent 60%),
      radial-gradient(60% 45% at 85% 90%, oklch(0.40 0.16 142 / 0.12), transparent 60%),
      linear-gradient(180deg, #040f0a 0%, #071a12 45%, #04120b 100%);
  }
  .vfp-bg::before {
    content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background-image: radial-gradient(rgba(255,255,255,.018) 1px, transparent 1px);
    background-size: 3px 3px; opacity: .4;
  }
  .vfp-glass-subtle {
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.06);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .vfp-card {
    background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.015));
    border: 1px solid rgba(255,255,255,.07);
    backdrop-filter: blur(12px) saturate(1.05);
    -webkit-backdrop-filter: blur(12px) saturate(1.05);
    box-shadow: 0 4px 24px -8px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06);
  }
  .vfp-enter { animation: vfpIn .5s cubic-bezier(.2,.7,.2,1) both; }
  @keyframes vfpIn { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .vfp-enter { animation: none; } }
`

interface Parcelle {
  culture_principale: string | null
  superficie_ha: number | null
  soil_type: string | null
  irrigation_type: string | null
}

interface Props {
  params: Promise<{ card_number: string }>
}

export default async function ParcellesPage({ params }: Props) {
  const { card_number } = await params
  const supabase = await createClient()

  // Get card → member_id
  const { data: card } = await supabase
    .from('member_cards')
    .select('member_id, cooperative_id, status')
    .eq('card_number', decodeURIComponent(card_number))
    .eq('status', 'active')
    .maybeSingle()

  if (!card) {
    return (
      <div className="min-h-screen vfp-bg flex items-center justify-center px-6 relative">
        <style dangerouslySetInnerHTML={{ __html: vfpStyles }} />
        <div className="text-center max-w-xs">
          <p className="text-white/50 text-sm">Carte non trouvée ou inactive.</p>
          <Link href={`/verify/${card_number}`} className="inline-flex items-center gap-2 mt-4 text-[var(--vfp-accent)] text-sm font-medium">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
        </div>
      </div>
    )
  }

  // Get parcelles
  const { data: parcelles } = await supabase
    .from('parcelles')
    .select('culture_principale, superficie_ha, soil_type, irrigation_type')
    .eq('member_id', card.member_id)
    .order('created_at', { ascending: false })

  // Get member name + location (no phone/email)
  const { data: member } = await supabase
    .from('members')
    .select('first_name, last_name, canton, prefecture')
    .eq('id', card.member_id)
    .maybeSingle()

  const firstName = member?.first_name
    ? member.first_name.charAt(0).toUpperCase() + member.first_name.slice(1).toLowerCase()
    : ''
  const lastName = member?.last_name
    ? member.last_name.toUpperCase()
    : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Ce Membre'

  const location = [member?.canton, member?.prefecture].filter(Boolean).join(', ')

  const totalHa = (parcelles ?? []).reduce((sum, p) => sum + (p.superficie_ha ?? 0), 0)
  const cultures = new Set((parcelles ?? []).map(p => p.culture_principale).filter(Boolean))

  const irrigationIcon = (type: string | null) => {
    if (!type) return null
    const lower = type.toLowerCase()
    if (lower.includes('goute') || lower.includes('goutte') || lower.includes('drip')) return '💧'
    if (lower.includes('aspersion') || lower.includes('sprinkler')) return '🌧️'
    if (lower.includes('manuel') || lower.includes('traditional')) return '🪣'
    return '💦'
  }

  return (
    <div className="min-h-screen vfp-bg relative overflow-hidden" style={{ isolation: 'isolate' }}>
      <style dangerouslySetInnerHTML={{ __html: vfpStyles }} />

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ transform: 'translateZ(0)', zIndex: 0 }}>
        <div className="absolute top-[-20%] right-[-15%] w-[500px] h-[500px] rounded-full bg-[var(--vfp-accent)]/[0.08] blur-[100px]" />
        <div className="absolute bottom-[-15%] left-[-10%] w-[400px] h-[400px] rounded-full bg-[var(--vfp-accent)]/[0.12] blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-4 pt-4 pb-10 space-y-5">

        {/* Header */}
        <header className="flex items-center justify-between vfp-enter">
          <div className="flex items-center gap-3">
            <Link
              href={`/verify/${card_number}`}
              className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center"
              aria-label="Retour"
            >
              <ArrowLeft className="h-4 w-4 text-[var(--vfp-accent)]" />
            </Link>
            <Link href="/">
              <Logo size="sm" textClassName="text-white" />
            </Link>
          </div>
        </header>

        {/* Title */}
        <section className="vfp-enter" style={{ animationDelay: '80ms' }}>
          <h1 className="text-[22px] font-bold text-white leading-tight">
            Parcelles de{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--vfp-accent)] to-[var(--vfp-accent-dim)]">
              {fullName}
            </span>
          </h1>
          {location && (
            <p className="text-white/40 text-sm mt-1">📍 {location}</p>
          )}
        </section>

        {/* Stats strip */}
        {(parcelles ?? []).length > 0 && (
          <div className="grid grid-cols-3 gap-2.5 vfp-enter" style={{ animationDelay: '150ms' }}>
            <div className="vfp-card rounded-2xl p-3 text-center">
              <p className="text-[var(--vfp-accent)] text-xl font-bold">{(parcelles ?? []).length}</p>
              <p className="text-white/40 text-[11px] mt-0.5">Parcelles</p>
            </div>
            <div className="vfp-card rounded-2xl p-3 text-center">
              <p className="text-[var(--vfp-accent)] text-xl font-bold">{totalHa.toFixed(1)}</p>
              <p className="text-white/40 text-[11px] mt-0.5">Hectares</p>
            </div>
            <div className="vfp-card rounded-2xl p-3 text-center">
              <p className="text-[var(--vfp-accent)] text-xl font-bold">{cultures.size}</p>
              <p className="text-white/40 text-[11px] mt-0.5">Cultures</p>
            </div>
          </div>
        )}

        {/* Parcelles list */}
        {(parcelles ?? []).length === 0 ? (
          <div className="vfp-card rounded-2xl p-8 text-center vfp-enter" style={{ animationDelay: '200ms' }}>
            <Sprout className="h-10 w-10 text-white/15 mx-auto mb-3" />
            <p className="text-white/40 text-sm">Aucune parcelle enregistrée pour ce membre</p>
          </div>
        ) : (
          <div className="space-y-2.5 vfp-enter" style={{ animationDelay: '200ms' }}>
            {(parcelles as Parcelle[]).map((p, i) => (
              <div key={i} className="vfp-card rounded-2xl p-4 flex items-start gap-3">
                {/* Culture icon */}
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Sprout className="h-5 w-5 text-emerald-400" />
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* Culture chip + surface */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">
                      {p.culture_principale ?? 'Culture non spécifiée'}
                    </span>
                    {p.superficie_ha != null && (
                      <span className="text-xs font-mono text-[var(--vfp-accent)] shrink-0">
                        {p.superficie_ha.toFixed(2)} ha
                      </span>
                    )}
                  </div>

                  {/* Badges row */}
                  <div className="flex flex-wrap gap-1.5">
                    {p.soil_type && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300/80 border border-amber-500/15">
                        🪨 {p.soil_type}
                      </span>
                    )}
                    {p.irrigation_type && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300/80 border border-blue-500/15 flex items-center gap-1">
                        <Droplets className="h-3 w-3" />
                        {irrigationIcon(p.irrigation_type)} {p.irrigation_type}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-2 vfp-enter" style={{ animationDelay: '300ms' }}>
          <p className="text-[11px] text-white/20">
            Données collectées via KoboCollect · FaîtiereHub
          </p>
        </div>

      </div>
    </div>
  )
}
