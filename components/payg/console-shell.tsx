'use client'

/** En-tête commun des consoles PAYG : logo, choix de l'opérateur, retour, déconnexion. */

import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { performLogout } from '@/lib/auth/logout'
import { LogOut } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { PaygMe } from './types'

const ROLE_LABEL = { owner: 'Responsable', manager: 'Gérant', agent: 'Agent' } as const

export function ConsoleHeader({
  me,
  onSwitch,
}: {
  me: PaygMe | null
  onSwitch: (partnerId: string) => void
}) {
  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <Link href="/operator" aria-label="Espace opérateur">
        <Logo size="md" />
      </Link>
      <div className="flex items-center gap-1">
        {me && me.memberships.length > 1 && me.current && (
          <Select value={me.current.partner_id} onValueChange={onSwitch}>
            <SelectTrigger className="h-9 max-w-[11rem]" aria-label="Opérateur">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {me.memberships.map((m) => (
                <SelectItem key={m.partner_id} value={m.partner_id}>
                  {m.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="ghost" size="sm" onClick={() => performLogout()}>
          <LogOut className="h-4 w-4 sm:mr-1.5" />
          <span className="sr-only sm:not-sr-only">Déconnexion</span>
        </Button>
      </div>
    </header>
  )
}

export function roleLabel(role: keyof typeof ROLE_LABEL) {
  return ROLE_LABEL[role]
}

export function Notice({
  children,
  tone = 'info',
}: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        tone === 'warn'
          ? 'border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'
          : 'border-border bg-muted/50 text-foreground'
      }`}
    >
      {children}
    </div>
  )
}

/** Aucun opérateur rattaché, ou lecture impossible : on dit quoi faire. */
export function NoOperator({ error }: { error?: string }) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-12 text-center">
      <h1 className="text-xl font-semibold text-foreground">
        {error ? 'Console indisponible' : 'Aucun compte opérateur'}
      </h1>
      <p className="text-sm text-muted-foreground">
        {error ??
          'Ce compte n’est rattaché à aucun opérateur. Déposez une candidature, ou ouvrez le lien d’invitation envoyé par votre institution.'}
      </p>
      <Button asChild className="min-h-11">
        <Link href="/operator">Aller à l’espace opérateur</Link>
      </Button>
    </div>
  )
}
