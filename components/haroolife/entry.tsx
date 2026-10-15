import { ArrowRight, MapPinned } from 'lucide-react'
import Link from 'next/link'

export function HarooLifeEntry() {
  if (process.env.NEXT_PUBLIC_HAROOLIFE_ENABLED !== 'true') return null
  return (
    <Link
      href="/haroolife"
      // Le monde 3D est lourd : on ne le précharge pas depuis le tableau de bord, il se charge au clic.
      prefetch={false}
      className="group relative flex min-h-48 overflow-hidden rounded-[1.5rem] border border-emerald-100 bg-emerald-50 bg-cover bg-center p-6 text-emerald-950 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 sm:min-h-52 sm:p-8"
      style={{ backgroundImage: "url('/images/dashboard/haroolife-territory.webp')" }}
    >
      <span className="absolute inset-0 bg-gradient-to-r from-[#fffdf2] via-[#fffdf2]/95 to-transparent sm:via-[#fffdf2]/75" />
      <span className="relative z-10 flex max-w-md flex-col items-start justify-center">
        <span className="block text-2xl font-bold">HarooLife · Votre territoire</span>
        <span className="mt-2 text-sm leading-relaxed text-emerald-900/75 sm:text-base">
          Découvrez la carte de votre coopérative, formez une équipe et regroupez vos travaux.
        </span>
        <span className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-800 px-5 font-semibold text-white transition group-hover:bg-emerald-900 group-active:scale-[0.98]">
          <MapPinned className="h-5 w-5" /> Ouvrir
        </span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="absolute bottom-8 right-8 h-6 w-6 text-emerald-800 transition-transform group-hover:translate-x-1"
      />
    </Link>
  )
}
