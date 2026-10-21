'use client'

/**
 * Invitation d'un agent par son institution. Le lien ne sert qu'une fois, avec l'adresse
 * e-mail invitée : déjà connecté avec cette adresse, on rejoint en un geste ; sinon on crée
 * son compte ici. L'adresse n'est montrée que masquée.
 */

import { useAuth } from '@/app/context/auth-context'
import { api } from '@/components/payg/api'
import { Spinner } from '@/components/shared/loading'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'

interface InvitationInfo {
  institution: string
  full_name: string
  email: string
  role: 'owner' | 'manager' | 'agent'
  accepted: boolean
  expired: boolean
}

interface AcceptResult {
  created: boolean
  verify_email: boolean
  certification_elsewhere: boolean
  redirect_to: string
}

const ROLE = {
  owner: 'responsable',
  manager: 'gérant',
  agent: 'agent de terrain',
} as const

export default function InvitationPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const { user, isLoading } = useAuth()
  const [info, setInfo] = useState<InvitationInfo | null>(null)
  const [missing, setMissing] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<AcceptResult | null>(null)

  useEffect(() => {
    api<InvitationInfo>(`/api/invitations/${encodeURIComponent(token)}`).then((res) => {
      if (res.ok) {
        setInfo(res.data)
        const [first, ...rest] = res.data.full_name.split(' ')
        setFirstName(first ?? '')
        setLastName(rest.join(' '))
      } else setMissing(true)
    })
  }, [token])

  const accept = async () => {
    setBusy(true)
    setError('')
    const res = await api<AcceptResult>(`/api/invitations/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: user ? {} : { first_name: firstName.trim(), last_name: lastName.trim(), password },
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    if (user) {
      router.push(res.data.redirect_to)
      return
    }
    setDone(res.data)
  }

  const closed = info && (info.accepted || info.expired)

  return (
    <div className="min-h-screen bg-background">
      <header className="px-4 py-3 sm:px-6">
        <Logo size="md" />
      </header>
      <main className="mx-auto max-w-md px-4 pb-24 pt-6 sm:px-6">
        {!info && !missing ? (
          <div className="flex justify-center py-16" aria-busy="true">
            <Spinner className="h-6 w-6" />
          </div>
        ) : missing || !info ? (
          <Message title="Invitation introuvable">
            Ce lien n’existe pas ou a été annulé. Demandez une nouvelle invitation à votre
            institution.
          </Message>
        ) : done ? (
          <Message title="Compte créé">
            {done.verify_email
              ? 'Ouvrez l’e-mail de confirmation que nous venons d’envoyer, puis connectez-vous.'
              : 'Connectez-vous avec votre adresse e-mail et le mot de passe choisi.'}{' '}
            Votre formation vous attend dans votre console.
            <Button asChild className="mt-6 min-h-11 w-full">
              <Link href="/auth/login?redirect=/operator/console">Me connecter</Link>
            </Button>
          </Message>
        ) : closed ? (
          <Message title={info.accepted ? 'Invitation déjà utilisée' : 'Invitation expirée'}>
            {info.accepted
              ? 'Ce lien a déjà servi. Connectez-vous pour retrouver votre console.'
              : 'Ce lien n’est plus valable. Demandez-en un nouveau à votre institution.'}
            {info.accepted && (
              <Button asChild className="mt-6 min-h-11 w-full">
                <Link href="/auth/login?redirect=/operator/console">Me connecter</Link>
              </Button>
            )}
          </Message>
        ) : (
          <section aria-labelledby="invite-title" className="space-y-6">
            <div className="rounded-3xl bg-[#0d3d22] px-5 py-6 text-white">
              <p className="text-sm text-white/70">Invitation pour {info.full_name}</p>
              <h1 id="invite-title" className="mt-1 text-2xl font-bold leading-tight">
                Rejoindre {info.institution}
              </h1>
              <p className="mt-3 text-sm text-white/80">
                Comme {ROLE[info.role]}, vous émettrez les cartes des producteurs des coopératives
                qui vous seront confiées, avec les crédits de l’institution. Vous suivez d’abord la
                formation FaîtièreHub, personnelle à chaque agent.
              </p>
              <p className="mt-3 text-xs text-white/60">Adresse invitée : {info.email}</p>
            </div>

            {isLoading ? (
              <Spinner className="h-5 w-5" />
            ) : user ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Vous êtes connecté en tant que {user.email}. L’invitation ne fonctionne qu’avec
                  l’adresse invitée.
                </p>
                <Button onClick={accept} disabled={busy} className="min-h-11 w-full">
                  {busy ? <Spinner className="h-4 w-4" /> : `Rejoindre ${info.institution}`}
                </Button>
              </div>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void accept()
                }}
              >
                <h2 className="text-base font-semibold text-foreground">Créer mon compte</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-first">Prénom</Label>
                    <Input
                      id="inv-first"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-last">Nom</Label>
                    <Input
                      id="inv-last"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-password">Mot de passe (8 caractères minimum)</Label>
                  <Input
                    id="inv-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  className="min-h-11 w-full"
                  disabled={busy || !firstName.trim() || !lastName.trim() || password.length < 8}
                >
                  {busy ? <Spinner className="h-4 w-4" /> : 'Créer mon compte et rejoindre'}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Déjà un compte avec cette adresse ?{' '}
                  <Link
                    href={`/auth/login?redirect=/invitation/${encodeURIComponent(token)}`}
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    Se connecter
                  </Link>
                </p>
              </form>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 py-10 text-center">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  )
}
