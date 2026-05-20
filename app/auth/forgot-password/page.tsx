'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email) { setError('L\'email est requis'); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-2 justify-center">
          <Logo size="md" />
        </div>

        <Card className="border-border">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Réinitialiser le mot de passe</CardTitle>
            <CardDescription>
              Entrez votre email et nous vous enverrons un lien de réinitialisation
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4 text-center py-4">
                <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
                <p className="font-medium text-foreground">Vérifiez votre email</p>
                <p className="text-sm text-muted-foreground">
                  Nous avons envoyé un lien de réinitialisation à <strong>{email}</strong>
                </p>
                <Link href="/auth/login">
                  <Button variant="outline" className="w-full border-border gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Retour à la connexion
                  </Button>
                </Link>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Adresse email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border-border bg-background text-foreground"
                    required
                  />
                </div>
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={loading}>
                  {loading ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
                </Button>
                <Link href="/auth/login">
                  <Button variant="outline" className="w-full border-border gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Retour à la connexion
                  </Button>
                </Link>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
