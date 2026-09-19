'use client'

/**
 * Comptes de démo — l'admin « joue chaque rôle » pour voir le site comme un
 * membre, un compte Haroo, ou un candidat Opérateur sans organisation.
 * Jamais un vrai compte : ce sont des profils synthétiques (is_demo=true),
 * créés une fois via « Initialiser », puis rejoints par lien de connexion à
 * usage unique.
 *
 * Le lien n'est PAS ouvert automatiquement : `createBrowserClient`
 * (@supabase/ssr) stocke la session dans les cookies, partagés par tous les
 * onglets d'une même origine. Un nouvel onglet écraserait donc la session
 * admin, éjecterait l'onglet admin vers /auth/login, et les deux clients se
 * disputeraient le verrou de rafraîchissement du jeton (navigator.locks) —
 * d'où un « Chargement… » infini, observé en production. Une fenêtre privée
 * a son propre espace de cookies : c'est le seul isolement disponible sans
 * passer par un sous-domaine dédié.
 */

import { LoadingBlock } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
  const [link, setLink] = useState<{ key: DemoRoleKey; url: string } | null>(null)

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

  const generateLink = async (key: DemoRoleKey) => {
    setOpeningKey(key)
    try {
      const res = await fetch(`/api/admin/demo-accounts/${key}/sign-in-link`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.url) {
        toast({ title: 'Lien impossible', description: body.error ?? '—', variant: 'destructive' })
        return
      }
      setLink({ key, url: body.url })
      try {
        await navigator.clipboard.writeText(body.url)
        toast({
          title: 'Lien copié',
          description: 'Collez-le dans une fenêtre de navigation privée.',
        })
      } catch {
        // Presse-papiers refusé (permission, contexte non sécurisé) : le lien
        // reste affiché à l'écran, sélectionnable à la main.
      }
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
        description="Prévisualisez le site comme chaque rôle, sans jamais toucher un compte réel. Le lien obtenu est à ouvrir dans une fenêtre de navigation privée : la session est stockée dans les cookies du navigateur, donc un onglet normal écraserait votre session administrateur."
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
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {role.exists ? 'Compte initialisé' : 'Pas encore initialisé'}
                  </span>
                  <Button
                    size="sm"
                    variant={role.exists ? 'default' : 'outline'}
                    disabled={!role.exists || openingKey === role.key}
                    onClick={() => generateLink(role.key)}
                  >
                    {openingKey === role.key ? '...' : 'Obtenir le lien'}
                  </Button>
                </div>

                {link?.key === role.key && (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">
                      Ouvrez ce lien dans une <strong>fenêtre de navigation privée</strong>. Dans
                      une fenêtre normale, il remplacerait votre session administrateur — les deux
                      comptes partagent les mêmes cookies.
                    </p>
                    <Input readOnly value={link.url} className="font-mono text-xs" />
                  </div>
                )}
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
