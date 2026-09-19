import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OPERATOR_MODULE_ID, getModuleWithLessons } from '@/lib/academy/operator-training'
import { assertOperatorCandidate } from '@/lib/security/assert-partner-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { ArrowLeft, ImageIcon } from 'lucide-react'
/**
 * Leçon Opérateur — server component : rend les slides en séquence, puis le
 * quiz et le devoir (sous-composants 'use client', seuls endroits ayant
 * besoin d'interaction). Aucun accès direct à la table depuis ici : tout
 * transite par lib/academy/operator-training.ts, comme la route API.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AssignmentForm } from './assignment-form'
import { QuizForm } from './quiz-form'

const SLIDE_TYPE_LABEL: Record<string, string> = {
  objective: 'Objectif',
  concept: 'Concept',
  screenshot: 'Capture d’écran',
  procedure: 'Procédure',
  warning: 'Attention',
  case: 'Cas pratique',
  summary: 'Résumé',
}

export default async function OperatorLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>
}) {
  const guard = await assertOperatorCandidate()
  if (!guard.ok) redirect('/operator')

  const { lessonId } = await params
  const admin = createAdminClient()
  const module_ = await getModuleWithLessons(admin, OPERATOR_MODULE_ID)
  const lesson = module_?.lessons.find((l) => l.id === lessonId)
  if (!module_ || !lesson) notFound()

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Link
          href="/operator/training"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour à la formation
        </Link>

        <h1 className="mb-6 text-xl font-bold text-foreground">{lesson.title}</h1>

        <div className="space-y-4">
          {lesson.slides.map((slide) => (
            <Card key={slide.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-foreground">
                  {slide.title}
                  <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                    {SLIDE_TYPE_LABEL[slide.slide_type] ?? slide.slide_type}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="whitespace-pre-wrap text-sm text-foreground">{slide.body}</p>
                {slide.media_asset?.storage_path && (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                    <ImageIcon className="h-4 w-4" /> {slide.media_asset.alt_text ?? 'Illustration'}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {lesson.quiz && (
          <div className="mt-6">
            <QuizForm quiz={lesson.quiz} />
          </div>
        )}

        {lesson.assignment && (
          <div className="mt-6">
            <AssignmentForm assignment={lesson.assignment} />
          </div>
        )}
      </main>
    </div>
  )
}
