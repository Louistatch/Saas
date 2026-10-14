import type { LearnerLesson } from '@/lib/academy/learner-view'
// Bloc parcours de l'accueil : « n / 12 leçons validées », un segment par leçon (or = validée,
// clair = en cours, transparent = à faire), la règle, et l'action principale. Les segments
// validés se révèlent l'un après l'autre à l'ouverture (academy-segment), immobiles sans
// mouvement ; l'information complète est dans le texte « n / 12 ».
import Link from 'next/link'

export function RouteCard({
  lessons,
  resume,
  moduleTitle,
}: {
  lessons: LearnerLesson[]
  resume: LearnerLesson | null
  moduleTitle: string
}) {
  const total = lessons.length
  const done = lessons.filter((l) => l.state === 'completed').length
  const allDone = total > 0 && done === total
  const label = resume
    ? `${done === 0 && !resume.lastViewedAt ? 'Commencer' : 'Reprendre'} : leçon ${
        resume.order_index ?? ''
      }, ${resume.title}`
    : 'Revoir les leçons'

  return (
    <section
      aria-labelledby="route-title"
      className="flex flex-col gap-5 rounded-[20px] bg-(--ac-emerald) px-6 py-6 text-(--ac-ground) sm:px-8 sm:py-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="route-title" className="academy-display text-2xl font-medium">
          {moduleTitle}
        </h2>
        <p className="academy-display text-[28px] text-(--ac-gold)" aria-live="polite">
          {done}{' '}
          <span className="text-base text-(--ac-pale)">
            / {total} leçon{total > 1 ? 's' : ''} validée{total > 1 ? 's' : ''}
          </span>
        </p>
      </div>
      <div
        aria-hidden="true"
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${Math.max(total, 1)}, minmax(0, 1fr))` }}
      >
        {lessons.map((lesson, i) => (
          <span
            key={lesson.id}
            className={`h-2.5 rounded-full ${
              lesson.state === 'completed'
                ? 'academy-segment bg-(--ac-gold)'
                : lesson.id === resume?.id
                  ? 'bg-(--ac-ground)'
                  : 'bg-(--ac-ground)/22'
            }`}
            style={lesson.state === 'completed' ? { animationDelay: `${i * 60}ms` } : undefined}
          />
        ))}
      </div>
      <p className="text-[15px] leading-relaxed text-(--ac-pale)">
        {allDone
          ? 'Les douze leçons sont validées : votre dossier est passé à l’évaluation pratique. Vous pouvez relire les leçons à tout moment.'
          : `Une leçon est validée quand son quiz est réussi et son cas pratique déposé. Après les ${total}, votre dossier passe à l’évaluation pratique.`}
      </p>
      <div className="flex flex-wrap gap-2.5">
        <Link
          href={resume ? `/operator/training/${resume.id}` : '/operator/training/resume'}
          className="inline-flex min-h-12 items-center rounded-full bg-(--ac-gold) px-5 font-bold text-(--ac-ink)"
        >
          {label}
        </Link>
        <Link
          href="/operator/training/lab"
          className="inline-flex min-h-12 items-center rounded-full border border-(--ac-ground)/40 px-5 font-semibold text-(--ac-ground)"
        >
          Ouvrir le laboratoire
        </Link>
      </div>
    </section>
  )
}
