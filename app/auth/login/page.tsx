'use client'

import { Logo } from '@/components/shared/logo'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback, Suspense, useMemo, useRef } from 'react'
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
 * Login page — SELF-CONTAINED + SELF-HEALING.
 * 
 * Handles ALL edge cases:
 * - Fresh login (no session)
 * - Already authenticated (redirect immediately)
 * - Zombie session (cookie exists but expired → clean up + allow login)
 * - Network timeout (watchdog unblocks button after 15s)
 * - Double submit (prevented by submitting flag)
 * - Return user after session expiry (clean state, allow re-login)
 */
function LoginInner() {
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const abortRef = useRef<AbortController | null>(null)
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = searchParams?.get('redirect')

  // On mount: check if user has a VALID session
  // If yes → redirect. If zombie/expired → clean up silently.
  useEffect(() => {
    let cancelled = false

    async function checkSession() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (cancelled) return

        // No user or auth error → clean state, show login form
        if (!user || authError) {
          // Clean any zombie cookies/storage
          try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
          return
        }

        // User exists — verify profile is accessible (session truly valid)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (cancelled) return

        if (profileError || !profile) {
          // Session exists but profile inaccessible → zombie session, clean up
          try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
          return
        }

        // Fully valid session → redirect
        if (profile.role === 'super_admin') {
          window.location.replace('/admin')
        } else {
          window.location.replace(redirectTo || '/dashboard')
        }
      } catch {
        // Network error or other issue → just show login form
      }
    }

    checkSession()
    return () => { cancelled = true }
  }, [supabase, redirectTo])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Prevent double submit
    if (submitting) return
    
    setError('')
    setFieldErrors({})

    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setFieldErrors(flattenZodErrors(parsed.error))
      return
    }

    setSubmitting(true)

    // Watchdog: unblock button after 15s no matter what
    const watchdog = setTimeout(() => {
      setSubmitting(false)
      setError('La connexion prend trop de temps. Vérifiez votre connexion internet et réessayez.')
    }, 15000)

    try {
      // Cancel any previous request
      abortRef.current?.abort()
      abortRef.current = new AbortController()

      // Step 1: Clean any stale session first
      try { await supabase.auth.signOut({ scope: 'local' }) } catch {}

      // Step 2: Sign in fresh
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      })
      
      if (signInError) throw signInError
      if (!data.user) throw new Error('Aucun utilisateur retourné')

      // Step 3: Fetch profile to determine redirect target
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

      // Step 4: Hard redirect (kills all React state, forces fresh load)
      clearTimeout(watchdog)
      
      const target = redirectTo && redirectTo.startsWith('/')
        ? redirectTo
        : role === 'super_admin'
          ? '/admin'
          : '/dashboard'

      window.location.replace(target)

      // Note: setSubmitting(false) is NOT called here because
      // window.location.replace will unload the page.
      // The watchdog handles the case where replace fails.

    } catch (err) {
      clearTimeout(watchdog)
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }, [email, password, supabase, redirectTo, submitting])

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
              Gérez vos membres, les comptes d&apos;exploitation et la croissance en un seul endroit.
            </p>
          </div>

          <ul className="space-y-4">
            {[
              'Gérer les données des membres et les cartes numériques',
              'Publier les comptes d\'exploitation par région',
              'Suivre les cotisations et l\'engagement des membres',
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
