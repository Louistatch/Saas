import { LessonCrumbs, LessonTabs } from '@/components/academy/lesson-tabs'
import { loadLearnerPage } from '@/lib/academy/learner-page'
import { lessonReading } from '@/lib/academy/lesson-reading'
import { assertOperatorCandidate } from '@/lib/security/assert-partner-access'
import { ClipboardList, Lock } from 'lucide-react'
/**
 * Écran 5 : salle d'évaluation d'une leçon. Un espace calme, sans sommaire ni bulle de
 * support : règles du quiz, tentatives connues, quiz (J2, inchangé), puis le cas pratique dans
 * son propre espace. Toutes les règles restent côté serveur (lib/academy).
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AssignmentForm } from '../assignment-form'
import { QuizForm } from '../quiz-form'

export default async function LessonEvaluationPage({
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

  const { summary, module: module_ } = data
  const quizHistory = summary.latest_quiz_attempts.find((a) => a.quiz_id === lesson.quiz?.id)
  const latestSubmission = summary.submissions.find(
    (sub) => sub.assignment_id === lesson.assignment?.id,
  )
  const reading = lessonReading({ slides: lesson.slides, content_body: lesson.content_body })
  const attempts = quizHistory?.attempts ?? 0
  const maxAttempts = lesson.quiz?.max_attempts ?? 3

  return (
    <div className="academy-focus mx-auto flex min-h-screen max-w-[820px] flex-col gap-6 px-4 pt-5 pb-24 sm:px-8 sm:pt-7 lg:pb-12">
      <header className="flex flex-col gap-3">
        <LessonCrumbs lesson={view} moduleTitle={module_.title} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-sm text-(--ac-muted)">
              Salle d’évaluation, leçon {view.order_index}
            </p>
            <h1 className="academy-display text-[26px] font-medium leading-tight sm:text-[30px]">
              {view.title}
            </h1>
          </div>
          <LessonTabs lesson={view} current="evaluation" variant="top" />
        </div>
      </header>

      {lesson.quiz && (
        <section aria-labelledby="quiz-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="quiz-title" className="academy-display text-[22px] font-medium">
              Quiz
            </h2>
            <p className="m-0 text-sm text-(--ac-muted)">
              {lesson.quiz.questions.length} questions, réussi à partir de{' '}
              {lesson.quiz.passing_score} %.{' '}
              {view.quizPassed
                ? `Réussi${quizHistory?.score != null ? ` (${quizHistory.score} %)` : ''}.`
                : `${attempts} tentative${attempts > 1 ? 's' : ''} sur ${maxAttempts} par 24 h utilisée${attempts > 1 ? 's' : ''}.`}
            </p>
          </div>
          <QuizForm
            quiz={lesson.quiz}
            history={{
              attempts,
              anyPassed: quizHistory?.any_passed ?? false,
              lastScore: quizHistory?.score ?? null,
            }}
          />
        </section>
      )}

      {lesson.assignment && (
        <section
          id="cas-pratique"
          aria-labelledby="case-title"
          className="flex flex-col gap-4 scroll-mt-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="case-title" className="academy-display text-[22px] font-medium">
              Cas pratique
            </h2>
            <p className="m-0 text-sm text-(--ac-muted)">
              Corrigé par l’équipe ; la note nourrit l’évaluation pratique.
            </p>
          </div>
          {reading.caseBrief && (
            <p className="m-0 max-w-[62ch] border-l-4 border-(--ac-gold) pl-4 text-[15px] leading-relaxed">
              {reading.caseBrief.body}
            </p>
          )}
          {view.quizPassed ? (
            <AssignmentForm
              assignment={lesson.assignment}
              latest={
                latestSubmission
                  ? {
                      status: latestSubmission.status as
                        | 'submitted'
                        | 'reviewed'
                        | 'revision_required'
                        | 'draft',
                      score: latestSubmission.score,
                      feedback: latestSubmission.feedback,
                      reviewed_at: latestSubmission.reviewed_at,
                    }
                  : null
              }
            />
          ) : (
            <div className="flex flex-col gap-2.5 rounded-2xl border border-(--ac-line) bg-white px-5 py-5">
              <h3 className="flex items-center gap-2 text-base font-bold">
                <ClipboardList aria-hidden="true" className="h-5 w-5 text-(--ac-green)" />
                {lesson.assignment.title}
              </h3>
              <p className="m-0 text-sm leading-relaxed text-(--ac-muted)">
                {lesson.assignment.instructions}
              </p>
              <p className="m-0 inline-flex items-center gap-2 self-start rounded-full border border-(--ac-line) px-4 py-2.5 text-sm font-semibold text-(--ac-muted)">
                <Lock aria-hidden="true" className="h-4 w-4" /> Le dépôt s’ouvre quand le quiz est
                réussi
              </p>
            </div>
          )}
        </section>
      )}

      <p className="m-0 text-center text-xs leading-relaxed text-(--ac-muted)">
        <Link href={`/operator/training/${lesson.id}`} className="font-semibold no-underline">
          Revenir au cours
        </Link>{' '}
        à tout moment : ce qui est validé reste validé.
      </p>
      <LessonTabs lesson={view} current="evaluation" variant="bottom" />
    </div>
  )
}
