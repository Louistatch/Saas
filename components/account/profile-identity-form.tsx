'use client'

/**
 * Formulaire UNIQUE du profil commun (prénom, nom). Utilisé partout où le
 * profil se modifie — /compte et les paramètres du tableau de bord — pour qu'il
 * n'existe jamais deux formulaires d'identité. L'extension Haroo recopie le nom
 * depuis profiles (déclencheur base) : elle ne le redemande pas.
 */

import { useAuth } from '@/app/context/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ProfileIdentityForm({ onSaved }: { onSaved?: () => void }) {
  const { user, refreshProfile } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    setFirstName(user?.firstName ?? '')
    setLastName(user?.lastName ?? '')
  }, [user?.firstName, user?.lastName])

  if (!user) return null
  const dirty =
    firstName.trim() !== (user.firstName ?? '') || lastName.trim() !== (user.lastName ?? '')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setStatus({ ok: false, text: 'Prénom et nom : 2 caractères minimum.' })
      return
    }
    setSaving(true)
    setStatus(null)
    const { error } = await createClient()
      .from('profiles')
      .update({ first_name: firstName.trim(), last_name: lastName.trim() })
      .eq('id', user.id)
    setSaving(false)
    if (error) {
      setStatus({ ok: false, text: 'Enregistrement impossible. Réessayez.' })
      return
    }
    await refreshProfile()
    setStatus({ ok: true, text: 'Profil enregistré.' })
    onSaved?.()
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-first-name">Prénom</Label>
          <Input
            id="profile-first-name"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-last-name">Nom</Label>
          <Input
            id="profile-last-name"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={80}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-email">E-mail</Label>
        <Input id="profile-email" value={user.email} disabled className="opacity-70" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving || !dirty} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Enregistrer
        </Button>
        {status ? (
          <output
            className={`flex items-center gap-1.5 text-sm ${status.ok ? 'text-primary' : 'text-destructive'}`}
          >
            {status.ok ? <CheckCircle2 className="h-4 w-4" /> : null}
            {status.text}
          </output>
        ) : null}
      </div>
    </form>
  )
}
