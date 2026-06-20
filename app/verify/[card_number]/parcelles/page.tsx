import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { ArrowLeft, Sprout, Droplets, Navigation, CalendarDays } from 'lucide-react'
import { Logo } from '@/components/shared/logo'

/* ─── Premium Styles ─── */
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

const SOL_STYLE: Record<string, string> = {
  argileux: 'bg-amber-500/10 text-amber-300/80 border-amber-500/15',
  limoneux: 'bg-green-500/10 text-green-300/80 border-green-500/15',
  sableux: 'bg-yellow-500/10 text-yellow-300/80 border-yellow-500/15',
  laterite: 'bg-orange-500/10 text-orange-300/80 border-orange-500/15',
}

const IRRIG_LABEL: Record<string, string> = {
  oui: 'Irriguée',
  non: 'Pluviale',
  partielle: 'Partielle',
}

interface Props {
  params: Promise<{ card_number: string }>
}

export default async function ParcellesPage({ params }: Props) {
  const { card_number } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

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

  // Get all parcelle fields
  const { data: parcelles } = await admin
    .from('parcelles')
    .select('name, culture_principale, culture_name, superficie_ha, surface_ha, soil_type, irrigation_type, gps_coordinates, campaign_year, source, created_at')
    .eq('member_id', card.member_id)
    .order('created_at', { ascending: false })

  // Get member name + location (no phone/email)
  const { data: member } = await admin
    .from('members')
    .select('first_name, last_name, canton, prefecture, village, region')
    .eq('id', card.member_id)
    .maybeSingle()

  const firstName = member?.first_name
    ? member.first_name.charAt(0).toUpperCase() + member.first_name.slice(1).toLowerCase()
    : ''
  const lastName = member?.last_name ? member.last_name.toUpperCase() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Ce Membre'
  const location = [member?.village, member?.canton, member?.prefecture, member?.region].filter(Boolean).join(', ')

  const list = parcelles ?? []
  const totalHa = list.reduce((sum, p) => sum + (p.superficie_ha ?? p.surface_ha ?? 0), 0)
  const cultures = new Set(list.map(p => p.culture_principale ?? p.culture_name).filter(Boolean))
  const irrigatedCount = list.filter(p => p.irrigation_type && p.irrigation_type.toLowerCase() !== 'non').length

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
          {location && <p className="text-white/40 text-sm mt-1">📍 {location}</p>}
        </section>

        {/* Stats strip */}
        {list.length > 0 && (
          <div className="grid grid-cols-4 gap-2 vfp-enter" style={{ animationDelay: '150ms' }}>
            {[
              { value: list.length, label: 'Parcelles' },
              { value: totalHa.toFixed(1), label: 'Hectares' },
              { value: cultures.size, label: 'Cultures' },
              { value: irrigatedCount, label: 'Irriguées' },
            ].map(({ value, label }) => (
              <div key={label} className="vfp-card rounded-2xl p-3 text-center">
                <p className="text-[var(--vfp-accent)] text-lg font-bold">{value}</p>
                <p className="text-white/40 text-[10px] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Parcelles list */}
        {list.length === 0 ? (
          <div className="vfp-card rounded-2xl p-8 text-center vfp-enter" style={{ animationDelay: '200ms' }}>
            <Sprout className="h-10 w-10 text-white/15 mx-auto mb-3" />
            <p className="text-white/40 text-sm">Aucune parcelle enregistrée pour ce membre</p>
          </div>
        ) : (
          <div className="space-y-3 vfp-enter" style={{ animationDelay: '200ms' }}>
            {list.map((p, i) => {
              const culture = p.culture_principale ?? p.culture_name ?? 'Culture non spécifiée'
              const surface = p.superficie_ha ?? p.surface_ha
              const surfaceM2 = surface != null ? Math.round(surface * 10000) : null
              const solClass = SOL_STYLE[p.soil_type?.toLowerCase() ?? ''] ?? 'bg-white/5 text-white/50 border-white/8'
              const irrigLabel = IRRIG_LABEL[p.irrigation_type?.toLowerCase() ?? ''] ?? p.irrigation_type

              return (
                <div key={i} className="vfp-card rounded-2xl p-4 space-y-3">
                  {/* Top row */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                      <Sprout className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-white truncate">
                          {p.name ?? culture}
                        </span>
                        {surface != null && (
                          <span className="text-xs font-mono text-[var(--vfp-accent)] shrink-0">
                            {surface.toFixed(2)} ha
                          </span>
                        )}
                      </div>
                      {p.name && (
                        <p className="text-xs text-white/50 mt-0.5">{culture}</p>
                      )}
                    </div>
                  </div>

                  {/* Detail grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 pl-1">
                    {surface != null && (
                      <div>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider">Surface</p>
                        <p className="text-xs text-white font-mono">
                          {surface.toFixed(4)} ha
                          {surfaceM2 != null && <span className="text-white/40"> · {surfaceM2.toLocaleString('fr-FR')} m²</span>}
                        </p>
                      </div>
                    )}
                    {p.soil_type && (
                      <div>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider">Type de sol</p>
                        <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full border mt-0.5 ${solClass}`}>
                          {p.soil_type}
                        </span>
                      </div>
                    )}
                    {irrigLabel && (
                      <div>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider">Irrigation</p>
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border mt-0.5 ${irrigLabel === 'Irriguée' ? 'bg-blue-500/10 text-blue-300 border-blue-500/15' : 'bg-white/5 text-white/50 border-white/8'}`}>
                          {irrigLabel === 'Irriguée' && <Droplets className="h-2.5 w-2.5" />}
                          {irrigLabel}
                        </span>
                      </div>
                    )}
                    {p.campaign_year && (
                      <div>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider">Campagne</p>
                        <p className="text-xs text-white mt-0.5 flex items-center gap-1">
                          <CalendarDays className="h-3 w-3 text-white/30" />
                          {p.campaign_year}
                        </p>
                      </div>
                    )}
                    {p.source && (
                      <div>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider">Source</p>
                        <p className="text-xs text-white/60 capitalize mt-0.5">{p.source}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] text-white/30 uppercase tracking-wider">Enregistrée</p>
                      <p className="text-xs text-white/50 mt-0.5">
                        {new Date(p.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  {/* GPS */}
                  {p.gps_coordinates && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(p.gps_coordinates)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] text-[var(--vfp-accent)] hover:underline pl-1"
                    >
                      <Navigation className="h-3 w-3 shrink-0" />
                      <span className="font-mono">{p.gps_coordinates}</span>
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-2 vfp-enter" style={{ animationDelay: '300ms' }}>
          <p className="text-[11px] text-white/20">Données collectées via KoboCollect · FaîtiereHub</p>
        </div>

      </div>
    </div>
  )
}
