'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/shared/logo'
import { AuthSidePanel } from '@/components/shared/auth-side-panel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, MailCheck, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { errorMessage } from '@/lib/utils/errors'

function VerifyEmailInner() {
  const searchParams = useSearchParams()
  const email = searchParams?.get('email') ?? ''
  const [resending, setResending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleResend = async () => {
    if (!email) return
    setResending(true)
    setError('')
    setMessage('')
    try {
      const supabase = createClient()
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?type=signup` },
      })
      if (resendError) throw resendError
      setMessage('Email renvoyé. Vérifiez votre boîte de réception.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setResending(false)
    }
  }

  return (
    <Card className="w-full max-w-sm border-border">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl">Vérifiez votre email</CardTitle>
        <CardDescription>Une dernière étape pour activer votre compte</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-5 text-center py-2">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <MailCheck className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Nous avons envoyé un lien de confirmation
            {email ? (
              <> à <strong className="text-foreground">{email}</strong></>
            ) : (
              <> à votre adresse email</>
            )}
            . Cliquez dessus pour activer votre compte et finaliser la création de votre
            coopérative.
          </p>

          {message && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-sm text-green-700">
              {message}
            </div>
          )}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            variant="outline"
            className="w-full border-border gap-2"
            onClick={handleResend}
            disabled={resending || !email}
          >
            <RefreshCw className={`h-4 w-4 ${resending ? 'animate-spin' : ''}`} />
            {resending ? 'Envoi…' : "Renvoyer l'email"}
          </Button>

          <Link href="/auth/login">
            <Button variant="ghost" className="w-full gap-2 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
              Retour à la connexion
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <AuthSidePanel
        title="Bienvenue dans FaîtiereHub"
        description="Confirmez votre email pour rejoindre le réseau des coopératives."
        benefits={[
          'Gérez vos membres et leurs cartes',
          'Suivez vos cotisations et exploitations',
          'Accédez au marketplace coopératif',
        ]}
        footer="À un clic de votre tableau de bord."
      />
      <div className="flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="md:hidden mb-6">
          <Logo size="sm" />
        </div>
        <Suspense fallback={null}>
          <VerifyEmailInner />
        </Suspense>
      </div>
    </div>
  )
}
