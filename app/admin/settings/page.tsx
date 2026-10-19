'use client'

/**
 * Paramètres de la plateforme (Admin 5.0). Seuls les réglages réellement lus par le site sont
 * modifiables ; l'état de sécurité est décrit tel qu'il est, sans interrupteur sans effet.
 */

import { CheckCircle2, CircleSlash } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Settings {
  partner_exam_passing_score: number
  platform_name: string
  support_email: string
}

const SECURITY: { label: string; on: boolean; text: string }[] = [
  {
    label: 'HTTPS obligatoire',
    on: true,
    text: 'Imposé par l’hébergement Vercel sur tout le site.',
  },
  {
    label: 'Limitation de débit',
    on: true,
    text: 'Active sur les API publiques, partagée entre serveurs grâce à Redis.',
  },
  {
    label: 'Accès admin vérifié côté serveur',
    on: true,
    text: 'Le rôle est relu dans la base avant chaque page d’administration.',
  },
  {
    label: 'Double authentification des admins',
    on: false,
    text: 'Pas encore disponible : à activer dans Supabase Auth (authentification multifacteur).',
  },
  {
    label: 'Restriction de l’administration par adresse IP',
    on: false,
    text: 'Pas disponible dans le site : possible avec le pare-feu de Vercel.',
  },
  {
    label: 'Mode maintenance',
    on: false,
    text: 'Pas disponible : l’ancien interrupteur était enregistré mais sans effet, il a été retiré.',
  },
]

const input =
  'w-full rounded-md border border-border bg-background p-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2'

export default function AdminSettingsPage() {
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState<'exam' | 'contact' | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/settings', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { settings: {} }))
      .then(({ settings }: { settings: Partial<Settings> }) =>
        setForm({
          partner_exam_passing_score: Number(settings.partner_exam_passing_score ?? 70),
          platform_name: String(settings.platform_name ?? 'FaîtiereHub'),
          support_email: String(settings.support_email ?? ''),
        }),
      )
      .catch(() => setNotice({ ok: false, text: 'Les paramètres n’ont pas pu se charger.' }))
  }, [])

  async function save(section: 'exam' | 'contact', values: Partial<Settings>) {
    setSaving(section)
    setNotice(null)
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    }).catch(() => null)
    const data: { error?: string } = res ? await res.json().catch(() => ({})) : {}
    setSaving(null)
    setNotice(
      res?.ok
        ? { ok: true, text: 'Paramètres enregistrés.' }
        : { ok: false, text: data.error ?? 'Connexion interrompue : réessayez.' },
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Chaque modification est enregistrée dans le journal d’audit.
        </p>
      </header>
      <output aria-live="polite" className="block">
        {notice && (
          <span className={`text-sm ${notice.ok ? 'text-primary' : 'text-destructive'}`}>
            {notice.text}
          </span>
        )}
      </output>

      <section aria-labelledby="exam-title" className="space-y-3">
        <h2 id="exam-title" className="text-lg font-semibold text-foreground">
          Certification des opérateurs
        </h2>
        <label className="block max-w-xs space-y-1 text-sm font-medium">
          Note de réussite à l’examen (sur 100)
          <input
            type="number"
            min={0}
            max={100}
            className={input}
            value={form?.partner_exam_passing_score ?? ''}
            disabled={!form}
            onChange={(e) =>
              setForm((f) => (f ? { ...f, partner_exam_passing_score: Number(e.target.value) } : f))
            }
          />
        </label>
        <p className="text-sm text-muted-foreground">
          Appliquée à chaque nouvelle correction d’examen ; les résultats déjà enregistrés ne
          changent pas.
        </p>
        <button
          type="button"
          disabled={!form || saving !== null}
          onClick={() =>
            form &&
            void save('exam', { partner_exam_passing_score: form.partner_exam_passing_score })
          }
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving === 'exam' ? 'Enregistrement…' : 'Enregistrer la note'}
        </button>
      </section>

      <section aria-labelledby="contact-title" className="space-y-3">
        <h2 id="contact-title" className="text-lg font-semibold text-foreground">
          Coordonnées de la plateforme
        </h2>
        <p className="text-sm text-muted-foreground">
          Conservées pour référence : le site ne les affiche pas encore.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            Nom de la plateforme
            <input
              className={input}
              value={form?.platform_name ?? ''}
              disabled={!form}
              onChange={(e) => setForm((f) => (f ? { ...f, platform_name: e.target.value } : f))}
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            E-mail de support
            <input
              type="email"
              className={input}
              value={form?.support_email ?? ''}
              disabled={!form}
              onChange={(e) => setForm((f) => (f ? { ...f, support_email: e.target.value } : f))}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!form || saving !== null}
          onClick={() =>
            form &&
            void save('contact', {
              platform_name: form.platform_name,
              support_email: form.support_email,
            })
          }
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving === 'contact' ? 'Enregistrement…' : 'Enregistrer les coordonnées'}
        </button>
      </section>

      <section aria-labelledby="security-title" className="space-y-3">
        <h2 id="security-title" className="text-lg font-semibold text-foreground">
          Sécurité : état réel
        </h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {SECURITY.map((item) => (
            <li key={item.label} className="flex gap-3 px-4 py-3">
              {item.on ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              ) : (
                <CircleSlash
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                />
              )}
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {item.label}
                  <span className="sr-only">{item.on ? ' : actif' : ' : non disponible'}</span>
                </span>
                <span className="block text-sm text-muted-foreground">{item.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ops-title" className="space-y-2">
        <h2 id="ops-title" className="text-lg font-semibold text-foreground">
          Sauvegardes et e-mails
        </h2>
        <p className="text-sm text-muted-foreground">
          Les sauvegardes de la base se règlent dans Supabase (Database, puis Backups). Les e-mails
          de compte (confirmation, mot de passe) partent par Supabase Auth ; leurs modèles se
          modifient dans Authentication, puis Email Templates. Les opérations destructives (purge,
          restauration, migrations) se font depuis la console Supabase, jamais d’ici.
        </p>
      </section>
    </div>
  )
}
