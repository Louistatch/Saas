'use client'

import type { KnownPurchase } from '@/hooks/use-marketplace-purchases'
import { purchasePath } from '@/lib/fiches/payment-tracking'
import { AlertCircle, CheckCircle2, ChevronRight, Clock } from 'lucide-react'
import Link from 'next/link'

const STATE: Record<
  KnownPurchase['status'],
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  completed: { label: 'Payé', className: 'text-green-700', Icon: CheckCircle2 },
  pending: { label: 'En vérification', className: 'text-amber-700', Icon: Clock },
  failed: { label: 'Non abouti', className: 'text-muted-foreground', Icon: AlertCircle },
  refunded: { label: 'Remboursé', className: 'text-muted-foreground', Icon: AlertCircle },
}

function PurchaseList({
  title,
  hint,
  items,
}: {
  title: string
  hint?: string
  items: KnownPurchase[]
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-label={title}>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      <ul className="mt-2 divide-y divide-border">
        {items.map((p) => {
          const s = STATE[p.status]
          return (
            <li key={p.id}>
              <Link
                href={purchasePath(p.id)}
                className="flex min-h-[44px] items-center gap-3 py-2 text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                <s.Icon className={`h-4 w-4 shrink-0 ${s.className}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-foreground">{p.title}</span>
                <span
                  className={`shrink-0 text-xs font-medium ${s.className} ${p.status === 'pending' ? 'rounded-full bg-amber-50 px-2 py-0.5' : ''}`}
                >
                  {p.status === 'completed' ? 'Télécharger' : s.label}
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** « Mes achats » : achats du compte connecté (SaaS ou Haroo), réglés ou en vérification. */
export function MyPurchases({ items }: { items: KnownPurchase[] }) {
  if (items.length === 0) return null
  return <PurchaseList title="Mes achats" items={items} />
}

/**
 * « Achats sur cet appareil » : achats faits sans compte depuis ce navigateur
 * (gardés en local). Un achat « En vérification » ouvre sa page, qui relance
 * la vérification auprès de FedaPay.
 */
export function DevicePurchases({ items }: { items: KnownPurchase[] }) {
  if (items.length === 0) return null
  return (
    <PurchaseList
      title="Achats sur cet appareil"
      hint="Gardés dans ce navigateur. Ouvrez un achat pour retrouver son lien de téléchargement."
      items={items}
    />
  )
}
