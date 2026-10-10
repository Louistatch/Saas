import { HarooLifeWorkspace } from '@/components/haroolife/workspace'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'HarooLife — Mon territoire en action' }

export default function HarooLifePage() {
  return (
    <div className="min-h-screen bg-[#f6f7ef] text-slate-900">
      <header className="border-b border-emerald-900/10 bg-white px-5 py-4">
        <nav
          aria-label="Navigation HarooLife"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-5 text-sm"
        >
          <Link href="/" className="mr-auto font-bold text-emerald-900">
            FaîtiereHub <span className="font-normal">/ HarooLife</span>
          </Link>
          <Link href="/dashboard">Mon organisation</Link>
          <Link href="/haroo">Mon espace Haroo</Link>
          <Link href="/marche">Le marché</Link>
        </nav>
      </header>
      {process.env.HAROOLIFE_ENABLED === 'true' ? (
        <HarooLifeWorkspace />
      ) : (
        <main className="mx-auto max-w-2xl space-y-5 px-5 py-16">
          <p className="text-sm font-semibold text-emerald-700">HAROOLIFE</p>
          <h1 className="text-3xl font-bold">Votre territoire agricole, en action.</h1>
          <p>Former une équipe et regrouper les travaux : ce nouvel espace est en préparation.</p>
          <p>Vos cartes, vos annonces et vos services FaîtiereHub restent accessibles.</p>
          <Link
            href="/haroo"
            className="inline-block rounded-xl bg-emerald-900 px-5 py-3 font-semibold text-white"
          >
            Retrouver mes services
          </Link>
        </main>
      )}
    </div>
  )
}
