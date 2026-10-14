import { LessonList } from '@/components/academy/lesson-list'
import { LessonPlayer } from '@/components/academy/lesson-player'
import { loadLearnerPage } from '@/lib/academy/learner-page'
import { objectivesFromSlides } from '@/lib/academy/learner-view'
import { OPERATOR_MODULE_ID } from '@/lib/academy/operator-training'
import { assertOperatorCandidate } from '@/lib/security/assert-partner-access'
/**
 * Lecteur de leçon (J3) : liste des leçons à gauche, contenu au centre, repères à droite.
 * Server component ; le défilement des diapositives vit dans components/academy/lesson-player.
 * Les formulaires de quiz et de dépôt (J2) sont passés tels quels au lecteur.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AssignmentForm } from './assignment-form'
import { LessonOpened } from './lesson-opened'
import { QuizForm } from './quiz-form'

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

  const { module: module_, summary, lessons } = data
  const position = lessons.findIndex((l) => l.id === lessonId)
  const prev = position > 0 ? lessons[position - 1] : null
  const next = position < lessons.length - 1 ? lessons[position + 1] : null
  const quizHistory = summary.latest_quiz_attempts.find((a) => a.quiz_id === lesson.quiz?.id)
  const latestSubmission = summary.submissions.find(
    (sub) => sub.assignment_id === lesson.assignment?.id,
  )
  const objectives = objectivesFromSlides(lesson.slides)
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    `Question sur la leçon ${view.order_index ?? ''} : ${lesson.title}`,
  )}`

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <LessonOpened moduleId={OPERATOR_MODULE_ID} lessonId={lesson.id} />
      <LessonList lessons={lessons} currentId={lesson.id} moduleTitle={module_.title} />

      <main className="min-w-0 flex-1 px-4 pt-6 pb-10 sm:px-8 sm:pt-7">
        <LessonPlayer
          lesson={lesson}
          position={{ index: position + 1, total: lessons.length }}
          gates={{ quizPassed: view.quizPassed, assignmentSubmitted: view.assignmentSubmitted }}
          prev={prev ? { id: prev.id, title: prev.title } : null}
          next={next ? { id: next.id, title: next.title } : null}
          quiz={
            lesson.quiz ? (
              <QuizForm
                quiz={lesson.quiz}
                history={{
                  attempts: quizHistory?.attempts ?? 0,
                  anyPassed: quizHistory?.any_passed ?? false,
                  lastScore: quizHistory?.score ?? null,
                }}
              />
            ) : null
          }
          assignment={
            lesson.assignment ? (
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
            ) : null
          }
        />
      </main>

      <aside
        aria-label="Objectifs et aide"
        className="flex flex-col gap-4 border-t border-(--ac-line) px-4 py-6 sm:px-8 lg:w-[280px] lg:shrink-0 lg:border-t-0 lg:border-l lg:px-6 lg:py-7"
      >
        {objectives.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <h2 className="text-[15px] font-bold">À la fin de cette leçon, vous savez</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm leading-snug">
              {objectives.map((o) => (
                <li key={o} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${
                      view.state === 'completed' ? 'bg-(--ac-gold)' : 'bg-(--ac-line)'
                    }`}
                  />
                  {o}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-2 rounded-[14px] border border-(--ac-line) bg-white p-4">
          <h2 className="text-sm font-bold">Essayer dans le laboratoire</h2>
          <p className="text-[13px] leading-relaxed text-(--ac-muted)">
            Un bureau de coopérative fictif, avec des données d’exercice. Rien n’est enregistré en
            production.
          </p>
          <Link
            href={`/operator/training/${lesson.id}/lab`}
            className="text-sm font-bold no-underline"
          >
            Ouvrir la simulation
          </Link>
        </div>
        <div className="flex flex-col gap-2 rounded-[14px] border border-(--ac-line) bg-white p-4">
          <h2 className="text-sm font-bold">Question sur la leçon</h2>
          <p className="text-[13px] leading-relaxed text-(--ac-muted)">
            L’équipe répond par courriel, en général sous 24 h.
          </p>
          <a href={mailto} className="text-sm font-bold no-underline">
            Écrire à l’équipe
          </a>
        </div>
        <p className="text-xs leading-relaxed text-(--ac-muted) lg:mt-auto">
          Vous pouvez quitter à tout moment. La diapositive en cours est mémorisée sur cet appareil.
        </p>
      </aside>
    </div>
  )
}
