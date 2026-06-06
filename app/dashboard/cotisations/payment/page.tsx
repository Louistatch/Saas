'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, CreditCard, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface InitiateResponse {
  success?: boolean
  paymentUrl?: string
  reference?: string
  error?: string
}

const PROVIDERS = [
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'tmoney', label: 'TMoney' },
  { value: 'moov', label: 'Moov Money' },
  { value: 'cash', label: 'Espèces' },
]

export default function PaymentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const memberId = searchParams.get('member_id') ?? ''
  const cotisationId = searchParams.get('cotisation_id') ?? ''
  const amount = Number(searchParams.get('amount') ?? '0')
  const cooperativeId = searchParams.get('cooperative_id') ?? ''

  const [phone, setPhone] = useState('')
  const [provider, setProvider] = useState('orange_money')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formatAmount = (n: number) =>
    new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (!memberId || !cooperativeId || amount <= 0) {
      setError('Paramètres de paiement invalides.')
      return
    }

    if (provider !== 'cash' && !phone.trim()) {
      setError('Veuillez saisir un numéro de téléphone.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: memberId,
          cotisation_id: cotisationId || undefined,
          amount_fcfa: amount,
          phone: phone.trim(),
          provider,
          cooperative_id: cooperativeId,
        }),
      })

      const data = (await res.json()) as InitiateResponse

      if (!res.ok || data.error) {
        setError(data.error ?? 'Erreur lors de l\'initiation du paiement.')
        return
      }

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl
        return
      }

      // Cash or non-redirect provider
      toast({
        title: 'Paiement enregistré',
        description: `Référence: ${data.reference ?? ''}`,
      })
      router.push('/dashboard/cotisations')
    } catch {
      setError('Une erreur réseau est survenue. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 py-8 px-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/cotisations">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
        </Link>
        <h1 className="text-xl font-semibold text-foreground">Paiement de cotisation</h1>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Initier un paiement
          </CardTitle>
          <CardDescription>Choisissez votre moyen de paiement et confirmez</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Amount display */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
              <span className="text-sm text-muted-foreground">Montant à payer</span>
              <Badge variant="secondary" className="text-base font-bold px-3 py-1">
                {formatAmount(amount)}
              </Badge>
            </div>

            {/* Provider select */}
            <div className="space-y-2">
              <Label htmlFor="provider">Mode de paiement</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger id="provider">
                  <SelectValue placeholder="Choisir un mode" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Phone input — hidden for cash */}
            {provider !== 'cash' && (
              <div className="space-y-2">
                <Label htmlFor="phone">
                  Numéro de téléphone <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+22890000000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
                <p className="text-xs text-muted-foreground">Format: +228XXXXXXXX</p>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Link href="/dashboard/cotisations" className="flex-1">
                <Button variant="outline" className="w-full" type="button" disabled={loading}>
                  Annuler
                </Button>
              </Link>
              <Button
                type="submit"
                className="flex-1 bg-primary hover:bg-primary/90 gap-2"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {provider === 'cash' ? 'Confirmer en espèces' : 'Payer maintenant'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
