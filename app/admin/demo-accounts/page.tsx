'use client'

/**
 * Comptes de démo — l'admin « joue chaque rôle » pour voir le site comme un
 * membre, un compte Haroo, ou un candidat Opérateur sans organisation.
 * Jamais un vrai compte : ce sont des profils synthétiques (is_demo=true),
 * créés une fois via « Initialiser », puis rejoints par lien de connexion à
 * usage unique (ouvre un nouvel onglet — la session admin n'est pas touchée).
 */

import { LoadingBlock } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import type { DemoRoleKey } from '@/lib/admin/demo-accounts'
import { Users2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface RoleStatus {
  key: DemoRoleKey
  email: string
  label: string
  description: string
  exists: boolean
}

export default function DemoAccountsPage() {
  const { toast } = useToast()
  const [roles, setRoles] = useState<RoleStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [openingKey, setOpeningKey] = useState<DemoRoleKey | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    const res = await fetch('/api/admin/demo-accounts')
    const data = await res.json().catch(() => ({}))
    setRoles(data.roles ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const seed = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/admin/demo-accounts/seed', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast({
          title: 'Initialisation partielle',
          description: body.error,
          variant: 'destructive',
        })
      } else {
        toast({ title: 'Comptes de démo initialisés' })
      }
      await load()
    } catch {
      toast({ title: 'Erreur de connexion', variant: 'destructive' })
    } finally {
      setSeeding(false)
    }
  }

  const openAs = async (key: DemoRoleKey) => {
    setOpeningKey(key)
    try {
      const res = await fetch(`/api/admin/demo-accounts/${key}/sign-in-link`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.url) {
        toast({ title: 'Lien impossible', description: body.error ?? '—', variant: 'destructive' })
        return
      }
      window.open(body.url, '_blank', 'noopener,noreferrer')
    } catch {
      toast({ title: 'Erreur de connexion', variant: 'destructive' })
    } finally {
      setOpeningKey(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comptes de démo"
        description="Prévisualisez le site comme chaque rôle sans jamais toucher un compte réel. Le lien de connexion ouvre un nouvel onglet — votre session admin reste inchangée."
      />

      {isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {roles.map((role) => (
            <Card key={role.key}>
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Users2 className="h-4 w-4 text-muted-foreground" />
                  {role.label}
                </CardTitle>
                <CardDescription>{role.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  {role.exists ? 'Compte initialisé' : 'Pas encore initialisé'}
                </span>
                <Button
                  size="sm"
                  variant={role.exists ? 'default' : 'outline'}
                  disabled={!role.exists || openingKey === role.key}
                  onClick={() => openAs(role.key)}
                >
                  {openingKey === role.key ? '...' : 'Voir en tant que'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-6 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Crée les comptes de démo manquants (sans effet sur ceux déjà initialisés).
          </p>
          <Button onClick={seed} disabled={seeding}>
            {seeding ? 'Initialisation…' : 'Initialiser les comptes de démo'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
