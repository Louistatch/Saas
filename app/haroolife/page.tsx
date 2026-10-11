import { TogoLife } from '@/components/haroolife/togo-life'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'HarooLife — La vie agricole du Togo' }

export default function HarooLifePage() {
  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#1F2A44]">
      <header className="border-b border-emerald-900/10 bg-white px-5 py-4">
        <nav
          aria-label="Navigation HarooLife"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 text-sm"
        >
          <Link href="/" className="w-full font-bold text-emerald-900 sm:mr-auto sm:w-auto">
            FaîtiereHub <span className="font-normal">/ HarooLife</span>
          </Link>
          <Link href="/dashboard">Mon tableau de bord</Link>
          <Link href="/haroo">Mon espace Haroo</Link>
          <Link href="/marche">Le marché</Link>
          <Link href="/haroolife/territoire/lome" className="font-semibold text-emerald-800">
            Lomé Life 3D
          </Link>
          <Link href="/haroolife/territoire" className="font-semibold text-emerald-800">
            Simulateur du Togo
          </Link>
        </nav>
      </header>
      {process.env.HAROOLIFE_ENABLED === 'true' ? (
        <TogoLife />
      ) : (
        <main className="mx-auto max-w-2xl space-y-5 px-5 py-16">
          <p className="text-sm font-semibold text-emerald-700">HAROOLIFE</p>
          <h1 className="text-3xl font-bold">Votre territoire agricole, en action.</h1>
          <p>
            Votre canton, vos voisins producteurs et ouvriers, le marché et le ciel : ce nouvel
            espace est en préparation.
          </p>
          <p>Vos cartes, vos annonces et vos services FaîtiereHub restent accessibles.</p>
          <p>
            Vous pouvez déjà essayer le simulateur économique fictif du Togo, sans toucher aux
            données réelles.
          </p>
          <Link
            href="/haroolife/territoire"
            className="inline-block rounded-xl border border-emerald-900 px-5 py-3 font-semibold text-emerald-900"
          >
            Explorer le Togo en simulation
          </Link>
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
