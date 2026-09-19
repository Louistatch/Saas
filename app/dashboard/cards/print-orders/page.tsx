'use client'

/**
 * Commande de cartes membres physiques (PR 3 du plan). Minimal à dessein :
 * sélection des membres, calcul du montant, paiement CinetPay. Le tableau
 * de bord complet du Partenaire (file d'impression détaillée) vit côté
 * /operator ; ceci ne prouve que le bout en bout commande → paiement.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, IdCard } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCooperative } from '@/app/context/cooperative-context'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

const UNIT_PRICE_FCFA = 2000

interface EligibleMember {
  id: string
  first_name: string
  last_name: string
}

export default function CardPrintOrdersPage() {
  const { currentCooperative } = useCooperative()
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const [members, setMembers] = useState<EligibleMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!currentCooperative) return
    setIsLoading(true)
    supabase
      .from('member_cards')
      .select('member_id, members(id, first_name, last_name)')
      .eq('cooperative_id', currentCooperative.id)
      .eq('card_type', 'FAITIERE')
      .eq('status', 'active')
      .then(({ data }) => {
        const rows = (data ?? []).flatMap((r) => {
          const m = r.members as unknown as EligibleMember | EligibleMember[] | null
          if (!m) return []
          return Array.isArray(m) ? m : [m]
        })
        setMembers(rows)
        setIsLoading(false)
      })
  }, [currentCooperative, supabase])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const total = selected.size * UNIT_PRICE_FCFA

  const submit = async () => {
    if (!currentCooperative || selected.size === 0 || !phone.trim()) return
    setSubmitting(true)
    try {
      const createRes = await fetch('/api/cards/print-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cooperative_id: currentCooperative.id,
          member_ids: [...selected],
        }),
      })
      const createBody = await createRes.json().catch(() => ({}))
      if (!createRes.ok) {
        toast({
          title: 'Commande impossible',
          description: createBody.error ?? '—',
          variant: 'destructive',
        })
        setSubmitting(false)
        return
      }

      const payRes = await fetch(`/api/cards/print-orders/${createBody.order_id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const payBody = await payRes.json().catch(() => ({}))
      if (!payRes.ok || !payBody.payment_url) {
        toast({
          title: 'Paiement impossible',
          description: payBody.error ?? '—',
          variant: 'destructive',
        })
        setSubmitting(false)
        return
      }
      window.location.href = payBody.payment_url
    } catch {
      toast({ title: 'Erreur de connexion', variant: 'destructive' })
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartes membres physiques"
        description="2 000 FCFA par carte — 500 FCFA reviennent à la coopérative, 1 500 FCFA au Partenaire qui imprime et livre."
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/cards">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Membres éligibles</CardTitle>
          <CardDescription>
            Seuls les membres avec une carte numérique active peuvent recevoir une carte physique.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingBlock />
          ) : members.length === 0 ? (
            <EmptyState icon={IdCard} title="Aucun membre avec carte numérique active" />
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {members.map((m) => (
                <label
                  key={m.id}
                  htmlFor={`member-${m.id}`}
                  className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-accent/5"
                >
                  <input
                    id={`member-${m.id}`}
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggle(m.id)}
                    className="h-4 w-4 rounded border-input"
                  />
                  {m.first_name} {m.last_name}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-2xl font-bold text-foreground">
              {selected.size} carte(s) — {total.toLocaleString('fr-FR')} FCFA
            </p>
            <div className="space-y-2">
              <Label htmlFor="order-phone">Numéro mobile money</Label>
              <Input
                id="order-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+228 90 00 00 00"
              />
            </div>
            <Button onClick={submit} disabled={submitting || !phone.trim()} className="w-full">
              {submitting ? (
                <Spinner className="h-4 w-4" />
              ) : (
                `Payer ${total.toLocaleString('fr-FR')} FCFA`
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
