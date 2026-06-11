'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  CloudRain,
  CreditCard,
  LineChart,
  LogOut,
  MapPin,
  Phone,
  ShoppingBasket,
  Sparkles,
  Sprout,
  Star,
  Sun,
} from 'lucide-react'
import { ProtectedRoute } from '@/app/components/protected-route'
import { useAuth } from '@/app/context/auth-context'
import { performLogout } from '@/lib/auth/logout'
import { createClient } from '@/lib/supabase/client'
import { isHarooRole } from '@/lib/utils/permissions'
import { Spinner } from '@/components/shared/loading'

/**
 * Espace Haroo — tableau de bord des professionnels agricoles
 * (ouvrier / acheteur / agronome).
 *
 * Chaque acteur voit d'abord ce qui le concerne :
 *   - ouvrier   → offres d'emploi DANS SES CANTONS en premier, puis les autres,
 *                 et un bouton pour basculer sa disponibilité (RLS own-update)
 *   - acheteur  → préventes correspondant à SES PRODUITS en premier
 *   - agronome  → demandes reçues, puis missions en cours
 *
 * Les données vivent dans les tables haroo_* de la base Supabase partagée
 * (lecture publique via RLS — mêmes données que la vérification de carte).
 */

interface HarooProfile {
  id: string
  card_number: string | null
  first_name: string
  last_name: string
  phone: string | null
  photo_url: string | null
  // ouvrier
  competences?: string[]
  disponible?: boolean
  note_moyenne?: number
  nombre_avis?: number
  // acheteur
  type_acheteur?: string | null
  produits_interesses?: string[]
  prefectures?: { name: string } | null
  // agronome
  specialisations?: string[]
  badge_valide?: boolean
  statut_validation?: string
  nombre_missions?: number
  cantons?: { name: string } | null
}

interface JobRow {
  id: string
  type_travail: string
  description: string | null
  date_debut: string | null
  date_fin: string | null
  salaire_horaire: number | null
  nombre_postes: number | null
  cantons: { name: string } | null
}

interface PresaleRow {
  id: string
  culture: string
  quantite_estimee: number | null
  prix_par_tonne: number | null
  date_recolte_prevue: string | null
  description: string | null
  cantons: { name: string } | null
}

interface MissionRow {
  id: string
  description: string | null
  statut: string
  budget_propose: number | null
  date_debut: string | null
  date_fin: string | null
  exploitant_name: string | null
}

/** Payload de /api/haroo/insights — météo 3 modèles + prix du marché régionaux. */
interface InsightsPayload {
  region: string
  weather: {
    date: string
    temperature_min: number
    temperature_max: number
    precipitation_mm: number
    precipitation_probability: number
    humidity_pct: number
  }[]
  prices: {
    id: string
    culture: string
    price: number
    trend: string
    market: string
    verified: boolean
    recorded_at: string
  }[]
}

const ROLE_META = {
  ouvrier: { table: 'haroo_ouvrier_profiles', label: 'Ouvrier agricole', icon: Briefcase },
  acheteur: { table: 'haroo_acheteur_profiles', label: 'Acheteur', icon: ShoppingBasket },
  agronome: { table: 'haroo_agronome_profiles', label: 'Agronome', icon: Sprout },
} as const

type HarooRoleKey = keyof typeof ROLE_META

const MISSION_STATUT_STYLE: Record<string, string> = {
  DEMANDE: 'bg-amber-100 text-amber-800',
  EN_COURS: 'bg-primary/10 text-primary',
  TERMINEE: 'bg-muted text-muted-foreground',
  ANNULEE: 'bg-destructive/10 text-destructive',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatFcfa(value: number | null): string {
  if (value == null) return '—'
  return `${Number(value).toLocaleString('fr-FR')} FCFA`
}

/** Petite carte d'indicateur (rangée de stats en haut de l'espace). */
function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Briefcase
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <Card className="border-border">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/** Carte d'offre d'emploi — surlignée quand elle est dans un canton de l'ouvrier. */
function JobCard({ job, highlight }: { job: JobRow; highlight: boolean }) {
  return (
    <div
      className={`rounded-lg border p-4 space-y-2 ${
        highlight ? 'border-primary/40 bg-primary/5' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{job.type_travail}</h3>
          {highlight && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              <Sparkles className="h-3 w-3" /> Dans votre canton
            </span>
          )}
        </div>
        <span className="text-sm font-medium text-primary">{formatFcfa(job.salaire_horaire)} / h</span>
      </div>
      {job.description && <p className="text-sm text-muted-foreground">{job.description}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {job.cantons?.name && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {job.cantons.name}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3 w-3" />
          {formatDate(job.date_debut)} → {formatDate(job.date_fin)}
        </span>
        {job.nombre_postes != null && <span>{job.nombre_postes} poste(s)</span>}
      </div>
    </div>
  )
}

/** Carte de prévente — surlignée quand la culture intéresse l'acheteur. */
function PresaleCard({ presale, highlight }: { presale: PresaleRow; highlight: boolean }) {
  return (
    <div
      className={`rounded-lg border p-4 space-y-2 ${
        highlight ? 'border-primary/40 bg-primary/5' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{presale.culture}</h3>
          {highlight && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              <Sparkles className="h-3 w-3" /> Correspond à vos produits
            </span>
          )}
        </div>
        <span className="text-sm font-medium text-primary">{formatFcfa(presale.prix_par_tonne)} / tonne</span>
      </div>
      {presale.description && <p className="text-sm text-muted-foreground">{presale.description}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {presale.cantons?.name && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {presale.cantons.name}
          </span>
        )}
        {presale.quantite_estimee != null && (
          <span>{Number(presale.quantite_estimee).toLocaleString('fr-FR')} t estimées</span>
        )}
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3 w-3" /> Récolte : {formatDate(presale.date_recolte_prevue)}
        </span>
      </div>
    </div>
  )
}

function MissionCard({ mission }: { mission: MissionRow }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground">{mission.exploitant_name ?? 'Mission'}</h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            MISSION_STATUT_STYLE[mission.statut] ?? 'bg-muted text-muted-foreground'
          }`}
        >
          {mission.statut.replace('_', ' ')}
        </span>
      </div>
      {mission.description && <p className="text-sm text-muted-foreground">{mission.description}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Budget : {formatFcfa(mission.budget_propose)}</span>
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3 w-3" />
          {formatDate(mission.date_debut)} → {formatDate(mission.date_fin)}
        </span>
      </div>
    </div>
  )
}

function HarooSpaceInner() {
  const { user } = useAuth()
  const router = useRouter()

  const [profile, setProfile] = useState<HarooProfile | null>(null)
  const [myCantons, setMyCantons] = useState<string[]>([])
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [presales, setPresales] = useState<PresaleRow[]>([])
  const [missions, setMissions] = useState<MissionRow[]>([])
  const [insights, setInsights] = useState<InsightsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [togglingDispo, setTogglingDispo] = useState(false)

  const role = user?.role
  const harooRole = role && isHarooRole(role) ? (role as HarooRoleKey) : null

  // Les utilisateurs non-Haroo ont leur propre espace.
  useEffect(() => {
    if (user && !isHarooRole(user.role)) {
      router.replace(user.role === 'super_admin' ? '/admin' : '/dashboard')
    }
  }, [user, router])

  useEffect(() => {
    if (!user || !harooRole) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      const supabase = createClient()

      const profileSelect =
        harooRole === 'acheteur'
          ? '*, prefectures(name)'
          : harooRole === 'agronome'
            ? '*, cantons(name)'
            : '*'

      const { data: profileData } = await supabase
        .from(ROLE_META[harooRole].table)
        .select(profileSelect)
        .eq('user_id', user.id)
        .maybeSingle<HarooProfile>()
      if (cancelled) return
      setProfile(profileData ?? null)

      if (harooRole === 'ouvrier') {
        const [cantonsRes, jobsRes] = await Promise.all([
          profileData
            ? supabase
                .from('haroo_ouvrier_cantons')
                .select('cantons(name)')
                .eq('ouvrier_id', profileData.id)
                .returns<{ cantons: { name: string } | null }[]>()
            : Promise.resolve({ data: [] as { cantons: { name: string } | null }[] }),
          supabase
            .from('haroo_jobs')
            .select('id, type_travail, description, date_debut, date_fin, salaire_horaire, nombre_postes, cantons(name)')
            .eq('statut', 'OUVERTE')
            .order('created_at', { ascending: false })
            .limit(20)
            .returns<JobRow[]>(),
        ])
        if (cancelled) return
        setMyCantons(
          (cantonsRes.data ?? []).map((r) => r.cantons?.name).filter((n): n is string => !!n),
        )
        setJobs(jobsRes.data ?? [])
      } else if (harooRole === 'acheteur') {
        const { data } = await supabase
          .from('haroo_presales')
          .select('id, culture, quantite_estimee, prix_par_tonne, date_recolte_prevue, description, cantons(name)')
          .eq('statut', 'DISPONIBLE')
          .order('created_at', { ascending: false })
          .limit(20)
          .returns<PresaleRow[]>()
        if (!cancelled) setPresales(data ?? [])
      } else if (harooRole === 'agronome' && profileData) {
        const { data } = await supabase
          .from('haroo_missions')
          .select('id, description, statut, budget_propose, date_debut, date_fin, exploitant_name')
          .eq('agronome_id', profileData.id)
          .order('created_at', { ascending: false })
          .limit(20)
          .returns<MissionRow[]>()
        if (!cancelled) setMissions(data ?? [])
      }

      if (!cancelled) setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user, harooRole])

  // Insights écosystème (météo de la zone + prix du marché de la région) —
  // un seul appel serveur, indépendant du chargement du profil.
  useEffect(() => {
    if (!user || !harooRole) return
    let cancelled = false
    fetch('/api/haroo/insights')
      .then((res) => (res.ok ? (res.json() as Promise<InsightsPayload>) : null))
      .then((data) => {
        if (!cancelled && data) setInsights(data)
      })
      .catch(() => null)
    return () => {
      cancelled = true
    }
  }, [user, harooRole])

  // ── Pertinence : trier ce qui concerne l'acteur en premier ──────────────────
  const { jobsInMyCantons, otherJobs } = useMemo(() => {
    const inMine: JobRow[] = []
    const others: JobRow[] = []
    for (const job of jobs) {
      if (job.cantons?.name && myCantons.includes(job.cantons.name)) inMine.push(job)
      else others.push(job)
    }
    return { jobsInMyCantons: inMine, otherJobs: others }
  }, [jobs, myCantons])

  const { matchingPresales, otherPresales } = useMemo(() => {
    const interests = (profile?.produits_interesses ?? []).map((p) => p.toLowerCase())
    const matching: PresaleRow[] = []
    const others: PresaleRow[] = []
    for (const presale of presales) {
      if (interests.includes(presale.culture.toLowerCase())) matching.push(presale)
      else others.push(presale)
    }
    return { matchingPresales: matching, otherPresales: others }
  }, [presales, profile?.produits_interesses])

  const demandes = useMemo(() => missions.filter((m) => m.statut === 'DEMANDE'), [missions])
  const enCours = useMemo(() => missions.filter((m) => m.statut === 'EN_COURS'), [missions])

  const toggleDisponible = async () => {
    if (!profile || togglingDispo) return
    setTogglingDispo(true)
    const next = !profile.disponible
    const supabase = createClient()
    const { error } = await supabase
      .from('haroo_ouvrier_profiles')
      .update({ disponible: next })
      .eq('id', profile.id)
    if (!error) setProfile((p) => (p ? { ...p, disponible: next } : p))
    setTogglingDispo(false)
  }

  if (!harooRole) return null

  const meta = ROLE_META[harooRole]
  const RoleIcon = meta.icon
  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()
  const tags = profile?.competences ?? profile?.produits_interesses ?? profile?.specialisations ?? []

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Logo size="md" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <RoleIcon className="h-3.5 w-3.5" />
              {meta.label} Haroo
            </span>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => performLogout()}>
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Déconnexion</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Accueil personnalisé */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Bonjour{profile?.first_name ? `, ${profile.first_name}` : ''} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {harooRole === 'ouvrier' && 'Voici les offres d\'emploi du moment, en commençant par vos cantons.'}
            {harooRole === 'acheteur' && 'Voici les préventes disponibles, en commençant par vos produits.'}
            {harooRole === 'agronome' && 'Voici vos demandes de mission et vos missions en cours.'}
          </p>
        </div>

        {/* Indicateurs clés */}
        {!loading && (
          <div className="grid gap-4 sm:grid-cols-3">
            {harooRole === 'ouvrier' && (
              <>
                <StatCard
                  icon={Briefcase}
                  label="Offres dans vos cantons"
                  value={jobsInMyCantons.length}
                  hint={myCantons.length ? myCantons.join(', ') : 'Aucun canton renseigné'}
                />
                <StatCard
                  icon={Star}
                  label={`Note moyenne (${profile?.nombre_avis ?? 0} avis)`}
                  value={`${Number(profile?.note_moyenne ?? 0).toFixed(1)} / 5`}
                />
                <Card className="border-border">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={`text-xl font-bold leading-tight ${profile?.disponible ? 'text-primary' : 'text-muted-foreground'}`}>
                          {profile?.disponible ? '● Disponible' : 'Indisponible'}
                        </p>
                        <p className="text-xs text-muted-foreground">Visible par les recruteurs</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleDisponible}
                        disabled={togglingDispo || !profile}
                      >
                        {togglingDispo ? <Spinner className="h-4 w-4" /> : profile?.disponible ? 'Me retirer' : 'Me rendre dispo'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
            {harooRole === 'acheteur' && (
              <>
                <StatCard
                  icon={Sparkles}
                  label="Préventes pour vos produits"
                  value={matchingPresales.length}
                  hint={(profile?.produits_interesses ?? []).join(', ') || undefined}
                />
                <StatCard icon={ShoppingBasket} label="Préventes disponibles" value={presales.length} />
                <StatCard
                  icon={MapPin}
                  label="Préfecture d'intervention"
                  value={profile?.prefectures?.name ?? '—'}
                />
              </>
            )}
            {harooRole === 'agronome' && (
              <>
                <StatCard icon={Clock} label="Demandes reçues" value={demandes.length} />
                <StatCard icon={Sprout} label="Missions en cours" value={enCours.length} />
                <StatCard
                  icon={Star}
                  label={`Note moyenne — ${profile?.nombre_missions ?? 0} missions réalisées`}
                  value={`${Number(profile?.note_moyenne ?? 0).toFixed(1)} / 5`}
                />
              </>
            )}
          </div>
        )}

        {/* Insights écosystème : météo de la zone + prix du marché régionaux */}
        {insights && (insights.weather.length > 0 || insights.prices.length > 0) && (
          <div className="grid gap-4 md:grid-cols-2">
            {insights.weather.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sun className="h-4 w-4 text-primary" /> Météo — région {insights.region}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(() => {
                    const today = insights.weather[0]
                    const favorable =
                      today.precipitation_mm < 2 && today.precipitation_probability < 40
                    const hint =
                      harooRole === 'ouvrier'
                        ? favorable
                          ? '✅ Conditions favorables aux travaux des champs aujourd\'hui'
                          : '🌧️ Pluie probable aujourd\'hui — planifiez les travaux en conséquence'
                        : harooRole === 'acheteur'
                          ? favorable
                            ? '✅ Bonne fenêtre pour les collectes et livraisons'
                            : '🌧️ Pluie probable — anticipez les délais de transport'
                          : favorable
                            ? '✅ Bonne fenêtre pour les visites de terrain'
                            : '🌧️ Pluie probable — privilégiez le conseil à distance'
                    return (
                      <p
                        className={`rounded-md px-3 py-2 text-sm font-medium ${
                          favorable ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {hint}
                      </p>
                    )
                  })()}
                  <div className="grid grid-cols-4 gap-2">
                    {insights.weather.map((day, i) => {
                      const rainy = day.precipitation_probability >= 50
                      const DayIcon = rainy ? CloudRain : Sun
                      return (
                        <div
                          key={day.date}
                          className="rounded-lg border border-border p-2 text-center space-y-1"
                        >
                          <p className="text-[11px] font-medium text-muted-foreground capitalize">
                            {i === 0
                              ? 'Aujourd\'hui'
                              : new Date(day.date).toLocaleDateString('fr-FR', {
                                  weekday: 'short',
                                  day: 'numeric',
                                })}
                          </p>
                          <DayIcon
                            className={`h-4 w-4 mx-auto ${rainy ? 'text-blue-500' : 'text-amber-500'}`}
                          />
                          <p className="text-xs font-semibold text-foreground">
                            {day.temperature_max}° / {day.temperature_min}°
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {day.precipitation_probability}% pluie
                          </p>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Ensemble 3 modèles (ECMWF · GFS · ICON) — module météo AgriSmart
                  </p>
                </CardContent>
              </Card>
            )}

            {insights.prices.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <LineChart className="h-4 w-4 text-primary" /> Prix du marché — région {insights.region}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(() => {
                      const interests = (profile?.produits_interesses ?? []).map((p) =>
                        p.toLowerCase(),
                      )
                      const sorted = [...insights.prices].sort((a, b) => {
                        const am = interests.includes(a.culture.toLowerCase()) ? 0 : 1
                        const bm = interests.includes(b.culture.toLowerCase()) ? 0 : 1
                        return am - bm
                      })
                      return sorted.slice(0, 6).map((price) => {
                        const matches = interests.includes(price.culture.toLowerCase())
                        return (
                          <div
                            key={price.id}
                            className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${
                              matches ? 'border-primary/40 bg-primary/5' : 'border-border'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {price.culture}
                                {matches && (
                                  <span className="ml-2 text-[10px] font-semibold text-primary uppercase">
                                    vos produits
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {price.market}
                                {price.verified ? ' · ✓ vérifié' : ''}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-foreground">
                                {price.price.toLocaleString('fr-FR')} F/kg
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {price.trend === 'up'
                                  ? '↑ Hausse'
                                  : price.trend === 'down'
                                    ? '↓ Baisse'
                                    : '→ Stable'}
                              </p>
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Prix collectés sur le terrain via FaîtiereHub
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Profil */}
        <Card className="border-border">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                {fullName
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || '?'}
              </div>
              <div className="flex-1 space-y-1">
                <h2 className="text-lg font-bold text-foreground">{fullName || 'Mon profil Haroo'}</h2>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <RoleIcon className="h-3.5 w-3.5" /> {meta.label}
                    {harooRole === 'acheteur' && profile?.type_acheteur ? ` · ${profile.type_acheteur}` : ''}
                  </span>
                  {profile?.phone && (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" /> {profile.phone}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" />
                    {profile?.card_number ? `Carte ${profile.card_number}` : 'Carte en attente d\'émission'}
                  </span>
                  {harooRole === 'agronome' && profile?.cantons?.name && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> {profile.cantons.name}
                    </span>
                  )}
                </div>
              </div>
              {harooRole === 'agronome' && profile && (
                <div className="text-sm sm:text-right">
                  {profile.badge_valide ? (
                    <p className="inline-flex items-center gap-1.5 text-primary font-medium">
                      <CheckCircle2 className="h-4 w-4" /> Badge validé
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Validation : {profile.statut_validation ?? 'EN_ATTENTE'}</p>
                  )}
                </div>
              )}
            </div>

            {tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activité selon le type de profil */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <>
            {harooRole === 'ouvrier' && (
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-primary" /> Offres d&apos;emploi ouvertes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {jobs.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Aucune offre ouverte pour le moment. Revenez bientôt — les coopératives publient
                      régulièrement de nouvelles offres.
                    </p>
                  )}
                  {jobsInMyCantons.map((job) => (
                    <JobCard key={job.id} job={job} highlight />
                  ))}
                  {otherJobs.length > 0 && jobsInMyCantons.length > 0 && (
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">
                      Ailleurs au Togo
                    </p>
                  )}
                  {otherJobs.map((job) => (
                    <JobCard key={job.id} job={job} highlight={false} />
                  ))}
                </CardContent>
              </Card>
            )}

            {harooRole === 'acheteur' && (
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShoppingBasket className="h-5 w-5 text-primary" /> Préventes disponibles
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {presales.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Aucune prévente disponible pour le moment. Revenez bientôt — les producteurs
                      publient leurs préventes avant chaque récolte.
                    </p>
                  )}
                  {matchingPresales.map((presale) => (
                    <PresaleCard key={presale.id} presale={presale} highlight />
                  ))}
                  {otherPresales.length > 0 && matchingPresales.length > 0 && (
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">
                      Autres cultures
                    </p>
                  )}
                  {otherPresales.map((presale) => (
                    <PresaleCard key={presale.id} presale={presale} highlight={false} />
                  ))}
                </CardContent>
              </Card>
            )}

            {harooRole === 'agronome' && (
              <>
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5 text-amber-600" /> Demandes reçues
                      {demandes.length > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                          {demandes.length}
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {demandes.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Aucune demande en attente. Les exploitants peuvent vous solliciter via votre
                        carte professionnelle.
                      </p>
                    )}
                    {demandes.map((mission) => (
                      <MissionCard key={mission.id} mission={mission} />
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sprout className="h-5 w-5 text-primary" /> Missions en cours
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {enCours.length === 0 && (
                      <p className="text-sm text-muted-foreground">Aucune mission en cours.</p>
                    )}
                    {enCours.map((mission) => (
                      <MissionCard key={mission.id} mission={mission} />
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default function HarooSpacePage() {
  return (
    <ProtectedRoute>
      <HarooSpaceInner />
    </ProtectedRoute>
  )
}
