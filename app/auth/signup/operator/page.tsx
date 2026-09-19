'use client'

import { AuthSidePanel } from '@/components/shared/auth-side-panel'
import { Spinner } from '@/components/shared/loading'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { flattenZodErrors, operatorSignupSchema } from '@/lib/validators/schemas'
import { ArrowLeft, CheckCircle2, ShieldCheck, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

export default function OperatorSignupPage() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    displayName: '',
    phone: '',
    email: '',
    password: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [partnerCode, setPartnerCode] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    const parsed = operatorSignupSchema.safeParse(form)
    if (!parsed.success) {
      setFieldErrors(flattenZodErrors(parsed.error))
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/operator/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.error ?? 'Création du compte impossible.')
        setFieldErrors(body.fields ?? {})
      } else {
        setPartnerCode(body.partner_code ?? '')
        setSubmitted(true)
      }
    } catch {
      setError('Erreur de connexion. Vérifiez votre internet.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border">
          <CardContent className="space-y-4 pb-8 pt-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Compte Opérateur créé</h1>
            <p className="text-sm text-muted-foreground">
              Votre dossier candidat est prêt{partnerCode ? ` (${partnerCode})` : ''}.
              Connectez-vous pour commencer la formation obligatoire.
            </p>
            <Button className="w-full" asChild>
              <Link href="/auth/login?redirect=/operator/training">Commencer la formation</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <AuthSidePanel
        title="Devenez Opérateur FaîtiereHub"
        description="Un compte dédié pour se former, être évalué et exercer auprès des organisations agricoles."
        benefits={[
          'Formation professionnelle gratuite',
          'Évaluation pratique obligatoire',
          'Certification vérifiable',
          'Accès aux missions après validation',
        ]}
      />
      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-between">
            <Link
              href="/auth/signup"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Profils
            </Link>
            <Logo size="sm" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Créer un compte Opérateur
              </CardTitle>
              <CardDescription>
                Ce compte est réservé au parcours Opérateur. Il ne donne aucun accès aux données
                d&apos;une coopérative avant certification et mandat explicite.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4" noValidate>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Prénom"
                    name="firstName"
                    value={form.firstName}
                    error={fieldErrors.firstName}
                    onChange={(value) => setForm((old) => ({ ...old, firstName: value }))}
                  />
                  <Field
                    label="Nom"
                    name="lastName"
                    value={form.lastName}
                    error={fieldErrors.lastName}
                    onChange={(value) => setForm((old) => ({ ...old, lastName: value }))}
                  />
                </div>
                <Field
                  label="Nom d'opérateur ou structure"
                  name="displayName"
                  value={form.displayName}
                  error={fieldErrors.displayName}
                  onChange={(value) => setForm((old) => ({ ...old, displayName: value }))}
                />
                <Field
                  label="Téléphone"
                  name="phone"
                  type="tel"
                  value={form.phone}
                  error={fieldErrors.phone}
                  onChange={(value) => setForm((old) => ({ ...old, phone: value }))}
                />
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  value={form.email}
                  error={fieldErrors.email}
                  onChange={(value) => setForm((old) => ({ ...old, email: value }))}
                />
                <Field
                  label="Mot de passe"
                  name="password"
                  type="password"
                  value={form.password}
                  error={fieldErrors.password}
                  onChange={(value) => setForm((old) => ({ ...old, password: value }))}
                />
                {error ? (
                  <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" className="w-full gap-2" disabled={submitting}>
                  {submitting ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  Créer mon compte Opérateur
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  name,
  type = 'text',
  value,
  error,
  onChange,
}: {
  label: string
  name: string
  type?: string
  value: string
  error?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label} *</Label>
      <Input
        id={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error}
        required
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
