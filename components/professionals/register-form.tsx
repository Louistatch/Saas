'use client'

/**
 * Inscription d'un professionnel (agronome, technicien, conseiller) par un
 * Opérateur officier, pour une faîtière de SES mandats. Le compte est créé
 * côté serveur ; le titulaire reçoit un e-mail pour définir son mot de passe.
 * Le dossier arrive EN_ATTENTE et suit la validation normale.
 */

import { Spinner } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PROFESSIONS, PROFESSION_INFO, type Profession } from '@/lib/professionals/core'
import { UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

const EMPTY = {
  profession: 'agronome' as Profession,
  faitiereId: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
}

export function RegisterProfessionalForm({ onRegistered }: { onRegistered: () => void }) {
  const [open, setOpen] = useState(false)
  const [faitieres, setFaitieres] = useState<{ id: string; name: string }[] | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || faitieres !== null) return
    fetch('/api/professionals/register', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { faitieres: [] }))
      .then((d: { faitieres?: { id: string; name: string }[] }) => {
        const list = d.faitieres ?? []
        setFaitieres(list)
        if (list.length === 1) setForm((f) => ({ ...f, faitiereId: list[0].id }))
      })
      .catch(() => setFaitieres([]))
  }, [open, faitieres])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    setFields({})
    try {
      const res = await fetch('/api/professionals/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data: { success?: boolean; error?: string; fields?: Record<string, string> } = await res
        .json()
        .catch(() => ({}))
      if (res.ok && data.success) {
        setMessage({
          ok: true,
          text: `${form.firstName} ${form.lastName} est inscrit(e). Un e-mail lui permet de définir son mot de passe ; le dossier est à valider ci-dessous.`,
        })
        setForm((f) => ({ ...EMPTY, faitiereId: f.faitiereId }))
        onRegistered()
      } else {
        setFields(data.fields ?? {})
        setMessage({ ok: false, text: data.error ?? 'Inscription impossible' })
      }
    } catch {
      setMessage({ ok: false, text: 'Erreur réseau' })
    }
    setBusy(false)
  }

  if (!open) {
    return (
      <div className="mb-6">
        <Button variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" /> Inscrire un professionnel
        </Button>
      </div>
    )
  }

  const set =
    (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4 text-primary" /> Inscrire un professionnel
        </CardTitle>
      </CardHeader>
      <CardContent>
        {faitieres === null ? (
          <Spinner className="h-5 w-5" />
        ) : faitieres.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune faîtière de vos mandats ne vous permet d’inscrire des professionnels.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="reg-profession">Métier *</Label>
                <select
                  id="reg-profession"
                  className={SELECT_CLASS}
                  value={form.profession}
                  onChange={set('profession')}
                >
                  {PROFESSIONS.map((p) => (
                    <option key={p} value={p}>
                      {PROFESSION_INFO[p].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-faitiere">Faîtière *</Label>
                <select
                  id="reg-faitiere"
                  className={SELECT_CLASS}
                  value={form.faitiereId}
                  onChange={set('faitiereId')}
                  required
                >
                  <option value="">— Choisir —</option>
                  {faitieres.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              {(
                [
                  ['firstName', 'Prénom *', 'text'],
                  ['lastName', 'Nom *', 'text'],
                  ['phone', 'Téléphone *', 'tel'],
                  ['email', 'E-mail *', 'email'],
                ] as const
              ).map(([key, label, type]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`reg-${key}`}>{label}</Label>
                  <Input
                    id={`reg-${key}`}
                    type={type}
                    value={form[key]}
                    onChange={set(key)}
                    aria-invalid={!!fields[key]}
                    required
                  />
                  {fields[key] && <p className="text-xs text-destructive">{fields[key]}</p>}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="gap-1.5">
                {busy ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                Inscrire
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Fermer
              </Button>
            </div>
          </form>
        )}
        {message && (
          <output
            className={`mt-3 block text-sm ${message.ok ? 'text-primary' : 'text-destructive'}`}
          >
            {message.text}
          </output>
        )}
      </CardContent>
    </Card>
  )
}
