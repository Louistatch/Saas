'use client'

import { useAuth } from '@/app/context/auth-context'
import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

interface MyPurchase {
  id: string
  paid_at: string | null
  fiches_techniques: { title: string } | null
}

/** « Mes achats » : même liste pour un compte SaaS ou Haroo (un seul compte, un seul achat). */
export function MyPurchases() {
  const { user } = useAuth()
  const [items, setItems] = useState<MyPurchase[]>([])

  useEffect(() => {
    if (!user) return
    fetch('/api/purchases/mine')
      .then((r) => (r.ok ? r.json() : { purchases: [] }))
      .then((j) => setItems(j.purchases ?? []))
      .catch(() => {})
  }, [user])

  if (!user || items.length === 0) return null
  return (
    <section className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
      <h2 className="mb-2 text-sm font-semibold text-green-900">Mes achats</h2>
      <ul className="space-y-1.5">
        {items.map((p) => (
          <li key={p.id}>
            <Link
              href={`/marketplace/achat/${p.id}`}
              className="flex items-center gap-2 text-sm text-green-900 hover:underline"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700" />
              <span className="truncate">
                {p.fiches_techniques?.title ?? "Compte d'exploitation"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
