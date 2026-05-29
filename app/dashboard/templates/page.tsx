'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Upload, Download, Trash2, FileSpreadsheet, FileText, File, FolderOpen } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useToast } from '@/hooks/use-toast'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { errorMessage } from '@/lib/utils/errors'

interface Template {
  id: string
  title: string
  description: string | null
  category: string
  file_name: string
  file_url: string
  file_type: string
  file_size: number | null
  culture: string | null
  download_count: number
  created_at: string
}

const CATEGORIES = [
  { value: 'compte_exploitation', label: '📊 Compte d\'exploitation', icon: FileSpreadsheet },
  { value: 'itineraire_technique', label: '📄 Itinéraire technique', icon: FileText },
  { value: 'fiche_suivi', label: '📋 Fiche de suivi', icon: File },
  { value: 'rapport', label: '📑 Rapport', icon: File },
  { value: 'autre', label: '📎 Autre', icon: File },
]

export default function TemplatesPage() {
  const { currentCooperative } = useCooperative()
  const { toast } = useToast()
  const { confirm, confirmNode } = useConfirm()
  const supabase = useMemo(() => createClient(), [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [templates, setTemplates] = useState<Template[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'compte_exploitation',
    culture: '',
  })
  const [pendingFile, setPendingFile] = useState<{ name: string; path: string; type: string; size: number } | null>(null)

  const fetchTemplates = useCallback(async () => {
    if (!currentCooperative) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)

    let query = supabase
      .from('templates')
      .select('*')

    // For faitiere/union: load templates from all child cooperatives
    if (currentCooperative.level === 'faitiere' || currentCooperative.level === 'union') {
      const { data: childCoops } = await supabase
        .from('cooperatives')
        .select('id')
        .or(`id.eq.${currentCooperative.id},parent_id.eq.${currentCooperative.id}`)
      const childIds = (childCoops ?? []).map(c => c.id)
      if (childIds.length > 0) {
        const { data: grandChildCoops } = await supabase
          .from('cooperatives')
          .select('id')
          .in('parent_id', childIds)
        const allIds = [...new Set([...childIds, ...(grandChildCoops ?? []).map(c => c.id)])]
        query = query.in('cooperative_id', allIds)
      } else {
        query = query.eq('cooperative_id', currentCooperative.id)
      }
    } else {
      query = query.eq('cooperative_id', currentCooperative.id)
    }

    const { data, error } = await query.order('category').order('title')
    if (error) {
      toast({ title: 'Erreur', description: errorMessage(error), variant: 'destructive' })
    } else {
      setTemplates((data ?? []) as Template[])
    }
    setIsLoading(false)
  }, [currentCooperative, supabase, toast])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  // Upload file
  const handleFileSelect = async (file: globalThis.File) => {
    if (!currentCooperative) return
    setUploading(true)
    const ext = file.name.split('.').pop() ?? 'bin'
    const path = `${currentCooperative.id}/templates/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`

    const { error } = await supabase.storage.from('templates').upload(path, file)
    setUploading(false)
    if (error) {
      toast({ title: 'Échec upload', description: errorMessage(error), variant: 'destructive' })
      return
    }
    setPendingFile({ name: file.name, path, type: ext, size: file.size })
    // Auto-fill title from filename
    if (!form.title) {
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')
      setForm((f) => ({ ...f, title: nameWithoutExt }))
    }
  }

  // Save template
  const handleSave = async () => {
    if (!currentCooperative || !pendingFile) return
    if (!form.title) {
      toast({ title: 'Le titre est obligatoire', variant: 'destructive' })
      return
    }
    setSaving(true)
    const { error } = await supabase.from('templates').insert({
      cooperative_id: currentCooperative.id,
      title: form.title,
      description: form.description || null,
      category: form.category,
      culture: form.culture || null,
      file_name: pendingFile.name,
      file_url: pendingFile.path,
      file_type: pendingFile.type,
      file_size: pendingFile.size,
    })
    setSaving(false)
    if (error) {
      toast({ title: 'Erreur', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Template sauvegardé', description: form.title })
    setShowAdd(false)
    setForm({ title: '', description: '', category: 'compte_exploitation', culture: '' })
    setPendingFile(null)
    fetchTemplates()
  }

  // Download template
  const handleDownload = async (template: Template) => {
    setDownloadingId(template.id)
    try {
      const { data, error } = await supabase.storage
        .from('templates')
        .createSignedUrl(template.file_url, 60) // 60 seconds
      if (error || !data?.signedUrl) throw error ?? new Error('URL non générée')

      // Trigger download
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.download = template.file_name
      a.click()

      // Increment counter
      await supabase.from('templates').update({ download_count: template.download_count + 1 }).eq('id', template.id)
      toast({ title: 'Téléchargement lancé', description: template.file_name })
    } catch (err) {
      toast({ title: 'Erreur', description: errorMessage(err), variant: 'destructive' })
    }
    setDownloadingId(null)
  }

  // Delete
  const handleDelete = async (template: Template) => {
    const ok = await confirm({
      title: 'Supprimer ce template ?',
      description: `"${template.title}" sera définitivement supprimé.`,
      destructive: true,
      confirmLabel: 'Supprimer',
    })
    if (!ok) return
    await supabase.storage.from('templates').remove([template.file_url])
    await supabase.from('templates').delete().eq('id', template.id)
    toast({ title: 'Template supprimé' })
    fetchTemplates()
  }

  const fileIcon = (type: string) => {
    if (type === 'xlsx' || type === 'xls') return <FileSpreadsheet className="h-8 w-8 text-green-600" />
    if (type === 'docx' || type === 'doc') return <FileText className="h-8 w-8 text-blue-600" />
    if (type === 'pdf') return <File className="h-8 w-8 text-red-600" />
    return <File className="h-8 w-8 text-gray-500" />
  }

  const formatSize = (bytes: number | null) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  }

  // Group by category
  const grouped = useMemo(() => {
    const map: Record<string, Template[]> = {}
    for (const t of templates) {
      if (!map[t.category]) map[t.category] = []
      map[t.category].push(t)
    }
    return map
  }, [templates])

  return (
    <div className="space-y-8">
      <PageHeader
        title="Bibliothèque de templates"
        description="Vos modèles vierges de comptes d'exploitation et itinéraires techniques — téléchargeables à tout moment"
        action={
          <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Ajouter un template
          </Button>
        }
      />

      {isLoading ? (
        <LoadingBlock />
      ) : templates.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12">
            <EmptyState
              icon={FolderOpen}
              title="Aucun template"
              description="Uploadez vos modèles vierges (Excel, DOCX) pour ne jamais les perdre. Vous pourrez les re-télécharger à tout moment."
              action={
                <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setShowAdd(true)}>
                  <Upload className="h-4 w-4" />
                  Ajouter votre premier template
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.filter((cat) => grouped[cat.value]?.length).map((cat) => (
            <Card key={cat.value} className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-foreground text-lg flex items-center gap-2">
                  {cat.label}
                  <span className="text-xs font-normal text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                    {grouped[cat.value].length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {grouped[cat.value].map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center gap-4 p-3 border border-border rounded-lg hover:bg-accent/5 transition-colors"
                    >
                      {fileIcon(template.file_type)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{template.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {template.file_name} • {formatSize(template.file_size)}
                          {template.culture ? ` • ${template.culture}` : ''}
                          {template.download_count > 0 ? ` • ${template.download_count} téléch.` : ''}
                        </p>
                        {template.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{template.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleDownload(template)}
                          disabled={downloadingId === template.id}
                        >
                          {downloadingId === template.id ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                          Télécharger
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(template)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add template dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un template</DialogTitle>
            <DialogDescription>
              Uploadez un modèle vierge (Excel, DOCX, PDF) que vous pourrez re-télécharger à tout moment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* File upload */}
            {!pendingFile ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary hover:bg-accent/5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {uploading ? (
                  <Spinner className="h-8 w-8 mx-auto" />
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-foreground font-medium">Cliquez pour sélectionner un fichier</p>
                    <p className="text-xs text-muted-foreground mt-1">Excel (.xlsx), Word (.docx), PDF — max 20 Mo</p>
                  </>
                )}
              </button>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                {fileIcon(pendingFile.type)}
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{pendingFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(pendingFile.size)}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setPendingFile(null)}
                >
                  Changer
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.docx,.doc,.pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFileSelect(f)
                e.target.value = ''
              }}
            />

            {/* Title */}
            <div className="space-y-2">
              <Label>Titre <span className="text-destructive">*</span></Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Modèle compte d'exploitation Tomate"
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <select
                className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Culture (optional) */}
            <div className="space-y-2">
              <Label>Culture (optionnel)</Label>
              <Input
                value={form.culture}
                onChange={(e) => setForm((f) => ({ ...f, culture: e.target.value }))}
                placeholder="Tomate, Piment, Général…"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description (optionnel)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Notes sur ce template…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setPendingFile(null) }} disabled={saving}>
              Annuler
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90 gap-2"
              onClick={handleSave}
              disabled={saving || !pendingFile || !form.title}
            >
              {saving ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
              Sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmNode}
    </div>
  )
}
