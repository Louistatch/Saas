import { RouteCard } from '@/components/academy/route-card'
import { ShareTraining } from '@/components/operator/share-training'
import { loadLearnerPage } from '@/lib/academy/learner-page'
import {
  type LearnerLesson,
  STATE_LABEL,
  objectivesFromSlides,
  remainingCounts,
} from '@/lib/academy/learner-view'
import { assertOperatorCandidate } from '@/lib/security/assert-partner-access'
import { Bell, Check, FlaskConical } from 'lucide-react'
/**
 * Accueil AgriAcademy (J3, spécification docs/agriacademy-j3-spec.md §4) : répond dans l'ordre
 * à « où j'en suis ? », « que reste-t-il ? », « que faire maintenant ? », « qu'ai-je acquis ? ».
 * Server component ; les données viennent de lib/academy/learner-page.ts.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'

const enter = (rank: number) =>
  `motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-300 motion-safe:ease-out motion-safe:[animation-delay:${rank * 70}ms]`

function ActivityRow({
  href,
  lead,
  title,
  detail,
  tag,
}: {
  href: string
  lead: React.ReactNode
  title: string
  detail: string
  tag?: string
}) {
  return (
    <Link
      href={href}
      className="grid grid-cols-[52px_1fr] items-center gap-4 rounded-2xl border border-(--ac-line) bg-white px-4 py-4 text-inherit no-underline sm:grid-cols-[56px_1fr_auto]"
    >
      <span
        aria-hidden="true"
        className="academy-display flex h-13 w-13 items-center justify-center rounded-[14px] bg-(--ac-mist) text-[22px] text-(--ac-emerald) sm:h-14 sm:w-14"
      >
        {lead}
      </span>
      <span className="min-w-0">
        <strong className="block text-[15px] leading-snug sm:text-base">{title}</strong>
        <span className="text-sm text-(--ac-muted)">{detail}</span>
      </span>
      {tag && (
        <span className="hidden text-[13px] font-bold text-(--ac-green) sm:block">{tag}</span>
      )}
    </Link>
  )
}

export default async function OperatorTrainingPage() {
  const guard = await assertOperatorCandidate()
  if (!guard.ok) redirect('/operator')
  const data = await loadLearnerPage(guard.ctx.userId)
  if (!data) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-(--ac-muted)">Formation indisponible pour le moment.</p>
      </main>
    )
  }
  const { module: module_, lessons, resume, firstName } = data
  const counts = remainingCounts(lessons)
  const toRead = lessons.filter((l) => l.review)
  const acquired = lessons
    .filter((l) => l.state === 'completed')
    .map((l) => ({
      lesson: l,
      objectives: objectivesFromSlides(module_.lessons.find((x) => x.id === l.id)?.slides ?? [], 3),
    }))

  return (
    <main className="mx-auto flex max-w-[1100px] flex-col gap-7 px-4 pt-8 pb-12 sm:px-8 sm:pt-9">
      <header className={`flex flex-wrap items-end justify-between gap-3 ${enter(0)}`}>
        <div>
          <p className="mb-1 text-sm text-(--ac-muted)">
            {firstName ? `Bonjour ${firstName}` : 'Bonjour'}
          </p>
          <h1 className="academy-display text-[28px] font-medium leading-tight sm:text-[34px]">
            Votre parcours d’opérateur certifié
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/operator/messages"
            aria-label="Messages"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-(--ac-line) bg-white"
          >
            <Bell aria-hidden="true" className="h-[18px] w-[18px]" />
          </Link>
          <Link
            href="/operator"
            className="inline-flex min-h-11 items-center rounded-full border border-(--ac-line) bg-white px-3.5 text-sm font-semibold no-underline"
          >
            Mon dossier
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className={`lg:col-span-8 ${enter(1)}`}>
          <RouteCard lessons={lessons} resume={resume} moduleTitle={module_.title} />
        </div>
        <section
          aria-labelledby="remaining-title"
          className={`flex flex-col gap-3.5 rounded-[20px] border border-(--ac-line) bg-white p-6 lg:col-span-4 ${enter(2)}`}
        >
          <h2 id="remaining-title" className="text-base font-bold">
            Ce qui reste avant l’évaluation
          </h2>
          <dl className="m-0 flex flex-col gap-2.5 text-sm">
            <div className="flex justify-between gap-2">
              <dt>Leçons à valider</dt>
              <dd className="m-0 font-bold">{counts.lessons}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Quiz à réussir</dt>
              <dd className="m-0 font-bold">{counts.quizzes}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Cas pratiques à déposer</dt>
              <dd className="m-0 font-bold">{counts.assignments}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Cas pratiques corrigés</dt>
              <dd className="m-0 font-bold">
                {counts.reviewed} / {counts.submitted}
              </dd>
            </div>
          </dl>
          <p className="text-[13px] leading-relaxed text-(--ac-muted)">
            Puis l’évaluation pratique sur le terrain, avec un opérateur de l’équipe. Les frais de
            certification sont indiqués dans votre dossier.
          </p>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <section
          aria-labelledby="next-title"
          className={`flex flex-col gap-3 lg:col-span-7 ${enter(3)}`}
        >
          <h2 id="next-title" className="academy-display text-[22px] font-medium">
            Prochaines activités
          </h2>
          {resume ? (
            <ActivityRow
              href={`/operator/training/${resume.id}`}
              lead={resume.order_index ?? '•'}
              title={resume.title}
              detail={`Leçon${resume.duration_min ? `, ${resume.duration_min} min` : ''}. ${STATE_LABEL[resume.state]}.`}
              tag={resume.lastViewedAt ? 'En cours' : 'À commencer'}
            />
          ) : (
            <ActivityRow
              href="/operator"
              lead={<Check aria-hidden="true" className="h-6 w-6" />}
              title="Toutes les leçons sont validées"
              detail="Votre dossier attend l’évaluation pratique. Suivez-le depuis votre dossier."
            />
          )}
          {resume && (
            <ActivityRow
              href={`/operator/training/${resume.id}/lab`}
              lead={<FlaskConical aria-hidden="true" className="h-6 w-6" />}
              title="Mission : enregistrer un producteur"
              detail="Laboratoire, bureau de coopérative fictif. Rien n’est enregistré en production."
            />
          )}
          {toRead.slice(0, 2).map((l) => (
            <ActivityRow
              key={l.id}
              href={`/operator/training/${l.id}#cas-pratique`}
              lead={l.review?.score != null ? l.review.score : '✓'}
              title={`Cas pratique ${l.order_index ?? ''} corrigé`}
              detail={
                l.review?.revision
                  ? 'Une reprise est demandée : lisez le commentaire puis déposez une nouvelle version.'
                  : 'Lire le commentaire de l’équipe.'
              }
              tag={l.review?.revision ? 'À reprendre' : 'Corrigé'}
            />
          ))}
        </section>

        <section
          id="resultats"
          aria-labelledby="skills-title"
          className={`flex flex-col gap-3 lg:col-span-5 ${enter(4)}`}
        >
          <h2 id="skills-title" className="academy-display text-[22px] font-medium">
            Compétences acquises
          </h2>
          {acquired.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-(--ac-line) px-4 py-5 text-sm leading-relaxed text-(--ac-muted)">
              Vos premières compétences apparaîtront ici dès la première leçon validée : quiz
              réussi, cas pratique déposé.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {acquired.map(({ lesson, objectives }) => (
                <li
                  key={lesson.id}
                  className="rounded-2xl border border-(--ac-line) bg-white px-4 py-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm">
                      {lesson.order_index}. {lesson.title}
                    </strong>
                    {lesson.quizScore != null && (
                      <span className="text-xs font-semibold text-(--ac-muted)">
                        Quiz {lesson.quizScore} %
                      </span>
                    )}
                  </div>
                  {objectives.length > 0 && (
                    <ul className="mt-1.5 flex list-none flex-col gap-1 p-0 text-[13px] text-(--ac-muted)">
                      {objectives.map((o) => (
                        <li key={o} className="flex gap-2">
                          <span
                            aria-hidden="true"
                            className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-(--ac-gold)"
                          />
                          {o}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="lessons-title" className={enter(5)}>
        <h2 id="lessons-title" className="academy-display mb-3 text-[22px] font-medium">
          Les {lessons.length} leçons
        </h2>
        <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
          {lessons.map((lesson: LearnerLesson) => (
            <li key={lesson.id}>
              <Link
                href={`/operator/training/${lesson.id}`}
                className="grid min-h-14 grid-cols-[28px_1fr] items-center gap-3 rounded-xl border border-(--ac-line) bg-white px-3.5 py-2.5 text-inherit no-underline"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    lesson.state === 'completed'
                      ? 'bg-(--ac-gold) text-(--ac-ink)'
                      : lesson.id === resume?.id
                        ? 'border-2 border-(--ac-gold) text-(--ac-emerald)'
                        : 'border border-(--ac-line) text-(--ac-muted)'
                  }`}
                >
                  {lesson.state === 'completed' ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    lesson.order_index
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{lesson.title}</span>
                  <span className="text-xs text-(--ac-muted)">{STATE_LABEL[lesson.state]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <ShareTraining className="border-t border-(--ac-line) pt-6" />
    </main>
  )
}
