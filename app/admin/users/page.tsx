'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Edit2, AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useDebounced } from '@/hooks/use-debounced'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { PaginationBar } from '@/components/shared/pagination'
import { RoleBadge } from '@/components/shared/status-badge'
import { errorMessage } from '@/lib/utils/errors'
import {
  ASSIGNABLE_ROLES,
  ASSIGNABLE_ROLE_LABELS,
  HAROO_TYPES,
  HAROO_TYPE_LABELS,
  type HarooType,
  type Profile,
  type UserRole,
} from '@/types/domain'
import { useResetPageOnChange } from '@/hooks/use-reset-page'

const PAGE_SIZE = 20

export default function UsersAdminPage() {
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const [users, setUsers] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 200)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [editUser, setEditUser] = useState<Profile | null>(null)
  const [cooperatives, setCooperatives] = useState<{ id: string; name: string }[]>([])
  const [editForm, setEditForm] = useState<{
    role: UserRole
    cooperative_id: string
    haroo_type: HarooType | ''
  }>({
    role: 'member',
    cooperative_id: '',
    haroo_type: '',
  })
  const [history, setHistory] = useState<
    { created_at: string; details: { before?: Record<string, string | null>; after?: Record<string, string | null> } }[] | null
  >(null)
  const [saving, setSaving] = useState(false)

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, role, haroo_type, cooperative_id, created_at, cooperative:cooperatives(name)')
      .order('created_at', { ascending: false })
    if (error) {
      toast({ title: 'Erreur', description: errorMessage(error), variant: 'destructive' })
    } else {
      setUsers((data ?? []) as unknown as Profile[])
    }
    setIsLoading(false)
  }, [supabase, toast])

  const fetchCooperatives = useCallback(async () => {
    const { data } = await supabase.from('cooperatives').select('id, name').order('name')
    setCooperatives(data ?? [])
  }, [supabase])

  useEffect(() => {
    fetchUsers()
    fetchCooperatives()
  }, [fetchUsers, fetchCooperatives])

  useResetPageOnChange(setPage, [debouncedSearch])

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim()
    if (!q) return users
    return users.filter((u) =>
      `${u.first_name ?? ''} ${u.last_name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q),
    )
  }, [users, debouncedSearch])

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  )

  const openEdit = (user: Profile) => {
    setEditUser(user)
    setEditForm({
      // Rôles dépréciés (guest, ouvrier…) : proposer « Aucune organisation ».
      role: (ASSIGNABLE_ROLES as readonly UserRole[]).includes(user.role) ? user.role : 'none',
      cooperative_id: user.cooperative_id ?? '',
      haroo_type: user.haroo_type ?? '',
    })
    setHistory(null)
    fetch(`/api/admin/users/${user.id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { history: [] }))
      .then((d) => setHistory(d.history ?? []))
      .catch(() => setHistory([]))
  }

  const handleSave = async () => {
    if (!editUser) return
    setSaving(true)
    const res = await fetch(`/api/admin/users/${editUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: editForm.role,
        cooperative_id: editForm.cooperative_id || null,
        haroo_type: editForm.haroo_type || null,
      }),
    }).catch(() => null)
    setSaving(false)
    const data: { error?: string } = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) {
      toast({
        title: 'Modification refusée',
        description: data.error ?? 'Connexion interrompue : réessayez.',
        variant: 'destructive',
      })
      return
    }
    toast({
      title: 'Rôles mis à jour',
      description: `${editUser.email} : effet à sa prochaine connexion ou actualisation.`,
    })
    setEditUser(null)
    fetchUsers()
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Utilisateurs" description="Gérer les utilisateurs de la plateforme et leurs permissions" />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher des utilisateurs…"
          className="pl-10 border-border bg-background text-foreground"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Rechercher des utilisateurs"
        />
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Liste des utilisateurs</CardTitle>
          <CardDescription>
            Tous les utilisateurs enregistrés sur les coopératives ({filtered.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingBlock />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? 'Aucun utilisateur ne correspond à votre recherche' : 'Aucun utilisateur pour le moment'}
              description={search ? 'Essayez un autre terme de recherche' : 'Les utilisateurs apparaîtront ici une fois inscrits.'}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Nom</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Email</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Coopérative</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Rôle</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Inscrit le</th>
                      <th className="text-right py-3 px-4 font-semibold text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((user) => (
                      <tr key={user.id} className="border-b border-border hover:bg-accent/5 transition-colors">
                        <td className="py-3 px-4 text-foreground font-medium">
                          {user.first_name || user.last_name
                            ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-sm">{user.email}</td>
                        <td className="py-3 px-4 text-muted-foreground text-sm">
                          {user.cooperative?.name ?? '—'}
                        </td>
                        <td className="py-3 px-4">
                          <RoleBadge role={user.role} />
                          {user.haroo_type && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {HAROO_TYPE_LABELS[user.haroo_type]}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-sm">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-border"
                            onClick={() => openEdit(user)}
                            aria-label={`Edit ${user.email}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={page}
                pageSize={PAGE_SIZE}
                total={filtered.length}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rôles de {editUser?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Rôle</Label>
              <select
                className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                value={editForm.role}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, role: e.target.value as UserRole }))
                }
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ASSIGNABLE_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Coopérative</Label>
              <select
                className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                value={editForm.cooperative_id}
                onChange={(e) => setEditForm((f) => ({ ...f, cooperative_id: e.target.value }))}
              >
                <option value="">Aucune (Super Admin / Invité)</option>
                {cooperatives.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Profil Haroo</Label>
              <select
                className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                value={editForm.haroo_type}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, haroo_type: e.target.value as HarooType | '' }))
                }
              >
                <option value="">Aucun</option>
                {HAROO_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {HAROO_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Indépendant du rôle d’organisation. Sa fiche est créée si besoin ; un agronome reste
                à valider dans « Dossiers à valider ».
              </p>
            </div>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-800">
                Changer le rôle ou la coopérative d&apos;un utilisateur affectera son accès immédiatement.
              </p>
            </div>
          </div>
          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-sm font-medium text-foreground">Historique des rôles</p>
            {history === null ? (
              <p className="text-xs text-muted-foreground">Chargement…</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun changement enregistré.</p>
            ) : (
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {history.map((h) => (
                  <li key={h.created_at}>
                    {new Date(h.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} :{' '}
                    {h.details.before?.role ?? '—'} → {h.details.after?.role ?? '—'}
                    {h.details.before?.haroo_type !== h.details.after?.haroo_type &&
                      `, Haroo ${h.details.before?.haroo_type ?? 'aucun'} → ${h.details.after?.haroo_type ?? 'aucun'}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} disabled={saving}>
              Annuler
            </Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4 mr-2" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
