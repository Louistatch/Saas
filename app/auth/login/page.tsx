'use client'

import { useAuth } from '@/app/context/auth-context'
import { AuthSidePanel } from '@/components/shared/auth-side-panel'
import { Spinner } from '@/components/shared/loading'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/utils/errors'
import { hasOrgLayer, isHarooRole } from '@/lib/utils/permissions'
import { flattenZodErrors, loginSchema } from '@/lib/validators/schemas'
import { ArrowLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useState } from 'react'

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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
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

        const safeRedirect = redirectTo && /^\/[^/]/.test(redirectTo) ? redirectTo : null
        // Un professionnel Haroo ne doit jamais être renvoyé vers le dashboard
        // coopérative, même si ?redirect=/dashboard a été posé par le middleware
        // lors d'une visite déconnectée — son espace est /haroo.
        // Haroo SEUL : un compte qui porte aussi la couche organisationnelle
        // atterrit sur son dashboard, d'où il bascule vers Haroo.
        const harooUser = !hasOrgLayer(user?.role) && isHarooRole(user?.role, user?.harooType)
        const layerlessUser = user?.role === 'none' && !user.harooType
        let operatorUser = false
        if (layerlessUser) {
          const operatorStatus = await fetch('/api/account/partner-status')
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null)
          operatorUser = operatorStatus?.has_applied === true
        }
        const applicableRedirect =
          (harooUser || operatorUser) &&
          safeRedirect &&
          (safeRedirect.startsWith('/dashboard') || safeRedirect.startsWith('/admin'))
            ? null
            : safeRedirect
        const target =
          applicableRedirect ??
          (user?.role === 'super_admin'
            ? '/admin'
            : operatorUser
              ? '/operator'
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
    },
    [email, password, login, redirectTo, submitting, router],
  )

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8f5] md:flex-row">
      <AuthSidePanel
        imageSrc="/images/auth/operator-field-agent.webp"
        eyebrow="Votre espace FaîtiereHub"
        title="Le terrain nous rassemble."
        description="Retrouvez votre organisation, vos activités ou votre parcours de formation dans un espace adapté à votre profil."
        benefits={[
          'Formation et accompagnement',
          'Gestion des organisations agricoles',
          'Cartes membres vérifiables',
          'Activités et services agricoles',
        ]}
        footer="Organisations, membres, opérateurs et professionnels Haroo."
      />

      <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-7 sm:px-8 md:py-12 lg:px-12">
        <div className="mb-5 hidden w-full max-w-md md:block">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Accueil
            </Link>
            <Logo size="sm" />
          </div>
        </div>

        <Card className="w-full max-w-md border-black/[0.07] bg-white shadow-xl shadow-black/[0.06]">
          <CardHeader className="space-y-3 pb-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl">Bon retour</CardTitle>
            <CardDescription>
              Connectez-vous pour retrouver votre espace personnel FaîtiereHub.
            </CardDescription>
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
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="h-12 text-base"
                  placeholder="vous@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                  disabled={submitting}
                  required
                />
                {fieldErrors.email && (
                  <p id="email-error" className="text-xs text-destructive">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs text-primary hover:underline"
                  >
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
                    aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                    disabled={submitting}
                    required
                    className="h-12 pr-12 text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    aria-pressed={showPassword}
                    disabled={submitting}
                    aria-label={
                      showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                    }
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p id="password-error" className="text-xs text-destructive">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="h-12 w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
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
        <p className="mt-5 max-w-md text-center text-xs leading-relaxed text-muted-foreground">
          Un seul accès pour votre organisation, votre parcours Opérateur ou vos activités Haroo.
        </p>
      </main>
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
