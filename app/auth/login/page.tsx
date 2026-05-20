'use client'

import { Logo } from '@/components/shared/logo'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback, Suspense, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/shared/loading'
import { errorMessage } from '@/lib/utils/errors'
import { flattenZodErrors, loginSchema } from '@/lib/validators/schemas'

/**
 * Login page — SELF-CONTAINED.
 * Does NOT depend on AuthProvider for the login action itself.
 * This prevents any race condition between context state and redirect.
 * 
 * Flow:
 * 1. User submits credentials
 * 2. Supabase signInWithPassword (sets httpOnly cookie)
 * 3. Fetch profile to determine role
 * 4. Hard redirect to /dashboard or /admin (window.location.replace)
 * 
 * The hard redirect ensures:
 * - Proxy re-evaluates with the new cookie
 * - AuthProvider initializes fresh with the new session
 * - No stale state from previous session
 */
function LoginInner() {
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = searchParams?.get('redirect')

  // Check if already authenticated on mount (e.g. user navigated here manually)
  // If so, redirect them away immediately
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return
      // Already logged in — determine where to go
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
        .then(({ data: profile }) => {
          if (cancelled) return
          if (profile?.role === 'super_admin') {
            window.location.replace('/admin')
          } else {
            window.location.replace(redirectTo || '/dashboard')
          }
        })
    })
    return () => { cancelled = true }
  }, [supabase, redirectTo])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setFieldErrors(flattenZodErrors(parsed.error))
      return
    }

    setSubmitting(true)

    try {
      // Step 1: Sign in with Supabase
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      })
      if (signInError) throw signInError
      if (!data.user) throw new Error('Aucun utilisateur retourné')

      // Step 2: Fetch profile to determine redirect target
      let role = 'member'
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single()
        if (profile?.role) role = profile.role
      } catch {
        // If profile fetch fails, default to dashboard
      }

      // Step 3: Hard redirect (kills all React state, forces fresh load)
      if (redirectTo && redirectTo.startsWith('/')) {
        window.location.replace(redirectTo)
      } else if (role === 'super_admin') {
        window.location.replace('/admin')
      } else {
        window.location.replace('/dashboard')
      }
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }, [email, password, supabase, redirectTo])

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex flex-col justify-between bg-gradient-to-br from-primary/10 to-accent/10 border-r border-border p-8">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Logo size="lg" />
        </Link>

        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-2">
              Connectez votre coopérative
            </h2>
            <p className="text-muted-foreground">
              Gérez vos membres, le marketplace et la croissance en un seul endroit.
            </p>
          </div>

          <ul className="space-y-4">
            {[
              'Gérer les données des membres et les cartes numériques',
              'Exploiter un marketplace coopératif',
              'Suivre les ventes et l\'engagement des membres',
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
          Au service des coopératives agricoles.
        </p>
      </div>

      <div className="flex items-center justify-center p-4 sm:p-8">
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
                {submitting ? 'Connexion en cours…' : 'Se connecter'}
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
