'use client'

import { AuthSidePanel } from '@/components/shared/auth-side-panel'
import { Spinner } from '@/components/shared/loading'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { accessRequestSchema, flattenZodErrors } from '@/lib/validators/schemas'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  Send,
  ShieldCheck,
  Sprout,
  TrendingUp,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Inscription — le profil se choisit d'abord, puis chaque choix enchaîne sur
 * son itinéraire déjà établi.
 *
 *   organisation → demande d'accès : une coopérative est une entité réelle,
 *                  le compte est créé par l'administrateur après vérification
 *   ouvrier /
 *   acheteur /
 *   agronome     → inscription Haroo directe, avec le type pré-sélectionné
 *
 * Le choix n'enferme personne : la seconde couche s'active plus tard depuis
 * son espace, sur le même compte (cf. components/account/layer-activation).
 */
type ProfileChoice = 'organisation' | 'ouvrier' | 'acheteur' | 'agronome' | 'operator'

const PROFILE_CHOICES: {
  value: ProfileChoice
  label: string
  blurb: string
  icon: React.ElementType
}[] = [
  {
    value: 'operator',
    label: 'Opérateur FaîtiereHub',
    blurb: 'Suivez la formation et obtenez votre certification professionnelle',
    icon: ShieldCheck,
  },
  {
    value: 'organisation',
    label: 'Une organisation',
    blurb: 'Faîtière, union ou coopérative — gérez vos membres et vos parcelles',
    icon: Building2,
  },
  {
    value: 'ouvrier',
    label: 'Ouvrier agricole',
    blurb: "Trouvez des offres d'emploi saisonnier près de chez vous",
    icon: Sprout,
  },
  {
    value: 'acheteur',
    label: 'Acheteur',
    blurb: 'Accédez aux préventes de production de votre zone',
    icon: TrendingUp,
  },
  {
    value: 'agronome',
    label: 'Agronome',
    blurb: 'Recevez des demandes de mission de conseil',
    icon: BookOpen,
  },
]

export default function SignupPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    organizationName: '',
    contactName: '',
    phone: '',
    email: '',
    type: 'faitiere',
    message: '',
  })
  // Étape 1 : le profil se choisit avant tout, puis chaque choix enchaîne
  // sur son itinéraire déjà établi — demande d'accès pour une organisation,
  // inscription directe pour un professionnel Haroo.
  const [profileChoice, setProfileChoice] = useState<ProfileChoice | null>(null)
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
      // /api/contact-request sert les demandes de contact fournisseur et exige
      // member_id + buyer_name : ce formulaire y postait un tout autre corps,
      // que la validation rejetait systématiquement. Les demandes d'accès ont
      // désormais leur propre route.
      const res = await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        setError("Erreur lors de l'envoi. Réessayez ou contactez-nous par WhatsApp.")
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
              Votre demande d&apos;accès a été transmise à l&apos;équipe FaîtiereHub. Nous vous
              contacterons sous 24-48h pour créer votre compte.
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
                <Button variant="outline" className="w-full mt-2">
                  💬 Nous contacter sur WhatsApp
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!profileChoice) {
    return (
      <div className="flex min-h-screen flex-col bg-[#f7f8f5] md:flex-row">
        <AuthSidePanel
          imageSrc="/images/auth/operator-field-agent.webp"
          eyebrow="Votre identité agricole"
          title="Un profil. Tout un écosystème agricole."
          description="Choisissez votre parcours et accédez aux services conçus pour votre activité, avec un compte unique FaîtiereHub."
          benefits={[
            'Gestion centralisée de vos membres',
            'Cartes numériques avec QR code',
            'Prix du marché en temps réel',
            'Fiches techniques par culture',
          ]}
        />
        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
          <div className="w-full max-w-md space-y-5">
            <div className="flex items-center justify-between">
              <Link
                href="/"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Accueil
              </Link>
              <Logo size="sm" />
            </div>

            <Card className="border-black/[0.07] bg-white shadow-xl shadow-black/[0.06]">
              <CardHeader className="space-y-2">
                <CardTitle className="text-2xl font-bold text-foreground">
                  Quel est votre profil ?
                </CardTitle>
                <CardDescription>
                  Vous pourrez activer la seconde couche plus tard depuis votre espace, sans créer
                  de second compte.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {PROFILE_CHOICES.map(({ value, label, blurb, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      if (value === 'organisation') {
                        setProfileChoice(value)
                      } else if (value === 'operator') {
                        router.push('/auth/signup/operator')
                      } else {
                        // Itinéraire Haroo déjà établi, avec le type pré-sélectionné.
                        router.push(`/auth/signup/haroo?type=${value.toUpperCase()}`)
                      }
                    }}
                    className="flex w-full items-start gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
                  >
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">{label}</span>
                      <span className="block text-xs text-muted-foreground">{blurb}</span>
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </CardContent>
            </Card>

            <p className="text-center text-sm text-muted-foreground">
              Vous avez déjà un compte ?{' '}
              <Link href="/auth/login" className="font-medium text-primary hover:underline">
                Se connecter
              </Link>
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8f5] md:flex-row">
      {/* Side panel */}
      <AuthSidePanel
        imageSrc="/images/auth/operator-field-agent.webp"
        eyebrow="Organisations agricoles"
        title="Structurez votre organisation. Valorisez vos membres."
        description="Centralisez vos adhérents, vos parcelles et vos cartes professionnelles dans un espace sécurisé."
        benefits={[
          'Gestion centralisée de vos membres',
          'Cartes numériques avec QR code',
          'Prix du marché en temps réel',
          'Fiches techniques par culture',
        ]}
      />

      {/* Form */}
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-md space-y-5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setProfileChoice(null)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Changer de profil
            </button>
            <Logo size="sm" />
          </div>

          <Card className="border-black/[0.07] bg-white shadow-xl shadow-black/[0.06]">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold text-foreground">
                Demander un accès
              </CardTitle>
              <CardDescription>
                Les comptes sont créés par l&apos;administrateur. Remplissez ce formulaire et nous
                vous contacterons.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Type d&apos;organisation *</Label>
                  <select
                    id="type"
                    value={formData.type}
                    onChange={(e) => setFormData((f) => ({ ...f, type: e.target.value }))}
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
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, organizationName: e.target.value }))
                    }
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
                    onChange={(e) => setFormData((f) => ({ ...f, contactName: e.target.value }))}
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
                    onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
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
                    onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
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
                    onChange={(e) => setFormData((f) => ({ ...f, message: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
                  />
                  {fieldErrors.message && (
                    <p className="text-xs text-destructive">{fieldErrors.message}</p>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">
                    {error}
                  </p>
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
      </main>
    </div>
  )
}
