'use client'

import { Logo } from '@/components/shared/logo'
import { AuthSidePanel } from '@/components/shared/auth-side-panel'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, UserPlus, CheckCircle2 } from 'lucide-react'
import { Spinner } from '@/components/shared/loading'
import { harooSignupSchema, flattenZodErrors } from '@/lib/validators/schemas'

const PROFILE_TYPES = [
  { value: 'OUVRIER', label: 'Ouvrier agricole', description: 'Emploi saisonnier dans vos cantons' },
  { value: 'ACHETEUR', label: 'Acheteur', description: 'Préventes et achats de production' },
  { value: 'AGRONOME', label: 'Agronome', description: 'Missions de conseil auprès des exploitants' },
] as const

/**
 * Inscription Haroo — self-service pour les professionnels agricoles
 * (OUVRIER / ACHETEUR / AGRONOME).
 *
 * Le compte est créé dans la même base Supabase que FaîtiereHub, via le
 * backend AgriTogo (proxy /api/haroo/auth/register). La connexion se fait
 * ensuite sur /auth/login comme pour tout utilisateur de la plateforme.
 */
export default function HarooSignupPage() {
  const [formData, setFormData] = useState({
    profileType: 'OUVRIER',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    const parsed = harooSignupSchema.safeParse(formData)
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
      const data: { success?: boolean; error?: string } = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
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
              Votre profil professionnel est enregistré. Connectez-vous avec votre
              email et votre mot de passe pour accéder aux services Haroo.
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
    <div className="min-h-screen flex">
      {/* Side panel */}
      <AuthSidePanel
        title="Rejoignez Haroo"
        description="Les services professionnels agricoles, intégrés à FaîtiereHub"
        benefits={[
          'Emploi saisonnier pour les ouvriers agricoles',
          'Préventes de production pour les acheteurs',
          'Missions de conseil pour les agronomes',
          'Carte professionnelle vérifiable par QR code',
        ]}
      />

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" /> Accueil
            </Link>
            <Logo size="sm" />
          </div>

          <Card className="border-border">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold text-foreground">Créer un compte Haroo</CardTitle>
              <CardDescription>
                Ouvriers agricoles, acheteurs et agronomes — créez votre profil professionnel en quelques minutes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="profileType">Je suis *</Label>
                  <select
                    id="profileType"
                    value={formData.profileType}
                    onChange={(e) => setFormData(f => ({ ...f, profileType: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {PROFILE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {PROFILE_TYPES.find(t => t.value === formData.profileType)?.description}
                  </p>
                  {fieldErrors.profileType && (
                    <p className="text-xs text-destructive">{fieldErrors.profileType}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Prénom *</Label>
                    <Input
                      id="firstName"
                      placeholder="Prénom"
                      value={formData.firstName}
                      onChange={(e) => setFormData(f => ({ ...f, firstName: e.target.value }))}
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
                      onChange={(e) => setFormData(f => ({ ...f, lastName: e.target.value }))}
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
                    onChange={(e) => setFormData(f => ({ ...f, phone: e.target.value }))}
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
                    onChange={(e) => setFormData(f => ({ ...f, email: e.target.value }))}
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
                    onChange={(e) => setFormData(f => ({ ...f, password: e.target.value }))}
                    aria-invalid={!!fieldErrors.password}
                    required
                  />
                  {fieldErrors.password && (
                    <p className="text-xs text-destructive">{fieldErrors.password}</p>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>
                )}

                <Button type="submit" className="w-full gap-2" disabled={submitting}>
                  {submitting ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  Créer mon compte
                </Button>
              </form>

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
      </div>
    </div>
  )
}
