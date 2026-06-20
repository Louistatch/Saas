'use client'

import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useCallback, Suspense } from 'react'
import { Logo } from '@/components/shared/logo'
import { AuthSidePanel } from '@/components/shared/auth-side-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/app/context/auth-context'
import { Spinner } from '@/components/shared/loading'
import { errorMessage } from '@/lib/utils/errors'
import { isHarooRole } from '@/lib/utils/permissions'
import { flattenZodErrors, loginSchema } from '@/lib/validators/schemas'

/**
 * Login page — FAST + RESILIENT.
 * 
 * Design principles:
 * - NO session check on mount (eliminates 4-8s delay on slow networks)
 * - Single network call: signInWithPassword (profile fetch is optional)
 * - Immediate redirect after signIn success (don't wait for profile)
 * - 15s timeout with smart recovery
 * - Visual progress feedback via the submit button
 * - SPA navigation via router.replace (no full reload)
 */

function LoginInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState('')

  const redirectTo = searchParams?.get('redirect')

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    setError('')
    setFieldErrors({})

    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setFieldErrors(flattenZodErrors(parsed.error))
      return
    }

    setSubmitting(true)
    setProgress('Authentification…')

    // Progressive feedback for Supabase free-tier cold starts (no hard timeout).
    const progressTimer = setTimeout(() => {
      setProgress('Connexion en cours, veuillez patienter…')
    }, 5000)
    const slowTimer = setTimeout(() => {
      setProgress('Le serveur démarre, encore quelques secondes…')
    }, 12000)

    try {
      // SINGLE source of truth: the AuthContext.login() method.
      const user = await login(parsed.data.email, parsed.data.password)

      clearTimeout(progressTimer)
      clearTimeout(slowTimer)

      setProgress('Redirection…')

      const safeRedirect =
        redirectTo && /^\/[^/]/.test(redirectTo) ? redirectTo : null
      // Un professionnel Haroo ne doit jamais être renvoyé vers le dashboard
      // coopérative, même si ?redirect=/dashboard a été posé par le middleware
      // lors d'une visite déconnectée — son espace est /haroo.
      const harooUser = isHarooRole(user?.role)
      const applicableRedirect =
        harooUser && safeRedirect && (safeRedirect.startsWith('/dashboard') || safeRedirect.startsWith('/admin'))
          ? null
          : safeRedirect
      const target =
        applicableRedirect ??
        (user?.role === 'super_admin'
          ? '/admin'
          : harooUser
            ? '/haroo'
            : '/dashboard')

      router.replace(target)
    } catch (err: unknown) {
      clearTimeout(progressTimer)
      clearTimeout(slowTimer)
      setError(errorMessage(err))
      setSubmitting(false)
      setProgress('')
    }
  }, [email, password, login, redirectTo, submitting, router])

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <AuthSidePanel
        title="Connectez votre coopérative"
        description="Gérez vos membres, les comptes d'exploitation et la croissance en un seul endroit."
        benefits={[
          'Gérer les données des membres et les cartes numériques',
          'Publier les comptes d\'exploitation par région',
          'Suivre les cotisations et l\'engagement des membres',
        ]}
        footer="Au service des coopératives agricoles."
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
            <CardTitle className="text-2xl">Bon retour</CardTitle>
            <CardDescription>Connectez-vous à votre compte coopératif</CardDescription>
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

              <div className="space-y-2">
                <Label htmlFor="email">Adresse email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!fieldErrors.email}
                  disabled={submitting}
                  required
                />
                {fieldErrors.email && (
                  <p className="text-xs text-destructive">{fieldErrors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Link href="/auth/forgot-password" className="text-xs text-primary hover:underline">
                    Mot de passe oublié ?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!fieldErrors.password}
                    disabled={submitting}
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
                {fieldErrors.password && (
                  <p className="text-xs text-destructive">{fieldErrors.password}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                disabled={submitting}
              >
                {submitting ? <Spinner className="h-4 w-4" /> : null}
                {submitting ? progress || 'Connexion…' : 'Se connecter'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Vous n&apos;avez pas de compte ?{' '}
              <Link href="/auth/signup" className="text-primary hover:underline font-medium">
                S&apos;inscrire
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}
