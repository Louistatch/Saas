'use client'

import { Logo } from '@/components/shared/logo'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Eye, EyeOff } from 'lucide-react'
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
      window.location.replace(user?.role === 'super_admin' ? '/admin' : '/dashboard')
    }
  }, [isAuthenticated, isLoading, user])

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
      <div className="hidden md:flex flex-col justify-between bg-gradient-to-br from-primary/10 to-accent/10 border-r border-border p-8">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Logo size="lg" />
        </Link>

        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-2">
              Développez votre coopérative
            </h2>
            <p className="text-muted-foreground">
              Mettez votre coopérative en ligne en quelques minutes avec notre plateforme.
            </p>
          </div>

          <ul className="space-y-4">
            {[
              'Essai gratuit de 30 jours, sans carte bancaire',
              'Configuration en moins de 5 minutes',
              'Équipe de support dédiée',
            ].map((benefit, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <span className="text-muted-foreground">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          Rejoignez les coopératives agricoles utilisant FaîtiereHub.
        </p>
      </div>

      <div className="flex items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-sm border-border">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Créer votre compte</CardTitle>
            <CardDescription>Commencez avec FaîtiereHub dès aujourd'hui</CardDescription>
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
