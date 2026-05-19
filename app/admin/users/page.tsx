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
import { profileUpdateSchema } from '@/lib/validators/schemas'
import { USER_ROLES, type Profile, type UserRole } from '@/types/domain'

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
  const [editForm, setEditForm] = useState<{ role: UserRole; cooperative_id: string }>({
    role: 'member',
    cooperative_id: '',
  })
  const [saving, setSaving] = useState(false)

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, role, cooperative_id, created_at, cooperative:cooperatives(name)')
      .order('created_at', { ascending: false })
    if (error) {
      toast({ title: 'Error', description: errorMessage(error), variant: 'destructive' })
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

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim()
    if (!q) return users
    return users.filter((u) =>
      `${u.first_name ?? ''} ${u.last_name ?? ''} ${u.email}`.toLowerCase().includes(q),
    )
  }, [users, debouncedSearch])

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  )

  const openEdit = (user: Profile) => {
    setEditUser(user)
    setEditForm({
      role: user.role,
      cooperative_id: user.cooperative_id ?? '',
    })
  }

  const handleSave = async () => {
    if (!editUser) return
    const parsed = profileUpdateSchema.safeParse({
      role: editForm.role,
      cooperative_id: editForm.cooperative_id || null,
    })
    if (!parsed.success) {
      toast({
        title: 'Invalid input',
        description: parsed.error.issues[0]?.message,
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        role: parsed.data.role,
        cooperative_id: parsed.data.cooperative_id,
      })
      .eq('id', editUser.id)
    setSaving(false)
    if (error) {
      toast({ title: 'Update failed', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: 'User updated', description: editUser.email })
    setEditUser(null)
    fetchUsers()
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Users" description="Manage platform users and their permissions" />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search users…"
          className="pl-10 border-border bg-background text-foreground"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users"
        />
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Users List</CardTitle>
          <CardDescription>
            All registered users across cooperatives ({filtered.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingBlock />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? 'No users match your search' : 'No users yet'}
              description={search ? 'Try a different search term' : 'Users appear here once they sign up.'}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Email</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Cooperative</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Role</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Joined</th>
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
            <DialogTitle>Edit User — {editUser?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Role</Label>
              <select
                className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                value={editForm.role}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, role: e.target.value as UserRole }))
                }
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Cooperative</Label>
              <select
                className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                value={editForm.cooperative_id}
                onChange={(e) => setEditForm((f) => ({ ...f, cooperative_id: e.target.value }))}
              >
                <option value="">None (Super Admin / Guest)</option>
                {cooperatives.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-800">
                Changing a user&apos;s role or cooperative will affect their access immediately.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} disabled={saving}>
              Cancel
            </Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4 mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
