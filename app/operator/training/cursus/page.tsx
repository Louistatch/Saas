import { loadLearnerPage } from '@/lib/academy/learner-page'
import { STATE_LABEL, remainingCounts } from '@/lib/academy/learner-view'
import { objectiveFromText } from '@/lib/academy/lesson-text'
import { assertOperatorCandidate } from '@/lib/security/assert-partner-access'
import { Check } from 'lucide-react'
/**
 * Écran 2 : vue d'ensemble du cursus. Objectif métier, débouché, prérequis, durée estimée,
 * programme avec l'état réel de chaque leçon, évaluations requises et critères de passage à
 * l'évaluation pratique. Le déroulé des 12 leçons en base reste la source de vérité.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'

function hours(min: number | null): string | null {
  if (!min) return null
  const h = Math.round((min / 60) * 2) / 2
  return `${String(h)
    .replace('.5', ' h 30')
    .replace(/^(\d+)$/, '$1 h')}`
}

export default async function CursusPage() {
  const guard = await assertOperatorCandidate()
  if (!guard.ok) redirect('/operator')
  const data = await loadLearnerPage(guard.ctx.userId)
  if (!data) redirect('/operator/training')
  const { module: module_, lessons, resume } = data
  const counts = remainingCounts(lessons)
  const done = lessons.length - counts.lessons
  const duration = hours(module_.duration_min)
  const required = {
    quizzes: module_.lessons.filter((l) => l.quiz?.is_required).length,
    assignments: module_.lessons.filter((l) => l.assignment?.is_required).length,
  }

  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-8 px-4 pt-6 pb-12 sm:px-8 sm:pt-8">
      <header className="flex flex-col gap-3">
        <nav aria-label="Fil d’Ariane" className="text-[13px] text-(--ac-muted)">
          <Link href="/operator/training" className="no-underline">
            Mes formations
          </Link>
          <span aria-hidden="true"> › </span>
          <span className="font-semibold text-(--ac-ink)">Vue d’ensemble</span>
        </nav>
        <p className="m-0 text-sm text-(--ac-muted)">
          Formation gratuite{duration ? `, environ ${duration} de travail (durée estimée)` : ''}
        </p>
        <h1 className="academy-display text-[28px] font-medium leading-tight sm:text-[34px]">
          {module_.title}
        </h1>
        {module_.description && (
          <p className="m-0 max-w-[64ch] text-[16px] leading-relaxed">{module_.description}</p>
        )}
        <div className="flex flex-wrap gap-2.5 pt-1">
          <Link
            href={resume ? `/operator/training/${resume.id}` : '/operator/training/resume'}
            className="inline-flex min-h-12 items-center rounded-full bg-(--ac-gold) px-5 font-bold text-(--ac-ink) no-underline"
          >
            {resume ? `Reprendre la leçon ${resume.order_index}` : 'Relire les leçons'}
          </Link>
        </div>
      </header>

      <section aria-labelledby="about-title" className="grid gap-4 sm:grid-cols-3">
        <h2 id="about-title" className="sr-only">
          Ce que prépare cette formation
        </h2>
        <div className="rounded-2xl border border-(--ac-line) bg-white p-5">
          <h3 className="text-sm font-bold">Débouché</h3>
          <p className="m-0 mt-1.5 text-sm leading-relaxed text-(--ac-muted)">
            Opérateur certifié FaîtiereHub : prestataire local qui accompagne plusieurs
            organisations agricoles, par mandat de service, sans en devenir propriétaire.
          </p>
        </div>
        <div className="rounded-2xl border border-(--ac-line) bg-white p-5">
          <h3 className="text-sm font-bold">Prérequis</h3>
          <p className="m-0 mt-1.5 text-sm leading-relaxed text-(--ac-muted)">
            Un compte FaîtiereHub et un dossier de candidature opérateur. Un téléphone Android ou un
            ordinateur suffit ; aucune installation.
          </p>
        </div>
        <div className="rounded-2xl border border-(--ac-line) bg-white p-5">
          <h3 className="text-sm font-bold">Après la formation</h3>
          <p className="m-0 mt-1.5 text-sm leading-relaxed text-(--ac-muted)">
            Évaluation pratique sur le terrain avec l’équipe, puis frais de certification. Un quiz
            ou un cas pratique ne certifie jamais à lui seul.
          </p>
        </div>
      </section>

      <section aria-labelledby="program-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="program-title" className="academy-display text-[22px] font-medium">
            Programme : {lessons.length} leçons
          </h2>
          <p className="m-0 text-sm text-(--ac-muted)" aria-live="polite">
            {done} validée{done > 1 ? 's' : ''}, {counts.lessons} à valider
          </p>
        </div>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {lessons.map((lesson) => {
            const full = module_.lessons.find((l) => l.id === lesson.id)
            const objective =
              full?.slides.find((s) => s.slide_type === 'objective')?.body ??
              objectiveFromText(full?.content_body)
            const current = lesson.id === resume?.id
            return (
              <li key={lesson.id}>
                <Link
                  href={`/operator/training/${lesson.id}`}
                  className={`grid grid-cols-[32px_1fr] gap-3 rounded-2xl border bg-white px-4 py-3.5 text-inherit no-underline sm:grid-cols-[32px_1fr_auto] ${
                    current ? 'border-(--ac-gold)' : 'border-(--ac-line)'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold ${
                      lesson.state === 'completed'
                        ? 'bg-(--ac-gold) text-(--ac-ink)'
                        : current
                          ? 'border-2 border-(--ac-gold) text-(--ac-emerald)'
                          : 'border border-(--ac-line) text-(--ac-muted)'
                    }`}
                  >
                    {lesson.state === 'completed' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      lesson.order_index
                    )}
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-[15px] leading-snug">{lesson.title}</strong>
                    {objective && (
                      <span className="mt-0.5 block text-[13px] leading-relaxed text-(--ac-muted)">
                        {objective}
                      </span>
                    )}
                    <span className="mt-1 block text-xs text-(--ac-muted)">
                      {lesson.duration_min ? `${lesson.duration_min} min estimées · ` : ''}
                      {lesson.hasQuiz ? 'quiz' : ''}
                      {lesson.hasQuiz && lesson.hasAssignment ? ' + ' : ''}
                      {lesson.hasAssignment ? 'cas pratique' : ''}
                    </span>
                  </span>
                  <span
                    className={`self-start text-[13px] font-bold sm:text-right ${
                      lesson.state === 'completed'
                        ? 'text-(--ac-green)'
                        : current
                          ? 'text-(--ac-emerald)'
                          : 'text-(--ac-muted)'
                    }`}
                  >
                    {STATE_LABEL[lesson.state]}
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      </section>

      <section aria-labelledby="rules-title" className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-(--ac-line) bg-white p-5">
          <h2 id="rules-title" className="text-base font-bold">
            Évaluations requises
          </h2>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0 text-sm leading-relaxed">
            <li>
              {required.quizzes} quiz de 5 questions, réussis à partir de 70 %, 3 tentatives par 24
              h, explications après chaque tentative.
            </li>
            <li>
              {required.assignments} cas pratiques écrits, déposés puis corrigés par l’équipe (note
              et commentaire).
            </li>
          </ul>
        </div>
        <div className="rounded-2xl bg-(--ac-emerald) p-5 text-(--ac-ground)">
          <h2 className="text-base font-bold">Pour passer à l’évaluation pratique</h2>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0 text-sm leading-relaxed text-(--ac-pale)">
            <li>
              Les {lessons.length} leçons validées : quiz réussi et cas pratique déposé pour
              chacune.
            </li>
            <li>
              Votre dossier passe alors automatiquement en attente d’évaluation ; l’équipe vous
              contacte.
            </li>
            <li>
              La certification se décide à l’évaluation pratique, puis les frais s’appliquent.
            </li>
          </ul>
        </div>
      </section>
    </main>
  )
}
