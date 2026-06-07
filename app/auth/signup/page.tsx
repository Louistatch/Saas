'use client'

import { Logo } from '@/components/shared/logo'
import { AuthSidePanel } from '@/components/shared/auth-side-panel'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Send, CheckCircle2 } from 'lucide-react'
import { Spinner } from '@/components/shared/loading'
import { accessRequestSchema, flattenZodErrors } from '@/lib/validators/schemas'

/**
 * Signup page — replaced by a "Request Access" form.
 * 
 * On FaîtiereHub, accounts are created by the platform admin.
 * Users (faîtières, coopératives) submit a request here,
 * and the admin creates their account manually.
 */
export default function SignupPage() {
  const [formData, setFormData] = useState({
    organizationName: '',
    contactName: '',
    phone: '',
    email: '',
    type: 'faitiere',
    message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    const parsed = accessRequestSchema.safeParse(formData)
    if (!parsed.success) {
      setFieldErrors(flattenZodErrors(parsed.error))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/contact-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: parsed.data.contactName,
          email: parsed.data.email || `${parsed.data.phone}-${crypto.randomUUID().slice(0, 8)}@faitierehub.com`,
          phone: parsed.data.phone,
          organization: parsed.data.organizationName,
          type: parsed.data.type,
          message: parsed.data.message || `Demande d'accès - ${parsed.data.type} - ${parsed.data.organizationName}`,
        }),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        setError('Erreur lors de l\'envoi. Réessayez ou contactez-nous par WhatsApp.')
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
            <h2 className="text-xl font-bold text-foreground">Demande envoyée !</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Votre demande d&apos;accès a été transmise à l&apos;équipe FaîtiereHub.
              Nous vous contacterons sous 24-48h pour créer votre compte.
            </p>
            <div className="pt-4 space-y-2">
              <Link href="/auth/login">
                <Button className="w-full">Aller à la connexion</Button>
              </Link>
              <a
                href="https://wa.me/22890000000?text=Bonjour%2C%20j%27ai%20fait%20une%20demande%20d%27acc%C3%A8s%20sur%20FaitireHub"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="w-full mt-2">💬 Nous contacter sur WhatsApp</Button>
              </a>
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
        title="Rejoignez FaîtiereHub"
        description="La plateforme de gestion des faîtières agricoles du Togo"
        benefits={[
          'Gestion centralisée de vos membres',
          'Cartes numériques avec QR code',
          'Prix du marché en temps réel',
          'Fiches techniques par culture',
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
              <CardTitle className="text-2xl font-bold text-foreground">Demander un accès</CardTitle>
              <CardDescription>
                Les comptes sont créés par l&apos;administrateur. Remplissez ce formulaire et nous vous contacterons.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Type d&apos;organisation *</Label>
                  <select
                    id="type"
                    value={formData.type}
                    onChange={(e) => setFormData(f => ({ ...f, type: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="faitiere">Faîtière / Fédération</option>
                    <option value="union">Union régionale</option>
                    <option value="cooperative">Coopérative</option>
                  </select>
                  {fieldErrors.type && (
                    <p className="text-xs text-destructive">{fieldErrors.type}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="org">Nom de l&apos;organisation *</Label>
                  <Input
                    id="org"
                    placeholder="Ex: FENOMAT, FNGPC..."
                    value={formData.organizationName}
                    onChange={(e) => setFormData(f => ({ ...f, organizationName: e.target.value }))}
                    aria-invalid={!!fieldErrors.organizationName}
                    required
                  />
                  {fieldErrors.organizationName && (
                    <p className="text-xs text-destructive">{fieldErrors.organizationName}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact">Nom du responsable *</Label>
                  <Input
                    id="contact"
                    placeholder="Prénom et nom"
                    value={formData.contactName}
                    onChange={(e) => setFormData(f => ({ ...f, contactName: e.target.value }))}
                    aria-invalid={!!fieldErrors.contactName}
                    required
                  />
                  {fieldErrors.contactName && (
                    <p className="text-xs text-destructive">{fieldErrors.contactName}</p>
                  )}
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
                  <Label htmlFor="email">Email (optionnel)</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="contact@organisation.tg"
                    value={formData.email}
                    onChange={(e) => setFormData(f => ({ ...f, email: e.target.value }))}
                    aria-invalid={!!fieldErrors.email}
                  />
                  {fieldErrors.email && (
                    <p className="text-xs text-destructive">{fieldErrors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message (optionnel)</Label>
                  <textarea
                    id="message"
                    placeholder="Précisions sur votre organisation, nombre de membres..."
                    value={formData.message}
                    onChange={(e) => setFormData(f => ({ ...f, message: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
                  />
                  {fieldErrors.message && (
                    <p className="text-xs text-destructive">{fieldErrors.message}</p>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>
                )}

                <Button type="submit" className="w-full gap-2" disabled={submitting}>
                  {submitting ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  Envoyer la demande
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Vous avez déjà un compte ?{' '}
                  <Link href="/auth/login" className="text-primary font-medium hover:underline">
                    Se connecter
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
