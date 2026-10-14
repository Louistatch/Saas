'use client'

// Cadre du laboratoire (J3, spec §6) : scène du bureau en 2D (liste des objets, même panneau
// de mission que la future vue 3D). La vue 3D n'existe pas encore (jalon J5) : la bascule le
// dit, et rien n'est chargé. Le laboratoire n'écrit jamais dans la progression.
import type { LabMission, LabObject } from '@/lib/academy/lab-missions'
import { Archive, Check, FileText, Monitor, Smartphone } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const ICON: Record<LabObject['key'], typeof Monitor> = {
  computer: Monitor,
  register: FileText,
  phone: Smartphone,
  archive: Archive,
}

export function LabFrame({
  sceneTitle,
  objects,
  mission,
  lesson,
}: {
  sceneTitle: string
  objects: LabObject[]
  mission: LabMission
  lesson: { id: string; title: string; order_index: number | null }
}) {
  const [active, setActive] = useState<LabObject['key']>(mission.focus)
  const [done, setDone] = useState<number>(0)
  const current = Math.min(done, mission.steps.length - 1)
  const finished = done >= mission.steps.length
  const focusIndex = objects.findIndex((o) => o.key === mission.focus)

  return (
    <div className="flex min-h-screen flex-col bg-(--ac-ink) text-(--ac-ground)">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-(--ac-ground)/14 px-4 py-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href={`/operator/training/${lesson.id}`}
            className="shrink-0 text-[13px] font-semibold text-(--ac-pale) no-underline"
          >
            ‹ Leçon {lesson.order_index ?? ''}
          </Link>
          <h1 className="academy-display truncate text-lg font-medium sm:text-[22px]">
            Laboratoire : {sceneTitle}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-[13px] font-semibold">
          <span className="inline-flex items-center gap-2 rounded-full bg-(--ac-gold)/18 px-3 py-1.5 text-(--ac-gold)">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-(--ac-gold)" />
            Données d’exercice, rien n’est enregistré
          </span>
          <p
            aria-label="Mode d’affichage"
            className="m-0 inline-flex overflow-hidden rounded-full border border-(--ac-ground)/30"
          >
            <span aria-current="true" className="bg-(--ac-ground) px-3.5 py-2 text-(--ac-ink)">
              Vue 2D
            </span>
            <span
              className="px-3.5 py-2 text-(--ac-pale)"
              title="La vue 3D arrive au jalon J5 ; la vue 2D est l’alternative accessible."
            >
              Vue 3D : bientôt
            </span>
          </p>
        </div>
      </header>

      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section
          aria-label="Objets du bureau"
          className="flex flex-col gap-4 bg-[linear-gradient(180deg,#1C4A2E_0%,#143A24_55%,#0F2C1C_100%)] p-4 sm:p-7"
        >
          <p className="max-w-[60ch] text-sm leading-relaxed text-(--ac-pale)">
            Un bureau de coopérative fictif. Choisissez un objet pour avancer dans la mission ; la
            version 3D du même bureau arrivera au jalon suivant, avec cette même liste comme
            alternative accessible.
          </p>
          <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {objects.map((object, i) => {
              const Icon = ICON[object.key]
              const isActive = object.key === active
              const isFocus = i === focusIndex
              return (
                <li key={object.key}>
                  <button
                    type="button"
                    onClick={() => setActive(object.key)}
                    aria-pressed={isActive}
                    aria-label={`${object.label} : ${object.hint}`}
                    className={`flex min-h-[112px] w-full flex-col gap-2.5 rounded-2xl p-4 text-left transition-colors ${
                      isActive
                        ? 'bg-(--ac-ground) text-(--ac-ink)'
                        : 'bg-(--ac-ground)/10 text-(--ac-ground) hover:bg-(--ac-ground)/16'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${
                          isFocus
                            ? 'bg-(--ac-gold) text-(--ac-ink)'
                            : 'border-2 border-(--ac-gold) text-(--ac-gold)'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <strong className="text-[15px] leading-snug">{object.label}</strong>
                    <span
                      className={`text-xs ${isActive ? 'text-(--ac-muted)' : 'text-(--ac-pale)'}`}
                    >
                      {object.hint}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          <p className="mt-auto text-xs text-(--ac-pale)">
            Tab pour passer d’un objet à l’autre, Entrée pour le choisir.
          </p>
        </section>

        <aside
          aria-label="Mission en cours"
          className="flex flex-col gap-4 bg-(--ac-ground) p-5 text-(--ac-ink) sm:p-6"
        >
          <div>
            <p className="mb-1 text-[13px] font-bold text-(--ac-green)">
              Mission {mission.number} sur 3
            </p>
            <h2 className="academy-display text-[22px] font-medium leading-tight">
              {mission.title}
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-(--ac-muted)">{mission.brief}</p>
          <ol className="m-0 flex list-none flex-col gap-2 p-0 text-sm" aria-live="polite">
            {mission.steps.map((step, i) => {
              const state = i < done ? 'done' : i === current && !finished ? 'now' : 'todo'
              return (
                <li
                  key={step}
                  className={`flex items-start gap-2.5 ${
                    state === 'now' ? 'font-bold' : state === 'todo' ? 'text-(--ac-muted)' : ''
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      state === 'done'
                        ? 'bg-(--ac-gold) motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200'
                        : state === 'now'
                          ? 'border-2 border-(--ac-gold)'
                          : 'border-[1.5px] border-(--ac-line)'
                    }`}
                  >
                    {state === 'done' ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              )
            })}
          </ol>
          <div className="flex flex-col gap-1.5 rounded-[14px] border border-(--ac-line) bg-white px-4 py-3.5">
            <p className="text-[13px] font-bold">Indice</p>
            <p className="text-[13px] leading-relaxed text-(--ac-muted)">{mission.hint}</p>
          </div>
          <div className="mt-auto flex flex-col gap-2.5">
            {finished ? (
              <p
                className="rounded-full bg-(--ac-mist) px-4 py-3 text-center text-sm font-bold text-(--ac-emerald) motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200"
                aria-live="polite"
              >
                Mission parcourue. La simulation interactive arrive au jalon J5.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setDone((d) => d + 1)}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-(--ac-emerald) px-4 text-sm font-bold text-(--ac-ground)"
              >
                Étape faite : {mission.steps[current]}
              </button>
            )}
            <Link
              href={`/operator/training/${lesson.id}`}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-(--ac-line) bg-white px-4 text-sm font-semibold no-underline"
            >
              Revenir à la leçon
            </Link>
            <p className="text-center text-xs leading-relaxed text-(--ac-muted)">
              La mission ne valide pas la leçon. Seuls le quiz et le cas pratique comptent.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
