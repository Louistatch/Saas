'use client'

import { Logo } from '@/components/shared/logo'
import { AuthSidePanel } from '@/components/shared/auth-side-panel'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/app/context/auth-context'
import { Spinner } from '@/components/shared/loading'
import { errorMessage } from '@/lib/utils/errors'
import { flattenZodErrors, signupSchema } from '@/lib/validators/schemas'

export default function SignupPage() {
  const router = useRouter()
  const { signup, isLoading, isAuthenticated, user } = useAuth()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    cooperative: '',
    password: '',
  })
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.replace(user?.role === 'super_admin' ? '/admin' : '/dashboard')
    }
  }, [isAuthenticated, isLoading, user, router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!acceptTerms) {
      setError('Veuillez accepter les Conditions d\'utilisation pour continuer.')
      return
    }

    const parsed = signupSchema.safeParse(formData)
    if (!parsed.success) {
      setFieldErrors(flattenZodErrors(parsed.error))
      return
    }
    setFieldErrors({})

    setSubmitting(true)
    try {
      await signup(
        parsed.data.email,
        parsed.data.password,
        parsed.data.firstName,
        parsed.data.lastName,
        parsed.data.cooperative,
      )
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <AuthSidePanel
        title="Développez votre coopérative"
        description="Mettez votre coopérative en ligne en quelques minutes avec notre plateforme."
        benefits={[
          'Essai gratuit de 30 jours, sans carte bancaire',
          'Configuration en moins de 5 minutes',
          'Équipe de support dédiée',
        ]}
        footer="Rejoignez les coopératives agricoles utilisant FaîtiereHub."
      />

      <div className="flex flex-col items-center justify-center p-4 sm:p-8 overflow-y-auto">
        {/* Mobile header: logo + back link + mini card */}
        <div className="md:hidden w-full max-w-sm mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Accueil
            </Link>
            <Logo size="sm" />
          </div>
          {/* Mini card illustration mobile */}
          <div className="relative mx-auto w-full max-w-[240px]">
            <div className="bg-gradient-to-br from-primary via-primary/90 to-green-700 rounded-xl p-4 shadow-lg transform -rotate-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-[9px] uppercase tracking-widest">Carte Membre</p>
                  <p className="text-white font-bold text-xs">FaîtiereHub</p>
                </div>
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <div className="w-8 h-8 rounded-full bg-white/20" />
                <div className="space-y-1">
                  <div className="h-2 w-16 bg-white/30 rounded-full" />
                  <div className="h-1.5 w-10 bg-white/20 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <Card className="w-full max-w-sm border-border">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Créer votre compte</CardTitle>
            <CardDescription>Commencez avec FaîtiereHub dès aujourd&apos;hui</CardDescription>
          </CardHeader>

          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit} noValidate>
              {error && (
                <div
                  className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field id="firstName" label="Prénom" value={formData.firstName} onChange={handleChange} placeholder="Jean" error={fieldErrors.firstName} required />
                <Field id="lastName" label="Nom" value={formData.lastName} onChange={handleChange} placeholder="Dupont" error={fieldErrors.lastName} required />
              </div>

              <Field id="cooperative" label="Nom de la coopérative" value={formData.cooperative} onChange={handleChange} placeholder="Votre coopérative" error={fieldErrors.cooperative} required />

              <Field id="email" type="email" label="Adresse email" value={formData.email} onChange={handleChange} placeholder="vous@cooperative.com" error={fieldErrors.email} required autoComplete="email" />

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                    autoComplete="new-password"
                    aria-invalid={!!fieldErrors.password}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldErrors.password ? (
                  <p className="text-xs text-destructive">{fieldErrors.password}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Au moins 8 caractères avec des lettres et des chiffres.
                  </p>
                )}
              </div>

              <div className="flex items-start gap-2 pt-2">
                <Checkbox id="terms" className="mt-1" checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(!!v)} />
                <label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                  J&apos;accepte les{' '}
                  <Link href="#" className="text-primary hover:underline">Conditions d&apos;utilisation</Link>
                  {' '}et la{' '}
                  <Link href="#" className="text-primary hover:underline">Politique de confidentialité</Link>
                </label>
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                disabled={isLoading || submitting}
              >
                {isLoading || submitting ? <Spinner className="h-4 w-4" /> : null}
                {isLoading || submitting ? 'Création du compte…' : 'Créer un compte'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Vous avez déjà un compte ?{' '}
              <Link href="/auth/login" className="text-primary hover:underline font-medium">
                Se connecter
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type,
  error,
  required,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  type?: string
  error?: string
  required?: boolean
  autoComplete?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type ?? 'text'}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={!!error}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
