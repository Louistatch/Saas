import type { LessonBlock } from '@/lib/academy/lesson-text'
// Rendu du texte long d'une leçon : blocs sémantiques (h2, p, ul, ol, cases à cocher), jamais
// de HTML injecté. Typographie d'étude : 70 caractères par ligne au plus, interligne généreux.
import { Square } from 'lucide-react'

export function LessonText({ blocks }: { blocks: LessonBlock[] }) {
  return (
    <div className="flex max-w-[68ch] flex-col gap-3 text-[16px] leading-[1.65]">
      {blocks.map((block, i) => {
        const key = `${block.kind}-${i}`
        if (block.kind === 'heading') {
          return (
            <h2
              key={key}
              className="academy-display mt-5 text-[22px] font-medium leading-tight first:mt-0"
            >
              {block.number != null && (
                <span className="mr-2 text-(--ac-gold)" aria-hidden="true">
                  {block.number}.
                </span>
              )}
              {block.text}
            </h2>
          )
        }
        if (block.kind === 'paragraph') {
          return (
            <p key={key} className="m-0">
              {block.text}
            </p>
          )
        }
        if (block.ordered) {
          return (
            <ol
              key={key}
              className="m-0 flex list-decimal flex-col gap-1.5 pl-6 marker:font-semibold marker:text-(--ac-green)"
            >
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          )
        }
        if (block.checklist) {
          return (
            <ul key={key} className="m-0 flex list-none flex-col gap-1.5 p-0">
              {block.items.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <Square
                    aria-hidden="true"
                    className="mt-[5px] h-4 w-4 shrink-0 text-(--ac-green)"
                  />
                  {item}
                </li>
              ))}
            </ul>
          )
        }
        return (
          <ul
            key={key}
            className="m-0 flex list-disc flex-col gap-1.5 pl-5 marker:text-(--ac-gold)"
          >
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )
      })}
    </div>
  )
}
