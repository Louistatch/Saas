'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Search, Edit2, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useDebounced } from '@/hooks/use-debounced'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { PaginationBar } from '@/components/shared/pagination'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { errorMessage } from '@/lib/utils/errors'
import { cooperativeSchema, flattenZodErrors } from '@/lib/validators/schemas'

const PAGE_SIZE = 20

interface CooperativeAdminRow {
  id: string
  name: string
  description: string | null
  primary_color: string | null
  created_at: string
  member_count: number
}

interface StatsView {
  id: string
  name: string
  description: string | null
  primary_color: string | null
  created_at: string
  member_count: number | null
}

const emptyForm = { name: '', description: '', primary_color: '#16a34a' }

export default function CooperativesAdminPage() {
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const { confirm, confirmNode } = useConfirm()

  const [cooperatives, setCooperatives] = useState<CooperativeAdminRow[]>([])
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 200)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const fetchCooperatives = useCallback(async () => {
    setIsLoading(true)
    // Prefer the cooperative_stats view (single-query, no N+1).
    const view = await supabase
      .from('cooperative_stats')
      .select('id, name, description, primary_color, created_at, member_count')
      .order('name')

    if (!view.error && view.data) {
      setCooperatives(
        (view.data as StatsView[]).map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          primary_color: c.primary_color,
          created_at: c.created_at,
          member_count: Number(c.member_count ?? 0),
        })),
      )
    } else {
      // Fallback: fetch cooperatives + counts separately.
      const { data, error } = await supabase
        .from('cooperatives')
        .select('id, name, description, primary_color, created_at')
        .order('name')
      if (error) {
        toast({ title: 'Error', description: errorMessage(error), variant: 'destructive' })
      } else if (data) {
        const withCounts = await Promise.all(
          data.map(async (c) => {
            const { count } = await supabase
              .from('members')
              .select('*', { count: 'exact', head: true })
              .eq('cooperative_id', c.id)
            return { ...c, member_count: count ?? 0 }
          }),
        )
        setCooperatives(withCounts as CooperativeAdminRow[])
      }
    }
    setIsLoading(false)
  }, [supabase, toast])

  useEffect(() => {
    fetchCooperatives()
  }, [fetchCooperatives])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim()
    if (!q) return cooperatives
    return cooperatives.filter((c) =>
      `${c.name} ${c.description ?? ''}`.toLowerCase().includes(q),
    )
  }, [cooperatives, debouncedSearch])

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  )

  const openAdd = () => {
    setEditId(null)
    setForm(emptyForm)
    setFormErrors({})
    setShowDialog(true)
  }
  const openEdit = (item: CooperativeAdminRow) => {
    setEditId(item.id)
    setForm({
      name: item.name,
      description: item.description ?? '',
      primary_color: item.primary_color ?? '#16a34a',
    })
    setFormErrors({})
    setShowDialog(true)
  }

  const handleSave = async () => {
    const parsed = cooperativeSchema.safeParse(form)
    if (!parsed.success) {
      setFormErrors(flattenZodErrors(parsed.error))
      return
    }
    setSaving(true)
    const payload = {
      name: parsed.data.name,
      description: parsed.data.description || null,
      primary_color: parsed.data.primary_color,
    }
    const { error } = editId
      ? await supabase.from('cooperatives').update(payload).eq('id', editId)
      : await supabase.from('cooperatives').insert(payload)
    setSaving(false)
    if (error) {
      toast({ title: 'Échec de la sauvegarde', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: editId ? 'Coopérative mise à jour' : 'Coopérative créée' })
    setShowDialog(false)
    fetchCooperatives()
  }

  const handleDelete = async (item: CooperativeAdminRow) => {
    const ok = await confirm({
      title: `Supprimer "${item.name}" ?`,
      description:
        'Cela supprime définitivement la coopérative ainsi que tous les membres, exploitations, cartes et intégrations.',
      destructive: true,
      confirmLabel: 'Supprimer la coopérative',
    })
    if (!ok) return
    const { error } = await supabase.from('cooperatives').delete().eq('id', item.id)
    if (error) {
      toast({ title: 'Échec de la suppression', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Coopérative supprimée' })
    fetchCooperatives()
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Coopératives"
        description="Gérer toutes les coopératives agricoles enregistrées"
      />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher des coopératives…"
            className="pl-10 border-border bg-background text-foreground"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Rechercher des coopératives"
          />
        </div>
        <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Ajouter une coopérative
        </Button>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Toutes les coopératives</CardTitle>
          <CardDescription>Liste complète des coopératives enregistrées ({filtered.length})</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingBlock />
          ) : filtered.length === 0 ? (
            <EmptyState title={search ? 'Aucune coopérative trouvée' : 'Aucune coopérative pour le moment'} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Nom</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Description</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Membres</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Couleur</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Créé le</th>
                      <th className="text-right py-3 px-4 font-semibold text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((coop) => (
                      <tr key={coop.id} className="border-b border-border hover:bg-accent/5 transition-colors">
                        <td className="py-3 px-4 text-foreground font-medium">{coop.name}</td>
                        <td className="py-3 px-4 text-muted-foreground text-sm max-w-xs truncate">
                          {coop.description || '—'}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{coop.member_count}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-5 h-5 rounded-full border border-border"
                              style={{ backgroundColor: coop.primary_color || '#16a34a' }}
                              aria-hidden
                            />
                            <span className="text-xs text-muted-foreground font-mono">
                              {coop.primary_color || '#16a34a'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-sm">
                          {new Date(coop.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-border"
                              onClick={() => openEdit(coop)}
                              aria-label={`Edit ${coop.name}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-border text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(coop)}
                              aria-label={`Delete ${coop.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Modifier la coopérative' : 'Ajouter une coopérative'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nom <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Coopérative du Nord"
                aria-invalid={!!formErrors.name}
              />
              {formErrors.name ? <p className="text-xs text-destructive">{formErrors.name}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description…"
              />
            </div>
            <div className="space-y-2">
              <Label>Couleur principale</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))}
                  className="h-10 w-16 border border-border rounded-md cursor-pointer"
                  aria-label="Couleur principale"
                />
                <Input
                  value={form.primary_color}
                  onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))}
                  placeholder="#16a34a"
                  className="font-mono"
                  aria-invalid={!!formErrors.primary_color}
                />
              </div>
              {formErrors.primary_color ? (
                <p className="text-xs text-destructive">{formErrors.primary_color}</p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
              Annuler
            </Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4 mr-2" /> : null}
              {editId ? 'Enregistrer' : 'Ajouter la coopérative'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmNode}
    </div>
  )
}
