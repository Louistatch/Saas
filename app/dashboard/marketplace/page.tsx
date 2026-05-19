'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Search, Edit2, Trash2, Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useToast } from '@/hooks/use-toast'
import { useDebounced } from '@/hooks/use-debounced'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PublishedBadge } from '@/components/shared/status-badge'
import { PageHeader } from '@/components/shared/page-header'
import { PaginationBar } from '@/components/shared/pagination'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { errorMessage } from '@/lib/utils/errors'
import { exploitationSchema, flattenZodErrors } from '@/lib/validators/schemas'
import { PRODUCT_CATEGORIES, type Exploitation } from '@/types/domain'

const PAGE_SIZE = 20

type FormState = {
  name: string
  description: string
  category: string
  producer: string
  unit: string
  price: string
  active: boolean
}

const emptyForm: FormState = {
  name: '',
  description: '',
  category: '',
  producer: '',
  unit: 'kg',
  price: '',
  active: true,
}

export default function MarketplacePage() {
  const { currentCooperative } = useCooperative()
  const { toast } = useToast()
  const { confirm, confirmNode } = useConfirm()
  const supabase = useMemo(() => createClient(), [])

  const [exploitations, setExploitations] = useState<Exploitation[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounced(searchTerm, 200)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editItem, setEditItem] = useState<Exploitation | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const fetchExploitations = useCallback(async () => {
    if (!currentCooperative) return
    setIsLoading(true)
    const { data, error } = await supabase
      .from('exploitations')
      .select('*')
      .eq('cooperative_id', currentCooperative.id)
      .order('name')
    if (error) {
      toast({ title: 'Error', description: errorMessage(error), variant: 'destructive' })
    } else {
      setExploitations((data ?? []) as Exploitation[])
    }
    setIsLoading(false)
  }, [currentCooperative, supabase, toast])

  useEffect(() => {
    fetchExploitations()
  }, [fetchExploitations])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim()
    if (!q) return exploitations
    return exploitations.filter((e) =>
      `${e.name} ${e.producer ?? ''} ${e.category ?? ''}`.toLowerCase().includes(q),
    )
  }, [exploitations, debouncedSearch])

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  )

  const openAdd = () => {
    setEditItem(null)
    setForm(emptyForm)
    setFormErrors({})
    setShowDialog(true)
  }

  const openEdit = (item: Exploitation) => {
    setEditItem(item)
    setForm({
      name: item.name,
      description: item.description ?? '',
      category: item.category ?? '',
      producer: item.producer ?? '',
      unit: item.unit ?? 'kg',
      price: item.price?.toString() ?? '',
      active: item.active,
    })
    setFormErrors({})
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!currentCooperative) return
    const parsed = exploitationSchema.safeParse(form)
    if (!parsed.success) {
      setFormErrors(flattenZodErrors(parsed.error))
      return
    }
    setFormErrors({})
    setSaving(true)
    const payload = {
      cooperative_id: currentCooperative.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      category: parsed.data.category || null,
      price: parsed.data.price ? parseFloat(parsed.data.price) : null,
      unit: parsed.data.unit || null,
      producer: parsed.data.producer || null,
      active: parsed.data.active,
    }
    const { error } = editItem
      ? await supabase.from('exploitations').update(payload).eq('id', editItem.id)
      : await supabase.from('exploitations').insert(payload)
    setSaving(false)
    if (error) {
      toast({ title: 'Save failed', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({
      title: editItem ? 'Exploitation updated' : 'Exploitation added',
      description: parsed.data.name,
    })
    setShowDialog(false)
    fetchExploitations()
  }

  const handleDelete = async (item: Exploitation) => {
    const ok = await confirm({
      title: 'Delete exploitation',
      description: `This will permanently remove "${item.name}" from the marketplace.`,
      destructive: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    const { error } = await supabase.from('exploitations').delete().eq('id', item.id)
    if (error) {
      toast({ title: 'Delete failed', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Exploitation deleted' })
    fetchExploitations()
  }

  const toggleActive = async (item: Exploitation) => {
    const { error } = await supabase
      .from('exploitations')
      .update({ active: !item.active })
      .eq('id', item.id)
    if (error) {
      toast({ title: 'Update failed', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: item.active ? 'Unpublished' : 'Published', description: item.name })
    fetchExploitations()
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Marketplace"
        description="Manage exploitations and products available to your members"
      />

      <Tabs defaultValue="exploitations" className="w-full">
        <TabsList className="grid w-full max-w-sm grid-cols-2 border-b border-border bg-transparent">
          <TabsTrigger value="exploitations" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Exploitations ({exploitations.length})
          </TabsTrigger>
          <TabsTrigger value="categories" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Categories
          </TabsTrigger>
        </TabsList>

        <TabsContent value="exploitations" className="space-y-6 mt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search exploitations…"
                className="pl-10 border-border bg-background text-foreground"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search exploitations"
              />
            </div>
            <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Add Exploitation
            </Button>
          </div>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Exploitations</CardTitle>
              <CardDescription>
                Products and services from {currentCooperative?.name ?? 'your cooperative'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <LoadingBlock />
              ) : filtered.length === 0 ? (
                <EmptyState
                  title={searchTerm ? 'No results found' : 'No exploitations yet'}
                  description={
                    searchTerm
                      ? 'Try a different search'
                      : 'Add your first exploitation to launch your marketplace'
                  }
                  action={
                    !searchTerm ? (
                      <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={openAdd}>
                        <Plus className="h-4 w-4" />
                        Add First Exploitation
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-4 font-semibold text-foreground">Name</th>
                          <th className="text-left py-3 px-4 font-semibold text-foreground">Producer</th>
                          <th className="text-left py-3 px-4 font-semibold text-foreground">Category</th>
                          <th className="text-left py-3 px-4 font-semibold text-foreground">Price</th>
                          <th className="text-center py-3 px-4 font-semibold text-foreground">Status</th>
                          <th className="text-right py-3 px-4 font-semibold text-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map((item) => (
                          <tr key={item.id} className="border-b border-border hover:bg-accent/5 transition-colors">
                            <td className="py-3 px-4 text-foreground font-medium">{item.name}</td>
                            <td className="py-3 px-4 text-muted-foreground">{item.producer || '—'}</td>
                            <td className="py-3 px-4 text-muted-foreground">{item.category || '—'}</td>
                            <td className="py-3 px-4 text-foreground">
                              {item.price != null ? `€${item.price.toFixed(2)}/${item.unit ?? 'unit'}` : '—'}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <PublishedBadge active={item.active} />
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex gap-2 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-border"
                                  onClick={() => toggleActive(item)}
                                  title={item.active ? 'Unpublish' : 'Publish'}
                                  aria-label={item.active ? `Unpublish ${item.name}` : `Publish ${item.name}`}
                                >
                                  {item.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-border"
                                  onClick={() => openEdit(item)}
                                  aria-label={`Edit ${item.name}`}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-border text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDelete(item)}
                                  aria-label={`Delete ${item.name}`}
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
        </TabsContent>

        <TabsContent value="categories" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Product Categories</CardTitle>
              <CardDescription>Categories used to organize exploitations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {PRODUCT_CATEGORIES.map((category) => {
                  const count = exploitations.filter((e) => e.category === category).length
                  return (
                    <div
                      key={category}
                      className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/5 transition-colors"
                    >
                      <span className="font-medium text-foreground">{category}</span>
                      <span className="text-sm text-muted-foreground">
                        {count} exploitation{count === 1 ? '' : 's'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Exploitation' : 'Add Exploitation'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Tomates Bio"
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <select
                  className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Producer</Label>
                <Input
                  value={form.producer}
                  onChange={(e) => setForm((f) => ({ ...f, producer: e.target.value }))}
                  placeholder="Ferme Dupont"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Price (€)</Label>
                <Input
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="3.50"
                  aria-invalid={!!formErrors.price}
                />
                {formErrors.price ? <p className="text-xs text-destructive">{formErrors.price}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="kg"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="rounded border-border"
              />
              <span className="text-sm text-foreground">Published (visible in marketplace)</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Spinner className="h-4 w-4 mr-2" /> : null}
              {editItem ? 'Save Changes' : 'Add Exploitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmNode}
    </div>
  )
}
