import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  OPERATOR_MODULE_ID,
  getModuleWithLessons,
  getProfileProgressSummary,
} from '@/lib/academy/operator-training'
import { getAccessContext } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import type { AcademyProgressStatus } from '@/types/domain'
import { CheckCircle2, Circle, CircleDot, GraduationCap } from 'lucide-react'
/**
 * Liste de la formation Opérateur — server component : pas d'interaction
 * temps réel ici, seul le quiz/devoir (dans [lessonId]/) a besoin de 'use client'.
 * Aucune dépendance coopérative/membre — la formation Opérateur est ouverte
 * à tout compte authentifié (cf. app/api/academy/operator/*).
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'

const STATUS_LABEL: Record<AcademyProgressStatus, string> = {
  not_started: 'À commencer',
  in_progress: 'En cours',
  completed: 'Terminée',
}

function StatusBadge({ status }: { status: AcademyProgressStatus }) {
  if (status === 'completed') {
    return (
      <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
        <CheckCircle2 className="h-3.5 w-3.5" /> {STATUS_LABEL[status]}
      </Badge>
    )
  }
  if (status === 'in_progress') {
    return (
      <Badge variant="outline" className="gap-1 border-amber-400/60 text-amber-600">
        <CircleDot className="h-3.5 w-3.5" /> {STATUS_LABEL[status]}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Circle className="h-3.5 w-3.5" /> {STATUS_LABEL[status]}
    </Badge>
  )
}

export default async function OperatorTrainingPage() {
  const ctx = await getAccessContext()
  if (!ctx) redirect('/auth/login')

  const admin = createAdminClient()
  const module_ = await getModuleWithLessons(admin, OPERATOR_MODULE_ID)
  if (!module_) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <p className="text-sm text-muted-foreground">Formation indisponible pour le moment.</p>
      </div>
    )
  }

  const summary = await getProfileProgressSummary(admin, ctx.userId, OPERATOR_MODULE_ID)
  const statusByLesson = new Map(summary.lessons.map((l) => [l.lesson_id, l.status]))

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{module_.title}</h1>
            {module_.description && (
              <p className="text-sm text-muted-foreground">{module_.description}</p>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Leçons</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {module_.lessons.map((lesson) => {
                const status = statusByLesson.get(lesson.id) ?? 'not_started'
                return (
                  <li key={lesson.id}>
                    <Link
                      href={`/operator/training/${lesson.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
                    >
                      <span className="text-sm font-medium text-foreground">
                        {lesson.order_index != null ? `${lesson.order_index}. ` : ''}
                        {lesson.title}
                      </span>
                      <StatusBadge status={status} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
