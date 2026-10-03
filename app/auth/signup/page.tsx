'use client'

import { AuthSidePanel } from '@/components/shared/auth-side-panel'
import { Logo } from '@/components/shared/logo'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  type LucideIcon,
  ShieldCheck,
  Sprout,
  TrendingUp,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

/**
 * « Commencer » — on choisit d'abord l'ESPACE, puis le parcours.
 *
 *   FaîtiereHub → compte Opérateur : formation puis certification. Une fois
 *                 certifié, l'opérateur ouvre les organisations (faîtières,
 *                 unions, coopératives). Une organisation ne s'inscrit donc
 *                 plus elle-même ici.
 *   Haroo       → ouvrier, acheteur ou agronome : inscription Haroo directe,
 *                 type pré-sélectionné.
 *
 * `?espace=haroo` ou `?espace=faitierehub` ouvre directement l'étape voulue
 * (utilisé par le menu selon l'espace affiché).
 */
type Space = 'faitierehub' | 'haroo'

const SPACES: { value: Space; label: string; hint: string; blurb: string; icon: LucideIcon }[] = [
  {
    value: 'faitierehub',
    label: 'FaîtiereHub',
    hint: 'Organisations',
    blurb:
      'Devenez opérateur : suivez la formation, obtenez votre certification, puis ouvrez et accompagnez les organisations.',
    icon: ShieldCheck,
  },
  {
    value: 'haroo',
    label: 'Haroo',
    hint: 'Opportunités',
    blurb: 'Ouvrier, acheteur ou agronome : emplois, préventes et missions près de chez vous.',
    icon: Sprout,
  },
]

const HAROO_CHOICES: { value: string; label: string; blurb: string; icon: LucideIcon }[] = [
  {
    value: 'OUVRIER',
    label: 'Ouvrier agricole',
    blurb: "Trouvez des offres d'emploi saisonnier près de chez vous",
    icon: Sprout,
  },
  {
    value: 'ACHETEUR',
    label: 'Acheteur',
    blurb: 'Accédez aux préventes de production de votre zone',
    icon: TrendingUp,
  },
  {
    value: 'AGRONOME',
    label: 'Agronome',
    blurb: 'Recevez des demandes de mission de conseil',
    icon: BookOpen,
  },
]

function ChoiceButton({
  label,
  hint,
  blurb,
  icon: Icon,
  onClick,
}: {
  label: string
  hint?: string
  blurb: string
  icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-2xl border border-border p-4 text-left transition-colors duration-150 hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="font-semibold text-foreground">{label}</span>
          {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{blurb}</span>
      </span>
      <ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function SignupChooser() {
  const router = useRouter()
  const params = useSearchParams()
  const requested = params.get('espace')
  const [space, setSpace] = useState<Space | null>(requested === 'haroo' ? 'haroo' : null)

  const pickSpace = (value: Space) => {
    // FaîtiereHub n'a qu'un parcours d'inscription : l'opérateur.
    if (value === 'faitierehub') router.push('/auth/signup/operator')
    else setSpace(value)
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8f5] md:flex-row">
      <AuthSidePanel
        imageSrc="/images/auth/operator-field-agent.webp"
        eyebrow="Votre identité agricole"
        title="Un profil. Tout un écosystème agricole."
        description="Choisissez votre espace : FaîtiereHub pour accompagner les organisations, Haroo pour les opportunités agricoles."
        benefits={[
          'Formation et certification des opérateurs',
          'Organisations ouvertes par des opérateurs certifiés',
          'Emplois, préventes et missions avec Haroo',
          'Cartes vérifiables par QR code',
        ]}
      />
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-md space-y-5">
          <div className="flex items-center justify-between">
            {space ? (
              <button
                type="button"
                onClick={() => setSpace(null)}
                className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Changer d’espace
              </button>
            ) : (
              <Link
                href="/"
                className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Accueil
              </Link>
            )}
            <Logo size="sm" />
          </div>

          <Card className="border-black/[0.07] bg-white shadow-xl shadow-black/[0.06]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-2xl font-bold text-foreground">
                {space === 'haroo' ? 'Votre métier' : 'Quel espace ?'}
              </CardTitle>
              <CardDescription>
                {space === 'haroo'
                  ? 'Choisissez votre activité dans Haroo.'
                  : 'FaîtiereHub et Haroo font partie de la même plateforme.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {space === 'haroo'
                ? HAROO_CHOICES.map(({ value, label, blurb, icon }) => (
                    <ChoiceButton
                      key={value}
                      label={label}
                      blurb={blurb}
                      icon={icon}
                      onClick={() => router.push(`/auth/signup/haroo?type=${value}`)}
                    />
                  ))
                : SPACES.map(({ value, label, hint, blurb, icon }) => (
                    <ChoiceButton
                      key={value}
                      label={label}
                      hint={hint}
                      blurb={blurb}
                      icon={icon}
                      onClick={() => pickSpace(value)}
                    />
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

export default function SignupPage() {
  return (
    <Suspense>
      <SignupChooser />
    </Suspense>
  )
}
