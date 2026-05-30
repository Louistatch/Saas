'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/shared/logo'
import { AuthSidePanel } from '@/components/shared/auth-side-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { errorMessage } from '@/lib/utils/errors'

type SessionState = 'checking' | 'valid' | 'invalid'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionState, setSessionState] = useState<SessionState>('checking')

  // AUTH-06: only allow the password change with a valid RECOVERY session.
  // We listen for PASSWORD_RECOVERY (emitted when arriving from the email link)
  // and also check for an existing session, with a timeout fallback.
  useEffect(() => {
    let settled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        settled = true
        setSessionState('valid')
      }
    })

    // If a session already exists (code already exchanged by the callback), allow.
    supabase.auth.getSession().then(({ data }) => {
      if (!settled && data.session) {
        settled = true
        setSessionState('valid')
      }
    })

    // No recovery signal within 6s → treat the link as expired/invalid.
    const timer = setTimeout(() => {
      if (!settled) setSessionState('invalid')
    }, 6000)

    return () => {
      subscription?.unsubscribe()
      clearTimeout(timer)
    }
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères'); return }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas'); return }
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(errorMessage(updateError))
    } else {
      setDone(true)
      // Invalidate everywhere, then send the user to log in with the new password.
      await supabase.auth.signOut()
      setTimeout(() => router.push('/auth/login'), 2000)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <AuthSidePanel
        title="Sécurisez votre compte"
        description="Choisissez un mot de passe fort pour protéger votre coopérative."
        benefits={[
          'Au moins 8 caractères recommandés',
          'Mélangez lettres, chiffres et symboles',
          'Ne réutilisez pas un ancien mot de passe',
        ]}
        footer="Votre sécurité est notre priorité."
      />

      <div className="flex flex-col items-center justify-center p-4 sm:p-8 overflow-y-auto">
        {/* Mobile header: logo + back link + mini card */}
        <div className="md:hidden w-full max-w-sm mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <Link href="/auth/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Connexion
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
            <CardTitle className="text-2xl">Nouveau mot de passe</CardTitle>
            <CardDescription>Choisissez un mot de passe sécurisé pour votre compte</CardDescription>
          </CardHeader>
          <CardContent>
            {sessionState === 'checking' ? (
              <div className="space-y-4 text-center py-6">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground">Vérification du lien…</p>
              </div>
            ) : sessionState === 'invalid' ? (
              <div className="space-y-4 text-center py-4">
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                  <ArrowLeft className="h-6 w-6 text-destructive" />
                </div>
                <p className="font-medium text-foreground">Lien expiré ou invalide</p>
                <p className="text-sm text-muted-foreground">
                  Ce lien de réinitialisation n&apos;est plus valable. Demandez-en un nouveau.
                </p>
                <Link href="/auth/forgot-password">
                  <Button variant="outline" className="w-full border-border">
                    Demander un nouveau lien
                  </Button>
                </Link>
              </div>
            ) : done ? (
              <div className="space-y-4 text-center py-4">
                <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
                <p className="font-medium text-foreground">Mot de passe mis à jour !</p>
                <p className="text-sm text-muted-foreground">Redirection vers la page de connexion…</p>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="password">Nouveau mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-border bg-background text-foreground"
                    required
                  />
                  <p className="text-xs text-muted-foreground">Au moins 8 caractères</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="border-border bg-background text-foreground"
                    required
                  />
                </div>
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={loading}>
                  {loading ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
