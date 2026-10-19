import type { LearnerLesson } from '@/lib/academy/learner-view'
import { BookOpen, Check, ClipboardCheck, FlaskConical } from 'lucide-react'
// Les trois espaces d'une leçon : Cours (lire), Exercice (s'entraîner), Évaluation (quiz et
// cas pratique). Trois routes, pas trois états client : chaque espace a sa page, son URL et
// son retour arrière. Sur téléphone, les mêmes onglets forment la barre d'action du bas.
import Link from 'next/link'

export type LessonSpace = 'cours' | 'exercice' | 'evaluation'

export function lessonSpaceHref(lessonId: string, space: LessonSpace): string {
  const base = `/operator/training/${lessonId}`
  return space === 'cours' ? base : space === 'exercice' ? `${base}/lab` : `${base}/evaluation`
}

export function LessonTabs({
  lesson,
  current,
  variant,
}: {
  lesson: LearnerLesson
  current: LessonSpace
  variant: 'top' | 'bottom'
}) {
  const evaluationDone = lesson.quizPassed && lesson.assignmentSubmitted
  const tabs: { space: LessonSpace; label: string; icon: typeof BookOpen; done: boolean }[] = [
    { space: 'cours', label: 'Cours', icon: BookOpen, done: false },
    { space: 'exercice', label: 'Exercice', icon: FlaskConical, done: false },
    { space: 'evaluation', label: 'Évaluation', icon: ClipboardCheck, done: evaluationDone },
  ]
  if (variant === 'bottom') {
    return (
      <nav
        aria-label="Espaces de la leçon"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-(--ac-line) bg-white px-1.5 pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden"
      >
        {tabs.map((t) => (
          <Link
            key={t.space}
            href={lessonSpaceHref(lesson.id, t.space)}
            aria-current={t.space === current ? 'page' : undefined}
            className={`flex min-h-12 flex-col items-center gap-1 pt-1.5 text-[11px] font-semibold ${
              t.space === current ? 'text-(--ac-emerald)' : 'text-(--ac-muted)'
            }`}
          >
            <t.icon aria-hidden="true" className="h-[22px] w-[22px]" />
            {t.label}
            {t.done && <span className="sr-only">, terminée</span>}
          </Link>
        ))}
      </nav>
    )
  }
  return (
    <nav aria-label="Espaces de la leçon" className="hidden gap-2 lg:flex">
      {tabs.map((t) => (
        <Link
          key={t.space}
          href={lessonSpaceHref(lesson.id, t.space)}
          aria-current={t.space === current ? 'page' : undefined}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold no-underline ${
            t.space === current
              ? 'bg-(--ac-emerald) text-(--ac-ground)'
              : t.done
                ? 'bg-(--ac-gold) text-(--ac-ink)'
                : 'border border-(--ac-line) bg-white text-(--ac-ink)'
          }`}
        >
          {t.done ? (
            <Check aria-hidden="true" className="h-4 w-4" />
          ) : (
            <t.icon aria-hidden="true" className="h-4 w-4" />
          )}
          {t.label}
        </Link>
      ))}
    </nav>
  )
}

/** Fil d'Ariane compact : Mes formations › Cursus › Leçon n. */
export function LessonCrumbs({
  lesson,
  moduleTitle,
}: { lesson: LearnerLesson; moduleTitle: string }) {
  return (
    <nav aria-label="Fil d’Ariane" className="text-[13px] text-(--ac-muted)">
      <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
        <li>
          <Link href="/operator/training" className="no-underline">
            Mes formations
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li className="max-w-[40vw] truncate lg:max-w-none">
          <Link href="/operator/training/cursus" className="no-underline">
            {moduleTitle}
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li aria-current="page" className="font-semibold text-(--ac-ink)">
          Leçon {lesson.order_index ?? ''}
        </li>
      </ol>
    </nav>
  )
}
