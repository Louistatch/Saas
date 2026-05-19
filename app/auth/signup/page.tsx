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
      router.push(user?.role === 'super_admin' ? '/admin' : '/dashboard')
    }
  }, [isAuthenticated, isLoading, user, router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!acceptTerms) {
      setError('Please accept the Terms of Service to continue.')
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
              Start Growing Your Cooperative
            </h2>
            <p className="text-muted-foreground">
              Get your cooperative online in minutes with our platform.
            </p>
          </div>

          <ul className="space-y-4">
            {[
              '30-day free trial, no credit card needed',
              'Setup takes less than 5 minutes',
              'Dedicated support team',
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
          Join agricultural cooperatives using FaîtiereHub.
        </p>
      </div>

      <div className="flex items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-sm border-border">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Create Your Account</CardTitle>
            <CardDescription>Get started with FaîtiereHub today</CardDescription>
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
                <Field id="firstName" label="First Name" value={formData.firstName} onChange={handleChange} placeholder="Jean" error={fieldErrors.firstName} required />
                <Field id="lastName" label="Last Name" value={formData.lastName} onChange={handleChange} placeholder="Dupont" error={fieldErrors.lastName} required />
              </div>

              <Field id="cooperative" label="Cooperative Name" value={formData.cooperative} onChange={handleChange} placeholder="Your Cooperative" error={fieldErrors.cooperative} required />

              <Field id="email" type="email" label="Email Address" value={formData.email} onChange={handleChange} placeholder="you@cooperative.com" error={fieldErrors.email} required autoComplete="email" />

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
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
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldErrors.password ? (
                  <p className="text-xs text-destructive">{fieldErrors.password}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    At least 8 characters with letters and numbers.
                  </p>
                )}
              </div>

              <div className="flex items-start gap-2 pt-2">
                <Checkbox id="terms" className="mt-1" checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(!!v)} />
                <label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                  I agree to the{' '}
                  <Link href="#" className="text-primary hover:underline">Terms of Service</Link>
                  {' '}and{' '}
                  <Link href="#" className="text-primary hover:underline">Privacy Policy</Link>
                </label>
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                disabled={isLoading || submitting}
              >
                {isLoading || submitting ? <Spinner className="h-4 w-4" /> : null}
                {isLoading || submitting ? 'Creating Account…' : 'Create Account'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-primary hover:underline font-medium">
                Sign in
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
