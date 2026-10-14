import type { LearnerLesson } from '@/lib/academy/learner-view'
import type { LessonEnrichment } from '@/lib/academy/lesson-enrichment'
import type { LessonReading } from '@/lib/academy/lesson-reading'
import { ChevronLeft, ChevronRight, Eye, ImageOff, Lightbulb, MapPin } from 'lucide-react'
// Espace « Cours » : un seul écran de lecture, du plus court au plus long : objectif, points
// clés, démonstration, texte complet, à retenir. Aucune pile de cartes identiques ; aucun
// badge de type ; le média manquant est dit manquant, jamais simulé.
import Link from 'next/link'
import { LessonText } from './lesson-text'

export function LessonReadingView({
  lesson,
  reading,
  enrichment,
  prev,
  next,
}: {
  lesson: LearnerLesson
  reading: LessonReading
  enrichment: LessonEnrichment | null
  prev: LearnerLesson | null
  next: LearnerLesson | null
}) {
  return (
    <article className="flex flex-col gap-7">
      {reading.objective && (
        <p className="max-w-[60ch] border-l-4 border-(--ac-gold) pl-4 text-[17px] leading-relaxed">
          {reading.objective}
        </p>
      )}

      {reading.concepts.length > 0 && (
        <section aria-labelledby="concepts-title" className="flex flex-col gap-3">
          <h2 id="concepts-title" className="text-[13px] font-bold text-(--ac-green)">
            Points clés
          </h2>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {reading.concepts.map((c) => (
              <li key={c.id} className="rounded-2xl bg-(--ac-mist) px-5 py-4">
                <strong className="academy-display block text-lg font-medium leading-tight">
                  {c.title}
                </strong>
                <p className="mt-1.5 mb-0 text-[15px] leading-relaxed">{c.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reading.demo && (
        <figure className="m-0 flex flex-col gap-3 rounded-2xl border border-(--ac-line) bg-white p-5">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="academy-display text-lg font-medium">
              Démonstration : {reading.demo.title}
            </span>
            {reading.demo.route && (
              <code className="rounded-md bg-(--ac-ground) px-2 py-0.5 text-[13px]">
                {reading.demo.route}
              </code>
            )}
          </figcaption>
          {reading.demo.src ? (
            <>
              <picture>
                {reading.demo.srcMobile && (
                  <source media="(max-width: 640px)" srcSet={reading.demo.srcMobile} />
                )}
                <img
                  src={reading.demo.src}
                  alt={reading.demo.alt}
                  loading="lazy"
                  className="w-full rounded-xl border border-(--ac-line)"
                />
              </picture>
              {reading.demo.source === 'catalogue' && (
                <p className="m-0 text-xs text-(--ac-muted)">
                  {reading.demo.note} : l’écran réel de FaîtiereHub, avec une coopérative fictive.
                </p>
              )}
              {enrichment && (
                <p className="m-0 flex items-start gap-2 text-sm leading-relaxed">
                  <Eye aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-(--ac-green)" />
                  <span>
                    <strong>À observer.</strong> {enrichment.demoFocus}
                  </span>
                </p>
              )}
            </>
          ) : (
            <div
              role="note"
              className="flex items-start gap-3 rounded-xl border border-dashed border-(--ac-line) bg-(--ac-ground) px-4 py-3.5 text-sm leading-relaxed text-(--ac-muted)"
            >
              <ImageOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong className="text-(--ac-ink)">Média à fournir.</strong> {reading.demo.note}
              </span>
            </div>
          )}
        </figure>
      )}

      {reading.blocks.length > 0 && (
        <section
          aria-labelledby="text-title"
          className="rounded-[20px] border border-(--ac-line) bg-white px-5 py-6 sm:px-8 sm:py-8"
        >
          <h2 id="text-title" className="mb-5 text-[13px] font-bold text-(--ac-green)">
            Leçon complète
          </h2>
          <LessonText blocks={reading.blocks} />
        </section>
      )}

      {enrichment && (
        <section
          aria-labelledby="example-title"
          className="flex flex-col gap-3 rounded-[20px] border border-(--ac-line) bg-(--ac-sand) px-5 py-5 sm:px-7"
        >
          <h2
            id="example-title"
            className="flex items-center gap-2 text-[13px] font-bold text-(--ac-green)"
          >
            <MapPin aria-hidden="true" className="h-4 w-4" /> Exemple de terrain
          </h2>
          <p className="academy-display m-0 text-lg font-medium leading-tight">
            {enrichment.example.title}
          </p>
          <p className="m-0 max-w-[68ch] text-[15px] leading-relaxed">{enrichment.example.body}</p>
          <p className="m-0 text-xs text-(--ac-muted)">
            Coopérative et chiffres fictifs, à titre d’exercice.
          </p>
        </section>
      )}

      {enrichment && (
        <section aria-labelledby="selfcheck-title" className="flex flex-col gap-2">
          <h2 id="selfcheck-title" className="text-[13px] font-bold text-(--ac-green)">
            Vérifiez-vous avant le quiz
          </h2>
          <p className="m-0 text-sm text-(--ac-muted)">
            Trois questions sans note. Répondez de tête, puis comparez.
          </p>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {enrichment.selfCheck.map((s, i) => (
              <li key={s.question}>
                <details className="group rounded-2xl border border-(--ac-line) bg-white">
                  <summary className="flex min-h-12 cursor-pointer list-none items-start gap-3 px-4 py-3 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-(--ac-gold) text-[11px] font-bold"
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1">{s.question}</span>
                    <ChevronRight
                      aria-hidden="true"
                      className="mt-1 h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
                    />
                  </summary>
                  <p className="m-0 border-t border-(--ac-line) px-4 py-3 pl-[52px] text-[15px] leading-relaxed">
                    {s.answer}
                  </p>
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}

      {reading.summary && (
        <aside className="flex gap-3 rounded-2xl bg-(--ac-emerald) px-5 py-4 text-(--ac-ground)">
          <Lightbulb aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-(--ac-gold)" />
          <p className="m-0 text-[15px] leading-relaxed">
            <strong className="mr-1 text-(--ac-gold)">{reading.summary.title}.</strong>
            {reading.summary.body}
          </p>
        </aside>
      )}

      <div className="flex flex-col gap-3 border-t border-(--ac-line) pt-5">
        <Link
          href={`/operator/training/${lesson.id}/evaluation`}
          className="inline-flex min-h-12 items-center justify-center self-start rounded-full bg-(--ac-gold) px-6 font-bold text-(--ac-ink) no-underline"
        >
          {lesson.quizPassed && lesson.assignmentSubmitted
            ? 'Revoir mon évaluation'
            : lesson.quizPassed
              ? 'Déposer le cas pratique'
              : 'Passer à l’évaluation'}
        </Link>
        <nav
          aria-label="Leçon précédente et suivante"
          className="flex flex-wrap justify-between gap-2 text-sm"
        >
          {prev ? (
            <Link
              href={`/operator/training/${prev.id}`}
              className="inline-flex min-h-11 items-center gap-1.5 font-semibold no-underline"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" /> {prev.order_index}.{' '}
              {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={`/operator/training/${next.id}`}
              className="inline-flex min-h-11 items-center gap-1.5 text-right font-semibold no-underline"
            >
              {next.order_index}. {next.title}{' '}
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          )}
        </nav>
      </div>
    </article>
  )
}
