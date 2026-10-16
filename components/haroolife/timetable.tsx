/**
 * The university's timetable for the game day, in the place sheet: four two-hour lectures, the
 * lunch break, the lecture running now highlighted. The rules live in lib/haroolife/city/university.ts.
 */
import { SLOTS, TIMETABLE, WEEKDAYS, sessionAt, weekday } from '@/lib/haroolife/city/university'

export default function Timetable({ day, hour }: { day: number; hour: number }) {
  const row = TIMETABLE[weekday(day)]
  const now = sessionAt(day, hour)
  return (
    <section aria-label="Emploi du temps" className="space-y-1" data-testid="timetable">
      <p className="text-xs font-bold text-slate-700">Emploi du temps · {WEEKDAYS[weekday(day)]}</p>
      {row.every((c) => !c) ? (
        <p className="rounded-xl bg-slate-50 p-2 text-xs text-slate-600">
          Pas de cours aujourd’hui. Les cours reprennent lundi à 8 h.
        </p>
      ) : (
        <ol className="space-y-1">
          {SLOTS.map((start, slot) => {
            const course = row[slot]
            const current = now?.slot === slot
            return (
              <li
                key={start}
                aria-current={current ? 'true' : undefined}
                className={`flex items-baseline gap-2 rounded-xl px-2 py-1.5 text-xs ${
                  current
                    ? 'bg-emerald-100 font-bold text-emerald-900'
                    : 'bg-slate-50 text-slate-700'
                }`}
              >
                <span className="w-16 shrink-0 tabular-nums">
                  {start} h–{start + 2} h
                </span>
                <span className="min-w-0 flex-1">
                  {course ? `${course.title} · ${course.lecturer.name}` : 'Pas de cours'}
                  {current ? ' · en cours' : ''}
                </span>
              </li>
            )
          }).flatMap((li, i) =>
            i === 2
              ? [
                  <li key="lunch" className="px-2 text-[11px] text-slate-500">
                    12 h–14 h · pause déjeuner
                  </li>,
                  li,
                ]
              : [li],
          )}
        </ol>
      )}
    </section>
  )
}
