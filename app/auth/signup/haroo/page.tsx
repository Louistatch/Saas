'use client'

import { AuthSidePanel } from '@/components/shared/auth-side-panel'
import { Spinner } from '@/components/shared/loading'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Profession } from '@/lib/professionals/core'
import { flattenZodErrors, harooSignupSchema } from '@/lib/validators/schemas'
import { useAuth } from '@/app/context/auth-context'
import { accountJourney, harooAction } from '@/lib/account/journey'
import { ArrowLeft, CheckCircle2, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

/**
 * Choix affichés. Technicien et conseiller sont des professions de la
 * famille AGRONOME (même table, même haroo_type) : `profession` les distingue.
 */
const PROFILE_TYPES = [
  {
    value: 'OUVRIER',
    label: 'Ouvrier agricole',
    description: 'Emploi saisonnier dans vos cantons',
  },
  { value: 'ACHETEUR', label: 'Acheteur', description: 'Préventes et achats de production' },
  {
    value: 'AGRONOME',
    label: 'Agronome',
    description: 'Missions de conseil auprès des exploitants',
  },
  {
    value: 'TECHNICIEN',
    label: 'Technicien agricole',
    description: 'Appui technique de terrain auprès des producteurs',
  },
  {
    value: 'CONSEILLER',
    label: 'Conseiller agricole',
    description: 'Conseil et accompagnement des exploitations',
  },
] as const

type ChoiceValue = (typeof PROFILE_TYPES)[number]['value']

const ADVISOR_PROFESSION: Partial<Record<ChoiceValue, Profession>> = {
  AGRONOME: 'agronome',
  TECHNICIEN: 'technicien',
  CONSEILLER: 'conseiller',
}

/** Spécialités proposées (colonne specialisations, modifiable ensuite). */
const SPECIALITES = [
  'Fertilité des sols',
  'Protection des cultures',
  'Irrigation',
  'Maraîchage',
  'Cultures de rente',
  'Céréales',
  'Agroforesterie',
  'Agroécologie',
  'Élevage',
  'Post-récolte',
] as const

/**
 * Inscription Haroo — self-service pour les professionnels agricoles
 * (OUVRIER / ACHETEUR / AGRONOME).
 *
 * Le compte est créé dans la même base Supabase que FaîtiereHub, via le
 * backend AgriTogo (proxy /api/haroo/auth/register). La connexion se fait
 * ensuite sur /auth/login comme pour tout utilisateur de la plateforme.
 */
function HarooSignupForm() {
  const { user } = useAuth()
  const journey = accountJourney(user)
  // Le profil choisi à l'étape 1 de /auth/signup arrive par ?type= : sans
  // cela l'utilisateur qui a cliqué « Agronome » retomberait sur un
  // formulaire pré-réglé sur « Ouvrier ».
  const searchParams = useSearchParams()
  const requestedType = searchParams.get('type')?.toUpperCase()
  const initialType = PROFILE_TYPES.some((t) => t.value === requestedType)
    ? (requestedType as string)
    : 'OUVRIER'

  const [formData, setFormData] = useState({
    profileType: initialType as string,
    faitiereId: '',
    specialisations: [] as string[],
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [faitieres, setFaitieres] = useState<{ id: string; name: string }[] | null>(null)

  const profession = ADVISOR_PROFESSION[formData.profileType as ChoiceValue]
  const isAdvisor = profession !== undefined

  useEffect(() => {
    if (!isAdvisor || faitieres !== null) return
    fetch('/api/faitieres')
      .then((r) => (r.ok ? r.json() : { faitieres: [] }))
      .then((d: { faitieres?: { id: string; name: string }[] }) => setFaitieres(d.faitieres ?? []))
      .catch(() => setFaitieres([]))
  }, [isAdvisor, faitieres])

  const toggleSpecialite = (value: string) =>
    setFormData((f) => ({
      ...f,
      specialisations: f.specialisations.includes(value)
        ? f.specialisations.filter((s) => s !== value)
        : [...f.specialisations, value],
    }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    // Technicien / conseiller → type AGRONOME + profession.
    const parsed = harooSignupSchema.safeParse({
      profileType: isAdvisor ? 'AGRONOME' : formData.profileType,
      ...(isAdvisor
        ? {
            profession,
            faitiereId: formData.faitiereId || undefined,
            specialisations: formData.specialisations,
          }
        : {}),
      firstName: formData.firstName,
      lastName: formData.lastName,
      phone: formData.phone,
      email: formData.email,
      password: formData.password,
    })
    if (!parsed.success) {
      setFieldErrors(flattenZodErrors(parsed.error))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/haroo/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const data: {
        success?: boolean
        error?: string
        verify_email?: boolean
        fields?: Record<string, string>
      } = await res.json().catch(() => ({}))
      if (data.fields) setFieldErrors(data.fields)
      if (res.ok && data.success && data.verify_email) {
        window.location.assign(`/auth/verify-email?email=${encodeURIComponent(parsed.data.email)}`)
      } else if (res.ok && data.success) {
        setSubmitted(true)
      } else {
        setError(data.error || 'Erreur lors de la création du compte. Réessayez.')
      }
    } catch {
      setError('Erreur de connexion. Vérifiez votre internet.')
    }
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Compte Haroo créé !</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Votre profil professionnel est enregistré. Connectez-vous avec votre email et votre
              mot de passe pour accéder aux services Haroo.
            </p>
            <div className="pt-4">
              <Link href="/auth/login">
                <Button className="w-full">Se connecter</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8f5] md:flex-row">
      {/* Side panel */}
      <AuthSidePanel
        imageSrc="/images/auth/operator-field-agent.webp"
        eyebrow="Réseau professionnel Haroo"
        title="Votre métier agricole mérite plus d’opportunités."
        description="Créez votre identité professionnelle, développez votre réseau et accédez aux missions adaptées à votre profil."
        benefits={[
          'Emploi saisonnier pour les ouvriers agricoles',
          'Préventes de production pour les acheteurs',
          'Missions de conseil pour les agronomes, techniciens et conseillers',
          'Carte professionnelle vérifiable par QR code',
        ]}
      />

      {/* Form */}
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-md space-y-5">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Accueil
            </Link>
            <Logo size="sm" />
          </div>

          <Card className="border-black/[0.07] bg-white shadow-xl shadow-black/[0.06]">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold text-foreground">
                {user ? 'Votre espace Haroo' : 'Créer votre compte'}
              </CardTitle>
              <CardDescription>
                Un seul compte FaîtiereHub pour tous les services. Ouvriers agricoles, acheteurs et
                agronomes : votre profil Haroo s’y ajoute.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user ? (
                // Déjà connecté : on n'ouvre JAMAIS un second compte. Le profil
                // existant reçoit l'extension Haroo (ou y donne accès).
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Vous êtes connecté en tant que{' '}
                    <span className="font-medium text-foreground">
                      {user.firstName} {user.lastName}
                    </span>
                    . Haroo utilise ce même compte et ce même profil.
                  </p>
                  <Button asChild className="w-full">
                    <Link href={(harooAction(journey) ?? { href: journey.homeUrl }).href}>
                      {(harooAction(journey) ?? { label: 'Aller à mon espace' }).label}
                    </Link>
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="profileType">Je suis *</Label>
                    <select
                      id="profileType"
                      value={formData.profileType}
                      onChange={(e) => setFormData((f) => ({ ...f, profileType: e.target.value }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {PROFILE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {PROFILE_TYPES.find((t) => t.value === formData.profileType)?.description}
                    </p>
                    {fieldErrors.profileType && (
                      <p className="text-xs text-destructive">{fieldErrors.profileType}</p>
                    )}
                  </div>

                  {isAdvisor && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="faitiereId">Faîtière de rattachement *</Label>
                        <select
                          id="faitiereId"
                          value={formData.faitiereId}
                          onChange={(e) =>
                            setFormData((f) => ({ ...f, faitiereId: e.target.value }))
                          }
                          aria-invalid={!!fieldErrors.faitiereId}
                          required
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">
                            {faitieres === null ? 'Chargement…' : '— Choisissez votre faîtière —'}
                          </option>
                          {(faitieres ?? []).map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Un opérateur officier de cette faîtière vérifiera votre dossier avant
                          l’émission de votre carte professionnelle.
                        </p>
                        {fieldErrors.faitiereId && (
                          <p className="text-xs text-destructive">{fieldErrors.faitiereId}</p>
                        )}
                      </div>

                      <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">Spécialités</legend>
                        <div className="flex flex-wrap gap-2">
                          {SPECIALITES.map((spec) => {
                            const active = formData.specialisations.includes(spec)
                            return (
                              <button
                                key={spec}
                                type="button"
                                aria-pressed={active}
                                onClick={() => toggleSpecialite(spec)}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                  active
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:bg-muted'
                                }`}
                              >
                                {spec}
                              </button>
                            )
                          })}
                        </div>
                        {fieldErrors.specialisations && (
                          <p className="text-xs text-destructive">{fieldErrors.specialisations}</p>
                        )}
                      </fieldset>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">Prénom *</Label>
                      <Input
                        id="firstName"
                        placeholder="Prénom"
                        value={formData.firstName}
                        onChange={(e) => setFormData((f) => ({ ...f, firstName: e.target.value }))}
                        aria-invalid={!!fieldErrors.firstName}
                        required
                      />
                      {fieldErrors.firstName && (
                        <p className="text-xs text-destructive">{fieldErrors.firstName}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Nom *</Label>
                      <Input
                        id="lastName"
                        placeholder="Nom"
                        value={formData.lastName}
                        onChange={(e) => setFormData((f) => ({ ...f, lastName: e.target.value }))}
                        aria-invalid={!!fieldErrors.lastName}
                        required
                      />
                      {fieldErrors.lastName && (
                        <p className="text-xs text-destructive">{fieldErrors.lastName}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Téléphone *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+228 90 XX XX XX"
                      value={formData.phone}
                      onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                      aria-invalid={!!fieldErrors.phone}
                      required
                    />
                    {fieldErrors.phone && (
                      <p className="text-xs text-destructive">{fieldErrors.phone}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="vous@exemple.tg"
                      value={formData.email}
                      onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                      aria-invalid={!!fieldErrors.email}
                      required
                    />
                    {fieldErrors.email && (
                      <p className="text-xs text-destructive">{fieldErrors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Mot de passe *</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="8 caractères minimum"
                      value={formData.password}
                      onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
                      aria-invalid={!!fieldErrors.password}
                      required
                    />
                    {fieldErrors.password && (
                      <p className="text-xs text-destructive">{fieldErrors.password}</p>
                    )}
                  </div>

                  {error && (
                    <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">
                      {error}
                    </p>
                  )}

                  <Button type="submit" className="w-full gap-2" disabled={submitting}>
                    {submitting ? (
                      <Spinner className="h-4 w-4" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    Créer mon compte
                  </Button>
                </form>
              )}

              <div className="mt-6 text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Vous avez déjà un compte ?{' '}
                  <Link href="/auth/login" className="text-primary font-medium hover:underline">
                    Se connecter
                  </Link>
                </p>
                <p className="text-sm text-muted-foreground">
                  Vous êtes une coopérative ?{' '}
                  <Link href="/auth/signup" className="text-primary font-medium hover:underline">
                    Demander un accès
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

/**
 * useSearchParams impose une frontière Suspense en App Router, sans quoi la
 * page entière bascule en rendu client au build.
 */
export default function HarooSignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Spinner />
        </div>
      }
    >
      <HarooSignupForm />
    </Suspense>
  )
}
