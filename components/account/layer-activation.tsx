'use client'

/**
 * Activation de la seconde couche d'un compte.
 *
 * Un compte porte deux couches indépendantes : l'organisationnelle
 * (coopératives) et Haroo (professionnel indépendant). Chacune s'active depuis
 * l'espace de l'autre, ce qui suppose qu'aucune des deux n'expulse l'autre —
 * cf. les gardes de app/dashboard/layout.tsx et app/haroo/page.tsx.
 *
 * Les deux chemins ne sont pas symétriques :
 *   • Haroo s'active immédiatement ; seule la carte QR attend le contrôle
 *     du super_admin, sans quoi le badge « Vérifié » du scanner public ne
 *     garantirait plus rien.
 *   • L'organisation se demande. Une coopérative est une entité réelle qu'on
 *     ne s'auto-attribue pas : l'admin crée ou promeut le compte.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Building2, CheckCircle2, Network, Sprout, TrendingUp, BookOpen } from 'lucide-react'
import { useAuth } from '@/app/context/auth-context'
import { hasOrgLayer, isHarooRole } from '@/lib/utils/permissions'
import { HAROO_TYPE_LABELS, type HarooType } from '@/types/domain'

const HAROO_CHOICES: { value: HarooType; icon: React.ElementType; blurb: string }[] = [
  { value: 'ouvrier', icon: Sprout, blurb: "Offres d'emploi saisonnier près de chez vous" },
  { value: 'acheteur', icon: TrendingUp, blurb: 'Préventes de production filtrées sur vos produits' },
  { value: 'agronome', icon: BookOpen, blurb: 'Demandes de mission de conseil' },
]

/** Carte « Activer Haroo » — visible depuis le dashboard organisationnel. */
export function ActivateHarooCard() {
  const { user, refreshProfile } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<HarooType | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Rien à proposer si la couche est déjà là, ou si le compte n'a pas encore
  // de couche organisationnelle (il verra l'autre carte).
  if (!user || !hasOrgLayer(user.role) || isHarooRole(user.role, user.harooType)) return null

  const submit = async () => {
    if (!choice) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/account/activate-haroo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ haroo_type: choice }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? "Activation impossible pour l'instant.")
        setSubmitting(false)
        return
      }
      // Le profil en mémoire porte encore l'ancienne couche : sans ce
      // rafraîchissement, l'espace Haroo rejetterait l'utilisateur qu'on vient
      // d'y autoriser.
      await refreshProfile()
      setOpen(false)
      router.push('/haroo')
    } catch {
      setError('Erreur de connexion. Vérifiez votre internet.')
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-amber-300/60 bg-amber-50/40">
      <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Activer Haroo</h3>
            <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
              Ajoutez une identité professionnelle à ce compte — ouvrier, acheteur ou agronome.
              Votre coopérative et vos accès actuels sont conservés.
            </p>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0 gap-2 bg-amber-600 hover:bg-amber-700">
              <Network className="h-4 w-4" /> Activer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Quel est votre profil professionnel ?</DialogTitle>
              <DialogDescription>
                Un seul profil à la fois. Votre carte vérifiable par QR vous sera délivrée après
                contrôle par notre équipe.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 py-2">
              {HAROO_CHOICES.map(({ value, icon: Icon, blurb }) => {
                const selected = choice === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setChoice(value)}
                    aria-pressed={selected}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                      selected
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <Icon
                      className={`mt-0.5 h-5 w-5 shrink-0 ${selected ? 'text-amber-600' : 'text-muted-foreground'}`}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">
                        {HAROO_TYPE_LABELS[value]}
                      </span>
                      <span className="block text-xs text-muted-foreground">{blurb}</span>
                    </span>
                    {selected ? (
                      <CheckCircle2 className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    ) : null}
                  </button>
                )
              })}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <Button
                onClick={submit}
                disabled={!choice || submitting}
                className="gap-2 bg-amber-600 hover:bg-amber-700"
              >
                {submitting ? 'Activation…' : 'Activer mon profil'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

/** Carte « Rejoindre une organisation » — visible depuis l'espace Haroo. */
export function RequestOrgCard() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    organizationName: '',
    contactName: '',
    phone: '',
    type: 'cooperative' as 'faitiere' | 'union' | 'cooperative',
  })

  if (!user || hasOrgLayer(user.role)) return null

  const submit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          contactName: form.contactName || `${user.firstName} ${user.lastName}`.trim(),
          email: user.email,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Envoi impossible pour l\'instant.')
        setSubmitting(false)
        return
      }
      setSubmitted(true)
    } catch {
      setError('Erreur de connexion. Vérifiez votre internet.')
    }
    setSubmitting(false)
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Rejoindre une organisation</h3>
            <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
              Gérez une coopérative, une union ou une faîtière depuis ce même compte. Votre profil
              Haroo et votre carte sont conservés.
            </p>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="shrink-0 gap-2">
              <Building2 className="h-4 w-4" /> Faire une demande
            </Button>
          </DialogTrigger>
          <DialogContent>
            {submitted ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-primary" />
                <DialogTitle>Demande envoyée</DialogTitle>
                <DialogDescription>
                  Notre équipe vous recontacte sous 48 h. Votre compte actuel sera promu — vous ne
                  perdrez ni votre profil Haroo ni votre carte.
                </DialogDescription>
              </div>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Demande d'accès organisationnel</DialogTitle>
                  <DialogDescription>
                    Une organisation est une entité réelle : notre équipe vérifie la demande avant
                    d'ouvrir l'accès.
                  </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="orgName">Nom de l'organisation *</Label>
                    <Input
                      id="orgName"
                      value={form.organizationName}
                      onChange={(e) => setForm((f) => ({ ...f, organizationName: e.target.value }))}
                      placeholder="Coopérative Alliance Agricole"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="orgType">Niveau *</Label>
                    <select
                      id="orgType"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                      value={form.type}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, type: e.target.value as typeof f.type }))
                      }
                    >
                      <option value="cooperative">Coopérative</option>
                      <option value="union">Union</option>
                      <option value="faitiere">Faîtière</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="orgPhone">Téléphone *</Label>
                    <Input
                      id="orgPhone"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="90 11 22 33"
                    />
                  </div>
                </div>

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                <DialogFooter>
                  <Button
                    onClick={submit}
                    disabled={submitting || !form.organizationName.trim() || !form.phone.trim()}
                  >
                    {submitting ? 'Envoi…' : 'Envoyer la demande'}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
