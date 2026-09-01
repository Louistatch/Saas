'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Mail, Phone, MapPin, Network, CheckCircle2 } from 'lucide-react'

const CATEGORIES = [
  { value: 'cooperative', label: 'Je représente une coopérative / faîtière' },
  { value: 'ouvrier', label: "Je suis ouvrier agricole (Haroo)" },
  { value: 'acheteur', label: 'Je suis acheteur (Haroo)' },
  { value: 'agronome', label: 'Je suis agronome (Haroo)' },
  { value: 'autre', label: 'Autre demande' },
] as const

type Category = (typeof CATEGORIES)[number]['value']

interface FormState {
  name: string
  email: string
  category: Category
  subject: string
  message: string
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  category: 'cooperative',
  subject: '',
  message: '',
}

export function ContactForm() {
  const { toast } = useToast()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({
          title: 'Erreur',
          description: data.error || data.issues?.join(', ') || "Impossible d'envoyer le message",
          variant: 'destructive',
        })
        return
      }
      setSent(true)
      setForm(EMPTY_FORM)
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de contacter le serveur', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Contactez-nous
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Une question, une demande de démonstration ou besoin d&apos;aide ?
            Notre équipe est à votre écoute.
          </p>
        </div>
      </section>

      {/* Contact Form + Info */}
      <section className="pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2">
            {/* Form */}
            <div className="rounded-xl border border-border bg-background p-8">
              {sent ? (
                <div className="flex flex-col items-center text-center py-12 gap-4">
                  <CheckCircle2 className="h-12 w-12 text-primary" />
                  <h2 className="text-xl font-bold text-foreground">Message envoyé</h2>
                  <p className="text-muted-foreground max-w-sm">
                    Merci, nous avons bien reçu votre message. Notre équipe vous répondra
                    sous 24 à 48h ouvrées.
                  </p>
                  <Button variant="outline" onClick={() => setSent(false)}>
                    Envoyer un autre message
                  </Button>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-foreground mb-6">Envoyez-nous un message</h2>
                  <form className="space-y-6" onSubmit={handleSubmit}>
                    <div className="space-y-2">
                      <label htmlFor="category" className="text-sm font-medium text-foreground">
                        Vous êtes
                      </label>
                      <Select
                        value={form.category}
                        onValueChange={(v: Category) => setForm((f) => ({ ...f, category: v }))}
                      >
                        <SelectTrigger id="category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label htmlFor="name" className="text-sm font-medium text-foreground">
                          Nom complet
                        </label>
                        <input
                          id="name"
                          type="text"
                          required
                          minLength={2}
                          placeholder="Votre nom"
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="email" className="text-sm font-medium text-foreground">
                          Email
                        </label>
                        <input
                          id="email"
                          type="email"
                          required
                          placeholder="votre@email.com"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="subject" className="text-sm font-medium text-foreground">
                        Sujet
                      </label>
                      <input
                        id="subject"
                        type="text"
                        required
                        minLength={2}
                        placeholder="Objet de votre message"
                        value={form.subject}
                        onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                        className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="message" className="text-sm font-medium text-foreground">
                        Message
                      </label>
                      <textarea
                        id="message"
                        rows={5}
                        required
                        minLength={10}
                        placeholder="Décrivez votre demande..."
                        value={form.message}
                        onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                        className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                      />
                    </div>
                    <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                      {submitting ? 'Envoi en cours...' : 'Envoyer le message'}
                    </Button>
                  </form>
                </>
              )}
            </div>

            {/* Contact Info */}
            <div className="space-y-8">
              <div className="rounded-xl border border-border bg-background p-8 space-y-6">
                <h2 className="text-2xl font-bold text-foreground">Nos coordonnées</h2>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Email</p>
                      <p className="text-sm text-muted-foreground">support@faitierehub.com</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Phone className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Téléphone</p>
                      <p className="text-sm text-muted-foreground">+228 92 54 88 38</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <MapPin className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Adresse</p>
                      <p className="text-sm text-muted-foreground">Lomé, Togo</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Haroo routing note — replaces the fake map placeholder */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-8 space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                  <Network className="h-5 w-5 text-amber-700" />
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  Ouvrier, acheteur ou agronome ?
                </h2>
                <p className="text-sm text-muted-foreground">
                  Pas besoin de nous écrire pour créer votre profil — inscrivez-vous
                  directement sur Haroo, c&apos;est gratuit et immédiat.
                </p>
                <a
                  href="/auth/signup/haroo"
                  className="inline-block text-sm font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2"
                >
                  Créer mon profil Haroo →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
