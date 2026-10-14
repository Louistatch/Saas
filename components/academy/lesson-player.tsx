'use client'

// Lecteur de leçon (J3, spec §5) : une diapositive à la fois, position mémorisée sur l'appareil
// (localStorage, sans migration), texte long repliable, puis quiz et cas pratique. Les
// formulaires de quiz et de dépôt sont fournis par la page serveur (slots) et restent ceux
// de J2 : le serveur garde seul la règle de validation.
import type { AcademyLessonWithContent } from '@/types/domain'
import { ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useEffect, useState } from 'react'

const SLIDE_TYPE_LABEL: Record<string, string> = {
  objective: 'Objectif',
  concept: 'Concept',
  screenshot: 'Capture d’écran',
  procedure: 'Procédure',
  warning: 'Attention',
  case: 'Cas pratique',
  summary: 'Résumé',
}

const storageKey = (lessonId: string) => `academy:slide:${lessonId}`

function readSlide(lessonId: string, max: number): number {
  try {
    const raw = window.localStorage.getItem(storageKey(lessonId))
    const n = raw == null ? 0 : Number.parseInt(raw, 10)
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0
  } catch {
    return 0
  }
}

function writeSlide(lessonId: string, index: number) {
  try {
    window.localStorage.setItem(storageKey(lessonId), String(index))
  } catch {
    // stockage indisponible (navigation privée) : la position n'est simplement pas gardée
  }
}

function SlideMedia({ slide }: { slide: AcademyLessonWithContent['slides'][number] }) {
  const asset = slide.media_asset
  const path = asset?.storage_path ?? ''
  const ready = asset?.status === 'ready' && (path.startsWith('http') || path.startsWith('/'))
  if (ready) {
    return (
      <img
        src={path}
        alt={asset?.alt_text ?? ''}
        loading="lazy"
        className="w-full max-w-[420px] rounded-xl border border-(--ac-line) bg-white shadow-[0_12px_30px_rgba(16,38,26,0.08)]"
      />
    )
  }
  // Cadre d'application stylisé tant que la capture réelle n'est pas produite (E3, J4).
  return (
    <div className="w-full max-w-[420px]">
      <div
        aria-hidden="true"
        className="flex aspect-[16/10] flex-col overflow-hidden rounded-xl border border-(--ac-line) bg-white shadow-[0_12px_30px_rgba(16,38,26,0.08)]"
      >
        <div
          className="flex h-8 items-center px-3 text-xs font-semibold text-(--ac-ground)"
          style={{ background: 'var(--ac-emerald)' }}
        >
          FaîtiereHub
        </div>
        <div className="flex flex-1 flex-col gap-2.5 p-4">
          <div className="h-3 w-2/5 rounded-md bg-(--ac-line)" />
          <div className="h-8 rounded-lg border-[1.5px] border-(--ac-green)" />
          <div className="h-3 w-1/2 rounded-md bg-(--ac-line)" />
          <div className="h-8 rounded-lg border border-(--ac-line)" />
          <div className="mt-auto h-7 w-28 self-end rounded-full bg-(--ac-gold)" />
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-(--ac-muted)">
        <ImageIcon aria-hidden="true" className="h-3.5 w-3.5" />
        {asset?.alt_text
          ? `${asset.alt_text} : capture d’écran réelle à produire`
          : 'Capture d’écran réelle à produire'}
      </p>
    </div>
  )
}

export function LessonPlayer({
  lesson,
  position,
  gates,
  prev,
  next,
  quiz,
  assignment,
}: {
  lesson: AcademyLessonWithContent
  position: { index: number; total: number }
  gates: { quizPassed: boolean; assignmentSubmitted: boolean }
  prev: { id: string; title: string } | null
  next: { id: string; title: string } | null
  quiz: ReactNode
  assignment: ReactNode
}) {
  const slides = lesson.slides
  const last = Math.max(slides.length - 1, 0)
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState<'next' | 'prev'>('next')

  useEffect(() => {
    setIndex(readSlide(lesson.id, last))
  }, [lesson.id, last])

  const go = (to: number) => {
    const bounded = Math.min(Math.max(to, 0), last)
    setDirection(bounded >= index ? 'next' : 'prev')
    setIndex(bounded)
    writeSlide(lesson.id, bounded)
  }

  const slide = slides[index]
  const onLast = index >= last
  const stepPill = (label: string, state: 'done' | 'current' | 'todo', href: string) => (
    <a
      href={href}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold no-underline ${
        state === 'current'
          ? 'bg-(--ac-mist) text-(--ac-emerald)'
          : state === 'done'
            ? 'bg-(--ac-gold) text-(--ac-ink)'
            : 'border border-(--ac-line) text-(--ac-muted)'
      }`}
    >
      {label}
    </a>
  )

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-sm text-(--ac-muted)">
            Leçon {position.index} sur {position.total}
            {lesson.duration_min ? `, environ ${lesson.duration_min} min` : ''}
          </p>
          <h1 className="academy-display text-[26px] font-medium leading-tight sm:text-[30px]">
            {lesson.title}
          </h1>
        </div>
        <nav aria-label="Étapes de la leçon" className="flex flex-wrap gap-2">
          {stepPill('Cours', 'current', '#cours')}
          {lesson.quiz && stepPill('Quiz', gates.quizPassed ? 'done' : 'todo', '#quiz')}
          {lesson.assignment &&
            stepPill('Cas pratique', gates.assignmentSubmitted ? 'done' : 'todo', '#cas-pratique')}
        </nav>
      </header>

      <section
        id="cours"
        aria-label={slides.length > 0 ? `Diapositive ${index + 1} sur ${slides.length}` : 'Cours'}
        className="flex flex-col overflow-hidden rounded-[20px] border border-(--ac-line) bg-white"
      >
        {slide ? (
          <div
            key={slide.id}
            className={`grid min-h-[340px] md:grid-cols-2 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-safe:ease-out ${
              direction === 'next'
                ? 'motion-safe:slide-in-from-right-2'
                : 'motion-safe:slide-in-from-left-2'
            }`}
          >
            <div className="order-2 flex flex-col justify-center gap-3.5 px-6 py-7 md:order-1 md:px-9">
              <p className="text-[13px] font-bold text-(--ac-green)">
                {index + 1} / {slides.length}
                <span className="ml-2 font-semibold text-(--ac-muted)">
                  {SLIDE_TYPE_LABEL[slide.slide_type] ?? slide.slide_type}
                </span>
              </p>
              <h2 className="academy-display text-[22px] font-medium leading-tight sm:text-2xl">
                {slide.title}
              </h2>
              <p className="max-w-[48ch] whitespace-pre-wrap text-[15px] leading-relaxed">
                {slide.body}
              </p>
            </div>
            <div className="order-1 flex items-center justify-center bg-(--ac-mist) p-5 md:order-2 md:p-7">
              <SlideMedia slide={slide} />
            </div>
          </div>
        ) : (
          <p className="px-6 py-10 text-sm text-(--ac-muted)">
            Les diapositives de cette leçon sont en préparation. Le texte complet est ci-dessous.
          </p>
        )}
        {slides.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--ac-line) px-4 py-3.5 sm:px-5">
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-(--ac-line) px-4 text-sm font-semibold disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Précédente
            </button>
            <div aria-hidden="true" className="hidden gap-1.5 sm:flex">
              {slides.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1.5 w-5 rounded-full ${i <= index ? 'bg-(--ac-emerald)' : 'bg-(--ac-line)'}`}
                />
              ))}
            </div>
            {onLast ? (
              <a
                href={lesson.quiz ? '#quiz' : '#cas-pratique'}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-(--ac-gold) px-5 text-sm font-bold text-(--ac-ink) no-underline"
              >
                {lesson.quiz ? 'Passer au quiz' : 'Passer au cas pratique'}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => go(index + 1)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-(--ac-emerald) px-5 text-sm font-bold text-(--ac-ground)"
              >
                Diapositive suivante <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </section>

      {lesson.content_body && (
        <details className="group rounded-2xl border border-(--ac-line) bg-white">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 text-[15px] font-bold [&::-webkit-details-marker]:hidden">
            Lire la leçon complète
            <ChevronRight
              aria-hidden="true"
              className="h-4 w-4 transition-transform group-open:rotate-90"
            />
          </summary>
          <div className="max-w-[70ch] whitespace-pre-wrap px-5 pb-6 text-[15px] leading-relaxed">
            {lesson.content_body}
          </div>
        </details>
      )}

      {lesson.quiz && (
        <section id="quiz" aria-label="Quiz" className="scroll-mt-4">
          {quiz}
        </section>
      )}

      {lesson.assignment && (
        <section id="cas-pratique" aria-label="Cas pratique" className="scroll-mt-4">
          {gates.quizPassed ? (
            assignment
          ) : (
            <div className="flex flex-col gap-2.5 rounded-2xl border border-(--ac-line) bg-white px-5 py-5">
              <h2 className="text-base font-bold">Cas pratique</h2>
              <p className="text-sm leading-relaxed text-(--ac-muted)">
                {lesson.assignment.instructions}
              </p>
              <span className="inline-flex min-h-11 items-center self-start rounded-full border border-(--ac-line) px-4 text-sm font-semibold text-(--ac-muted)">
                Disponible après le quiz
              </span>
            </div>
          )}
        </section>
      )}

      <nav
        aria-label="Leçon précédente et suivante"
        className="flex flex-wrap justify-between gap-2"
      >
        {prev ? (
          <Link
            href={`/operator/training/${prev.id}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-(--ac-line) bg-white px-4 text-sm font-semibold no-underline"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" /> {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={`/operator/training/${next.id}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-(--ac-line) bg-white px-4 text-sm font-semibold no-underline"
          >
            {next.title} <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}
      </nav>
    </div>
  )
}
