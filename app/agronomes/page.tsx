'use client'

/**
 * Annuaire des agronomes certifiés (profil validé + carte active). Un
 * exploitant connecté leur demande une mission ; l'agronome la reçoit sur sa
 * carte et dans son espace /haroo, et l'accepte avec le PIN de sa carte.
 */

import { useAuth } from '@/app/context/auth-context'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Award, CheckCircle2, Loader2, Lock, MapPin, Star } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

interface Agronome {
  id: string
  name: string
  photo_url: string | null
  specialisations: string[]
  note_moyenne: number
  nombre_missions: number
  canton: string | null
  prefecture: string | null
  region: string | null
}

function RequestForm({ agronome, onDone }: { agronome: Agronome; onDone: () => void }) {
  const [description, setDescription] = useState('')
  const [culture, setCulture] = useState('')
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <form
      className="mt-3 space-y-2 border-t border-border pt-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError('')
        const res = await fetch('/api/haroo/missions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agronome_id: agronome.id,
            description: description.trim(),
            culture: culture.trim() || undefined,
            phone: phone.trim(),
            date_debut: date || undefined,
          }),
        })
        const data = await res.json().catch(() => ({}))
        setBusy(false)
        if (!res.ok) setError(data.error ?? 'Demande impossible.')
        else onDone()
      }}
    >
      <Textarea
        rows={3}
        required
        minLength={10}
        placeholder="Votre besoin : diagnostic, irrigation, traitement…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Culture" value={culture} onChange={(e) => setCulture(e.target.value)} />
        <Input
          type="date"
          aria-label="Date souhaitée"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <Input
        type="tel"
        inputMode="tel"
        required
        placeholder="Votre téléphone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button
        type="submit"
        className="w-full gap-2"
        disabled={busy || description.trim().length < 10 || phone.trim().length < 8}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Envoyer la demande
      </Button>
    </form>
  )
}

export default function AgronomesPage() {
  const { user, isLoading } = useAuth()
  const [items, setItems] = useState<Agronome[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/haroo/agronomes')
      .then((r) => (r.ok ? r.json() : { agronomes: [] }))
      .then((d) => setItems(d.agronomes ?? []))
      .catch(() => setItems([]))
  }, [])

  return (
    <MarketingLayout>
      <section className="border-b border-border bg-card/50 py-10">
        <div className="mx-auto max-w-5xl px-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Agronomes certifiés
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Des agronomes validés par FaîtiereHub, porteurs d’une carte professionnelle. Décrivez
            votre besoin : l’agronome vous recontacte et prend la mission avec sa carte.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Vous préférez publier votre besoin pour tous les agronomes de votre zone ?{' '}
            <Link href="/marche?type=mission" className="font-medium text-primary hover:underline">
              Publier sur le Marché de proximité
            </Link>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8">
        {items === null ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun agronome certifié pour le moment. Publiez votre besoin sur le{' '}
            <Link href="/marche?type=mission" className="text-primary hover:underline">
              Marché de proximité
            </Link>
            .
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((a) => (
              <Card key={a.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start gap-3">
                    {a.photo_url ? (
                      <img
                        src={a.photo_url}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Award className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-semibold text-foreground">
                        {a.name}
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                          Certifié
                        </span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {[a.canton, a.prefecture, a.region].filter(Boolean).join(', ') || 'Togo'}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-3 w-3" />
                        {a.note_moyenne > 0
                          ? `${a.note_moyenne.toFixed(1)}/5 · ${a.nombre_missions} mission${a.nombre_missions > 1 ? 's' : ''}`
                          : 'Pas encore d’avis'}
                      </p>
                    </div>
                  </div>
                  {a.specialisations.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {a.specialisations.map((s) => (
                        <span
                          key={s}
                          className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {sent === a.id ? (
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-primary">
                      <CheckCircle2 className="h-4 w-4" /> Demande envoyée. Suivez-la dans{' '}
                      <Link href="/compte" className="underline">
                        Mon compte
                      </Link>
                      .
                    </p>
                  ) : isLoading ? null : !user ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
                      <p className="col-span-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" /> Compte requis : la demande porte votre nom
                        et votre téléphone.
                      </p>
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/auth/login?redirect=/agronomes">Se connecter</Link>
                      </Button>
                      <Button size="sm" asChild>
                        <Link href="/auth/signup?espace=haroo">Créer un compte</Link>
                      </Button>
                    </div>
                  ) : open === a.id ? (
                    <RequestForm
                      agronome={a}
                      onDone={() => {
                        setOpen(null)
                        setSent(a.id)
                      }}
                    />
                  ) : (
                    <Button className="mt-3 w-full" onClick={() => setOpen(a.id)}>
                      Demander une mission
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </MarketingLayout>
  )
}
