'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuth } from '@/app/context/auth-context'
import { useCooperative } from '@/app/context/cooperative-context'
import { BookOpen, Play, HelpCircle, CheckSquare, GraduationCap, Plus, Clock } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'

interface AcademyModule {
  id: string
  title: string
  description?: string
  category: string
  level: string
  duration_min?: number
  culture?: string
  is_published: boolean
  order_index: number
  academy_lessons?: Array<{ id: string; title: string; content_type: string; content_body?: string; duration_min?: number; order_index: number }>
}

const CATEGORY_COLORS: Record<string, string> = {
  agronomie: 'border-t-green-500',
  phytosanitaire: 'border-t-orange-500',
  gestion: 'border-t-blue-500',
  commerce: 'border-t-purple-500',
  numerique: 'border-t-cyan-500',
  autre: 'border-t-gray-400',
}
const CATEGORY_BADGE: Record<string, string> = {
  agronomie: 'bg-green-100 text-green-800',
  phytosanitaire: 'bg-orange-100 text-orange-800',
  gestion: 'bg-blue-100 text-blue-800',
  commerce: 'bg-purple-100 text-purple-800',
  numerique: 'bg-cyan-100 text-cyan-800',
  autre: 'bg-gray-100 text-gray-700',
}
const LEVEL_BADGE: Record<string, string> = {
  debutant: 'bg-lime-100 text-lime-800',
  intermediaire: 'bg-yellow-100 text-yellow-800',
  avance: 'bg-red-100 text-red-800',
}
const CONTENT_ICON: Record<string, React.ElementType> = {
  text: BookOpen, video: Play, quiz: HelpCircle, checklist: CheckSquare,
}
const CATEGORIES = ['tous','agronomie','phytosanitaire','gestion','commerce','numerique','autre']

export default function AgriAcademyPage() {
  const { user } = useAuth()
  const { currentCooperative } = useCooperative()
  const [modules, setModules] = useState<AcademyModule[]>([])
  const [category, setCategory] = useState('tous')
  const [level, setLevel] = useState('')
  const [selected, setSelected] = useState<AcademyModule | null>(null)
  const [isAdmin] = useState(user?.role === 'super_admin' || user?.role === 'cooperative_admin')
  const [moduleDialog, setModuleDialog] = useState(false)
  const [lessonDialog, setLessonDialog] = useState(false)
  const [moduleForm, setModuleForm] = useState({ title: '', description: '', category: 'agronomie', level: 'debutant', culture: '', duration_min: '' })
  const [lessonForm, setLessonForm] = useState({ title: '', content_type: 'text', content_body: '', duration_min: '' })

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (category !== 'tous') params.set('category', category)
    if (level) params.set('level', level)
    const res = await fetch(`/api/academy/modules?${params}`)
    if (res.ok) { const d = await res.json(); setModules(d.modules) }
  }, [category, level])

  useEffect(() => { void load() }, [load])

  const loadDetail = async (mod: AcademyModule) => {
    const res = await fetch(`/api/academy/modules/${mod.id}`)
    if (res.ok) { const d = await res.json(); setSelected(d.module) }
    else setSelected(mod)
  }

  const createModule = async () => {
    if (!currentCooperative) return
    const res = await fetch('/api/academy/modules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...moduleForm, duration_min: moduleForm.duration_min ? Number(moduleForm.duration_min) : null, cooperative_id: currentCooperative.id }) })
    if (res.ok) { setModuleDialog(false); void load() }
  }

  const createLesson = async () => {
    if (!selected) return
    const res = await fetch(`/api/academy/modules/${selected.id}/lessons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...lessonForm, duration_min: lessonForm.duration_min ? Number(lessonForm.duration_min) : null }) })
    if (res.ok) { setLessonDialog(false); void loadDetail(selected) }
  }

  const markComplete = async (lessonId: string) => {
    if (!selected || !user) return
    await fetch('/api/academy/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ member_id: user.id, module_id: selected.id, lesson_id: lessonId, status: 'completed' }) })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AgriAcademy"
        description="Formations agricoles pour coopérateurs"
        action={isAdmin ? (
          <Dialog open={moduleDialog} onOpenChange={setModuleDialog}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Créer un module</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nouveau module</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Titre" value={moduleForm.title} onChange={e => setModuleForm(f => ({ ...f, title: e.target.value }))} />
                <Textarea placeholder="Description" value={moduleForm.description} onChange={e => setModuleForm(f => ({ ...f, description: e.target.value }))} />
                <Select value={moduleForm.category} onValueChange={v => setModuleForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.filter(c => c !== 'tous').map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={moduleForm.level} onValueChange={v => setModuleForm(f => ({ ...f, level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="debutant">Débutant</SelectItem><SelectItem value="intermediaire">Intermédiaire</SelectItem><SelectItem value="avance">Avancé</SelectItem></SelectContent>
                </Select>
                <Input placeholder="Culture (optionnel)" value={moduleForm.culture} onChange={e => setModuleForm(f => ({ ...f, culture: e.target.value }))} />
                <Input type="number" placeholder="Durée (minutes)" value={moduleForm.duration_min} onChange={e => setModuleForm(f => ({ ...f, duration_min: e.target.value }))} />
                <Button onClick={createModule} className="w-full">Créer</Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : undefined}
      />

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map(c => (
            <Button key={c} size="sm" variant={category === c ? 'default' : 'outline'} onClick={() => setCategory(c)} className="capitalize text-xs">{c}</Button>
          ))}
        </div>
        <div className="flex gap-1">
          {[{ v: '', l: 'Tous niveaux' }, { v: 'debutant', l: 'Débutant' }, { v: 'intermediaire', l: 'Intermédiaire' }, { v: 'avance', l: 'Avancé' }].map(({ v, l }) => (
            <Button key={v} size="sm" variant={level === v ? 'secondary' : 'ghost'} onClick={() => setLevel(v)} className="text-xs">{l}</Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map(mod => {
          const lessons = mod.academy_lessons ?? []
          const completedCount = 0 // would need progress data per user
          const progress = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0
          const borderColor = CATEGORY_COLORS[mod.category] ?? 'border-t-gray-400'
          return (
            <Card key={mod.id} className={`border-t-4 ${borderColor} cursor-pointer hover:shadow-md transition-shadow`} onClick={() => loadDetail(mod)}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Badge className={`text-xs ${CATEGORY_BADGE[mod.category] ?? ''}`}>{mod.category}</Badge>
                  <Badge className={`text-xs ${LEVEL_BADGE[mod.level] ?? ''}`}>{mod.level}</Badge>
                  {mod.duration_min && <Badge variant="outline" className="text-xs gap-1"><Clock className="h-3 w-3" />{mod.duration_min} min</Badge>}
                </div>
                <div>
                  <div className="font-semibold text-sm line-clamp-1">{mod.title}</div>
                  {mod.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{mod.description}</p>}
                </div>
                {lessons.length > 0 && (
                  <div><Progress value={progress} className="h-1.5" /><div className="text-xs text-muted-foreground mt-1">{completedCount}/{lessons.length} leçons</div></div>
                )}
                {mod.culture && <Badge variant="outline" className="text-xs">🌱 {mod.culture}</Badge>}
                <Button size="sm" className="w-full" onClick={e => { e.stopPropagation(); void loadDetail(mod) }}>
                  {progress === 100 ? '✓ Terminé' : progress > 0 ? 'Continuer' : 'Commencer'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
        {modules.length === 0 && (
          <div className="col-span-3 py-12 text-center text-muted-foreground">Aucun module disponible pour ce filtre</div>
        )}
      </div>

      {/* Module detail dialog */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Badge className={CATEGORY_BADGE[selected.category] ?? ''}>{selected.category}</Badge>
                {selected.title}
              </DialogTitle>
            </DialogHeader>
            {selected.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}
            <ScrollArea className="h-64">
              <div className="space-y-2 pr-4">
                {(selected.academy_lessons ?? []).map(lesson => {
                  const Icon = CONTENT_ICON[lesson.content_type] ?? BookOpen
                  return (
                    <div key={lesson.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium flex-1">{lesson.title}</span>
                        {lesson.duration_min && <span className="text-xs text-muted-foreground">{lesson.duration_min} min</span>}
                      </div>
                      {lesson.content_body && (
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans bg-muted/50 rounded p-2 max-h-24 overflow-auto">{lesson.content_body}</pre>
                      )}
                      <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => markComplete(lesson.id)}>✓ Marquer comme terminé</Button>
                    </div>
                  )
                })}
                {(selected.academy_lessons?.length ?? 0) === 0 && <div className="text-sm text-muted-foreground py-4 text-center">Aucune leçon pour ce module</div>}
              </div>
            </ScrollArea>
            {isAdmin && (
              <Dialog open={lessonDialog} onOpenChange={setLessonDialog}>
                <DialogTrigger asChild><Button variant="outline" size="sm" className="gap-1"><Plus className="h-3.5 w-3.5" /> Ajouter une leçon</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nouvelle leçon</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <Input placeholder="Titre de la leçon" value={lessonForm.title} onChange={e => setLessonForm(f => ({ ...f, title: e.target.value }))} />
                    <Select value={lessonForm.content_type} onValueChange={v => setLessonForm(f => ({ ...f, content_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="text">Texte</SelectItem><SelectItem value="video">Vidéo (URL)</SelectItem><SelectItem value="quiz">Quiz</SelectItem><SelectItem value="checklist">Checklist</SelectItem></SelectContent>
                    </Select>
                    <Textarea placeholder="Contenu (texte, URL vidéo, JSON quiz...)" value={lessonForm.content_body} onChange={e => setLessonForm(f => ({ ...f, content_body: e.target.value }))} rows={4} />
                    <Input type="number" placeholder="Durée estimée (minutes)" value={lessonForm.duration_min} onChange={e => setLessonForm(f => ({ ...f, duration_min: e.target.value }))} />
                    <Button onClick={createLesson} className="w-full">Ajouter</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
