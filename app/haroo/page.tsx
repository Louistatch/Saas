'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Briefcase,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  LogOut,
  MapPin,
  Phone,
  ShoppingBasket,
  Sprout,
  Star,
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
 * Les profils et l'activité vivent dans les tables haroo_* de la base
 * Supabase partagée (lecture publique via RLS — mêmes données que la
 * vérification de carte). Les utilisateurs des coopératives sont redirigés
 * vers /dashboard.
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
  // agronome
  specialisations?: string[]
  badge_valide?: boolean
  statut_validation?: string
  nombre_missions?: number
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

const ROLE_META = {
  ouvrier: { table: 'haroo_ouvrier_profiles', label: 'Ouvrier agricole', icon: Briefcase },
  acheteur: { table: 'haroo_acheteur_profiles', label: 'Acheteur', icon: ShoppingBasket },
  agronome: { table: 'haroo_agronome_profiles', label: 'Agronome', icon: Sprout },
} as const

type HarooRoleKey = keyof typeof ROLE_META

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatFcfa(value: number | null): string {
  if (value == null) return '—'
  return `${Number(value).toLocaleString('fr-FR')} FCFA`
}

function HarooSpaceInner() {
  const { user } = useAuth()
  const router = useRouter()

  const [profile, setProfile] = useState<HarooProfile | null>(null)
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [presales, setPresales] = useState<PresaleRow[]>([])
  const [missions, setMissions] = useState<MissionRow[]>([])
  const [loading, setLoading] = useState(true)

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

      const { data: profileData } = await supabase
        .from(ROLE_META[harooRole].table)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle<HarooProfile>()
      if (cancelled) return
      setProfile(profileData ?? null)

      if (harooRole === 'ouvrier') {
        const { data } = await supabase
          .from('haroo_jobs')
          .select('id, type_travail, description, date_debut, date_fin, salaire_horaire, nombre_postes, cantons(name)')
          .eq('statut', 'OUVERTE')
          .order('created_at', { ascending: false })
          .limit(10)
          .returns<JobRow[]>()
        if (!cancelled) setJobs(data ?? [])
      } else if (harooRole === 'acheteur') {
        const { data } = await supabase
          .from('haroo_presales')
          .select('id, culture, quantite_estimee, prix_par_tonne, date_recolte_prevue, description, cantons(name)')
          .eq('statut', 'DISPONIBLE')
          .order('created_at', { ascending: false })
          .limit(10)
          .returns<PresaleRow[]>()
        if (!cancelled) setPresales(data ?? [])
      } else if (harooRole === 'agronome' && profileData) {
        const { data } = await supabase
          .from('haroo_missions')
          .select('id, description, statut, budget_propose, date_debut, date_fin, exploitant_name')
          .eq('agronome_id', profileData.id)
          .order('created_at', { ascending: false })
          .limit(10)
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

  if (!harooRole) return null

  const meta = ROLE_META[harooRole]
  const RoleIcon = meta.icon
  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()

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
                <h1 className="text-xl font-bold text-foreground">{fullName || 'Mon profil Haroo'}</h1>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <RoleIcon className="h-3.5 w-3.5" /> {meta.label}
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
                </div>
              </div>
              {harooRole === 'ouvrier' && profile && (
                <div className="text-sm text-muted-foreground space-y-1 sm:text-right">
                  <p className="inline-flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 text-primary" />
                    {Number(profile.note_moyenne ?? 0).toFixed(1)} / 5 ({profile.nombre_avis ?? 0} avis)
                  </p>
                  <p className={profile.disponible ? 'text-primary font-medium' : ''}>
                    {profile.disponible ? '● Disponible' : 'Indisponible'}
                  </p>
                </div>
              )}
              {harooRole === 'agronome' && profile && (
                <div className="text-sm text-muted-foreground space-y-1 sm:text-right">
                  <p className="inline-flex items-center gap-1.5">
                    {profile.badge_valide ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Badge validé
                      </>
                    ) : (
                      <>Validation : {profile.statut_validation ?? 'EN_ATTENTE'}</>
                    )}
                  </p>
                  <p>{profile.nombre_missions ?? 0} missions réalisées</p>
                </div>
              )}
            </div>

            {/* Tags (compétences / produits / spécialisations) */}
            {(() => {
              const tags =
                profile?.competences ?? profile?.produits_interesses ?? profile?.specialisations ?? []
              if (tags.length === 0) return null
              return (
                <div className="mt-4 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )
            })()}
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
                      Aucune offre ouverte pour le moment. Revenez bientôt.
                    </p>
                  )}
                  {jobs.map((job) => (
                    <div key={job.id} className="rounded-lg border border-border p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold text-foreground">{job.type_travail}</h3>
                        <span className="text-sm font-medium text-primary">
                          {formatFcfa(job.salaire_horaire)} / h
                        </span>
                      </div>
                      {job.description && (
                        <p className="text-sm text-muted-foreground">{job.description}</p>
                      )}
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
                      Aucune prévente disponible pour le moment. Revenez bientôt.
                    </p>
                  )}
                  {presales.map((presale) => (
                    <div key={presale.id} className="rounded-lg border border-border p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold text-foreground">{presale.culture}</h3>
                        <span className="text-sm font-medium text-primary">
                          {formatFcfa(presale.prix_par_tonne)} / tonne
                        </span>
                      </div>
                      {presale.description && (
                        <p className="text-sm text-muted-foreground">{presale.description}</p>
                      )}
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
                  ))}
                </CardContent>
              </Card>
            )}

            {harooRole === 'agronome' && (
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sprout className="h-5 w-5 text-primary" /> Mes missions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {missions.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Aucune mission pour le moment. Les exploitants peuvent vous solliciter
                      via votre carte professionnelle.
                    </p>
                  )}
                  {missions.map((mission) => (
                    <div key={mission.id} className="rounded-lg border border-border p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold text-foreground">
                          {mission.exploitant_name ?? 'Mission'}
                        </h3>
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          {mission.statut}
                        </span>
                      </div>
                      {mission.description && (
                        <p className="text-sm text-muted-foreground">{mission.description}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Budget : {formatFcfa(mission.budget_propose)}</span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatDate(mission.date_debut)} → {formatDate(mission.date_fin)}
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
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
