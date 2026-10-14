import { type LearnerLesson, STATE_LABEL } from '@/lib/academy/learner-view'
import { Check, ChevronDown } from 'lucide-react'
// Liste des leçons du lecteur : colonne fixe sur ordinateur, tiroir replié sur téléphone
// (details natif, sans JavaScript). Aucune leçon n'est verrouillée : l'ordre est conseillé.
import Link from 'next/link'

function Rows({ lessons, currentId }: { lessons: LearnerLesson[]; currentId: string }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-0.5 p-0 text-sm">
      {lessons.map((lesson) => {
        const current = lesson.id === currentId
        return (
          <li key={lesson.id}>
            <Link
              href={`/operator/training/${lesson.id}`}
              aria-current={current ? 'page' : undefined}
              className={`grid min-h-11 grid-cols-[26px_1fr] items-center gap-2.5 rounded-[10px] px-3 py-1.5 no-underline ${
                current ? 'bg-(--ac-emerald) text-(--ac-ground)' : 'text-(--ac-ink)'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  lesson.state === 'completed'
                    ? 'bg-(--ac-gold) text-(--ac-ink)'
                    : current
                      ? 'border-2 border-(--ac-gold) text-(--ac-gold)'
                      : 'border-[1.5px] border-(--ac-line) text-(--ac-muted)'
                }`}
              >
                {lesson.state === 'completed' ? <Check className="h-3 w-3" /> : lesson.order_index}
              </span>
              <span className="min-w-0">
                <span className="block truncate">
                  {lesson.order_index}. {lesson.title}
                </span>
                <span
                  className={`block text-xs ${current ? 'text-(--ac-pale)' : 'text-(--ac-muted)'}`}
                >
                  {STATE_LABEL[lesson.state]}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

export function LessonList({
  lessons,
  currentId,
  moduleTitle,
}: {
  lessons: LearnerLesson[]
  currentId: string
  moduleTitle: string
}) {
  const done = lessons.filter((l) => l.state === 'completed').length
  const current = lessons.find((l) => l.id === currentId)
  return (
    <>
      <aside
        aria-label="Leçons du module"
        className="hidden w-[300px] shrink-0 flex-col border-r border-(--ac-line) bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto"
      >
        <div className="border-b border-(--ac-line) px-5 pt-6 pb-4">
          <Link
            href="/operator/training"
            className="text-[13px] font-semibold text-(--ac-muted) no-underline"
          >
            ‹ Accueil
          </Link>
          <p className="academy-display mt-2 mb-1 text-xl font-semibold">{moduleTitle}</p>
          <p className="text-[13px] text-(--ac-muted)">
            {lessons.length} leçons, {done} validée{done > 1 ? 's' : ''}
          </p>
        </div>
        <div className="px-2.5 py-3">
          <Rows lessons={lessons} currentId={currentId} />
        </div>
        <p className="mt-auto border-t border-(--ac-line) px-5 py-4 text-[13px] leading-relaxed text-(--ac-muted)">
          Chaque leçon s’ouvre librement. L’ordre conseillé suit le travail réel d’un opérateur.
        </p>
      </aside>

      <details className="group border-b border-(--ac-line) bg-white lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
          <Link
            href="/operator/training"
            aria-label="Accueil AgriAcademy"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-(--ac-line) text-lg no-underline"
          >
            ‹
          </Link>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-(--ac-muted)">
              Leçon {current?.order_index ?? ''} sur {lessons.length}
            </span>
            <span className="block truncate text-[15px] font-bold">{current?.title}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="max-h-[60vh] overflow-y-auto px-2.5 pb-3">
          <Rows lessons={lessons} currentId={currentId} />
        </div>
      </details>
    </>
  )
}
