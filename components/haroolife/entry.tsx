import { ArrowRight, Sprout } from 'lucide-react'
import Link from 'next/link'

export function HarooLifeEntry() {
  if (process.env.NEXT_PUBLIC_HAROOLIFE_ENABLED !== 'true') return null
  return (
    <Link
      href="/haroolife"
      className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <Sprout aria-hidden="true" className="h-8 w-8 shrink-0" />
      <span className="flex-1">
        <span className="block font-semibold">HarooLife · mon territoire en action</span>
        <span className="text-sm">
          Découvrez le pilote : former une équipe et regrouper les travaux.
        </span>
      </span>
      <ArrowRight aria-hidden="true" className="h-5 w-5" />
    </Link>
  )
}
