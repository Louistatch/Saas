import { LessonList } from '@/components/academy/lesson-list'
import { LessonReadingView } from '@/components/academy/lesson-reading'
import { LessonCrumbs, LessonTabs } from '@/components/academy/lesson-tabs'
import { loadLearnerPage } from '@/lib/academy/learner-page'
import { enrichmentFor } from '@/lib/academy/lesson-enrichment'
import { lessonReading } from '@/lib/academy/lesson-reading'
import { OPERATOR_MODULE_ID } from '@/lib/academy/operator-training'
import { assertOperatorCandidate } from '@/lib/security/assert-partner-access'
/**
 * Écran 3 et 4 : lecteur de leçon, espace « Cours ». Sommaire à gauche (colonne PC, tiroir
 * Android), lecture au centre, repères à droite. Quiz et cas pratique vivent dans la salle
 * d'évaluation (./evaluation), le laboratoire dans ./lab : pas de page interminable.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { LessonOpened } from './lesson-opened'

const SUPPORT_EMAIL = 'support@faitierehub.com'

export default async function OperatorLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>
}) {
  const guard = await assertOperatorCandidate()
  if (!guard.ok) redirect('/operator')

  const { lessonId } = await params
  const data = await loadLearnerPage(guard.ctx.userId)
  const lesson = data?.module.lessons.find((l) => l.id === lessonId)
  const view = data?.lessons.find((l) => l.id === lessonId)
  if (!data || !lesson || !view) notFound()

  const { module: module_, lessons } = data
  const position = lessons.findIndex((l) => l.id === lessonId)
  const prev = position > 0 ? lessons[position - 1] : null
  const next = position < lessons.length - 1 ? lessons[position + 1] : null
  const reading = lessonReading({
    slides: lesson.slides,
    content_body: lesson.content_body,
    order_index: lesson.order_index,
  })
  const enrichment = enrichmentFor(lesson.order_index)
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    `Question sur la leçon ${view.order_index ?? ''} : ${view.title}`,
  )}`

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <LessonOpened moduleId={OPERATOR_MODULE_ID} lessonId={lesson.id} />
      <LessonList lessons={lessons} currentId={lesson.id} moduleTitle={module_.title} />

      <main className="min-w-0 flex-1 px-4 pt-5 pb-24 sm:px-8 sm:pt-7 lg:pb-12">
        <header className="mb-6 flex flex-col gap-3">
          <LessonCrumbs lesson={view} moduleTitle={module_.title} />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-1 text-sm text-(--ac-muted)">
                Leçon {position + 1} sur {lessons.length}
                {lesson.duration_min ? `, environ ${lesson.duration_min} min (durée estimée)` : ''}
              </p>
              <h1 className="academy-display text-[26px] font-medium leading-tight sm:text-[30px]">
                {view.title}
              </h1>
            </div>
            <LessonTabs lesson={view} current="cours" variant="top" />
          </div>
        </header>
        <LessonReadingView
          lesson={view}
          reading={reading}
          enrichment={enrichment}
          prev={prev}
          next={next}
        />
      </main>

      <aside
        aria-label="Objectifs et aide"
        className="flex flex-col gap-4 border-t border-(--ac-line) px-4 py-6 sm:px-8 lg:w-[280px] lg:shrink-0 lg:border-t-0 lg:border-l lg:px-6 lg:py-7"
      >
        <div className="flex flex-col gap-1.5 rounded-[14px] border border-(--ac-line) bg-white p-4 text-sm">
          <h2 className="font-bold">Pour valider cette leçon</h2>
          <p className="m-0 text-[13px] leading-relaxed text-(--ac-muted)">
            Quiz de 5 questions réussi à 70 % (3 tentatives par 24 h), puis cas pratique déposé. La
            correction nourrit l’évaluation pratique, elle ne certifie pas.
          </p>
          <Link
            href={`/operator/training/${lesson.id}/evaluation`}
            className="font-bold no-underline"
          >
            Ouvrir la salle d’évaluation
          </Link>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[14px] border border-(--ac-line) bg-white p-4 text-sm">
          <h2 className="font-bold">Question sur la leçon</h2>
          <p className="m-0 text-[13px] leading-relaxed text-(--ac-muted)">
            L’équipe répond par courriel, en général sous 24 h.
          </p>
          <a href={mailto} className="font-bold no-underline">
            Écrire à l’équipe
          </a>
        </div>
      </aside>
      <LessonTabs lesson={view} current="cours" variant="bottom" />
    </div>
  )
}
