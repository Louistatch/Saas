'use client'

// « Voir comme » : le super_admin ouvre l'espace d'une coopérative, d'un opérateur ou de Haroo
// pour voir exactement ce que voit chaque rôle. Rien n'est modifié sur le compte.
import { useCooperative } from '@/app/context/cooperative-context'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

export const VIEW_AS_SPACES = [
  { href: '/dashboard', label: 'Coopérative', hint: 'Tableau de bord d’une coopérative choisie' },
  {
    href: '/operator',
    label: 'Opérateur',
    hint: 'Espace opérateur : dossiers, messages, formation',
  },
  { href: '/haroo', label: 'Professionnel Haroo', hint: 'Ouvrier, acheteur ou agronome' },
  { href: '/haroolife', label: 'HarooLife', hint: 'Le village, côté producteur et ouvrier' },
] as const

/** Ouvre le tableau de bord d'une organisation (liste rechargée : une organisation créée à l'instant est trouvée). */
export function useOpenCooperative() {
  const { refreshCooperatives } = useCooperative()
  const router = useRouter()
  return useCallback(
    async (cooperativeId: string, path = '/dashboard') => {
      try {
        window.localStorage.setItem('current_coop_id', cooperativeId)
      } catch {
        // stockage indisponible : la liste rechargée retombe sur la première organisation
      }
      await refreshCooperatives()
      router.push(path)
    },
    [refreshCooperatives, router],
  )
}

export function ViewAsPanel() {
  const { cooperatives } = useCooperative()
  const openCooperative = useOpenCooperative()
  const [coopId, setCoopId] = useState('')
  const [busy, setBusy] = useState(false)
  const sorted = [...cooperatives].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  return (
    <section aria-labelledby="viewas-title" className="space-y-3">
      <h2 id="viewas-title" className="text-lg font-semibold text-foreground">
        Voir comme
      </h2>
      <p className="text-sm text-muted-foreground">
        Ouvrez l’espace de chaque rôle pour voir ce qu’il voit et agir à sa place.
      </p>
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1 text-sm font-medium text-foreground">
          Coopérative, union ou faîtière
          <select
            value={coopId}
            onChange={(e) => setCoopId(e.target.value)}
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
          >
            <option value="">Choisir une organisation</option>
            {sorted.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!coopId || busy}
          onClick={async () => {
            setBusy(true)
            await openCooperative(coopId)
          }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Ouverture…' : 'Ouvrir son tableau de bord'}
        </button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {VIEW_AS_SPACES.slice(1).map((s) => (
          <li key={s.href}>
            <a
              href={s.href}
              className="block rounded-xl border border-border bg-card px-4 py-3 hover:border-primary"
            >
              <span className="block text-sm font-medium text-foreground">{s.label}</span>
              <span className="block text-xs text-muted-foreground">{s.hint}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
