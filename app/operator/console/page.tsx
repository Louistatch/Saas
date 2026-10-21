'use client'

/**
 * Console de terrain PAYG : opérateur individuel, agent ou gérant d'une institution.
 *
 * L'écran suit la tournée : le solde de crédits en tête (ce qui autorise l'émission), puis
 * les producteurs de la coopérative à servir, les cartes émises, la formation et les
 * règles de données. Tout vient des API /api/payg/* ; aucune règle de prix n'est calculée
 * ici.
 */

import { ProtectedRoute } from '@/app/components/protected-route'
import { ConsoleHeader, NoOperator, Notice, roleLabel } from '@/components/payg/console-shell'
import { CreditLedger, CreditsCard } from '@/components/payg/credits-card'
import { DataPanel } from '@/components/payg/data-panel'
import { PrintOrdersPanel } from '@/components/payg/institution-panels'
import { IssuedCards } from '@/components/payg/issued-cards'
import { PaymentBanner } from '@/components/payg/payment-banner'
import { ProducersPanel } from '@/components/payg/producers-panel'
import { TrainingPanel } from '@/components/payg/training-panel'
import { usePayg } from '@/components/payg/use-payg'
import { Spinner } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

function ConsoleContent() {
  const { me, error, loading, reload, switchPartner } = usePayg()
  const [issuedKey, setIssuedKey] = useState(0)
  const current = me?.current

  const afterIssue = () => {
    setIssuedKey((k) => k + 1)
    void reload()
  }

  return (
    <div className="min-h-screen bg-background">
      <ConsoleHeader me={me} onSwitch={switchPartner} />
      <main className="mx-auto max-w-xl space-y-6 px-4 pb-32 pt-2 sm:px-6">
        {loading && !me ? (
          <div className="flex justify-center py-16" aria-busy="true">
            <Spinner className="h-6 w-6" />
          </div>
        ) : error && !me ? (
          <NoOperator error={error.status === 401 ? undefined : error.message} />
        ) : !me || !current ? (
          <NoOperator />
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  {current.kind === 'institutional'
                    ? `${roleLabel(current.role)} de l’institution`
                    : 'Opérateur individuel'}
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {current.display_name}
                </h1>
              </div>
              {current.capabilities.manageAgents && (
                <Button variant="outline" size="sm" className="min-h-10 shrink-0" asChild>
                  <Link href={`/operator/institution?partner=${current.partner_id}`}>
                    <Building2 className="mr-1.5 h-4 w-4" /> Institution
                  </Link>
                </Button>
              )}
            </div>

            <PaymentBanner onSettled={reload} />

            {current.status !== 'active' && (
              <Notice tone="warn">
                {current.kind === 'institutional'
                  ? 'Ce compte institutionnel n’est pas encore actif. L’équipe FaîtièreHub l’active après signature de la convention.'
                  : 'Votre compte opérateur n’est pas encore actif. Terminez la formation, l’évaluation et le règlement depuis votre espace opérateur.'}{' '}
                <Link href="/operator" className="font-medium underline underline-offset-2">
                  Voir mon parcours
                </Link>
              </Notice>
            )}
            {current.status === 'active' && !me.certification?.certified_at && (
              <Notice tone="warn">
                Vous pourrez émettre des cartes une fois votre certification obtenue (onglet
                Formation).
              </Notice>
            )}

            <CreditsCard me={me} />

            <Tabs defaultValue="producers">
              <TabsList className="grid h-auto w-full grid-cols-4">
                <TabsTrigger value="producers" className="min-h-10">
                  Producteurs
                </TabsTrigger>
                <TabsTrigger value="cards" className="min-h-10">
                  Cartes
                </TabsTrigger>
                <TabsTrigger value="training" className="min-h-10">
                  Formation
                </TabsTrigger>
                <TabsTrigger value="data" className="min-h-10">
                  Données
                </TabsTrigger>
              </TabsList>
              <TabsContent value="producers" className="pt-4">
                <ProducersPanel me={me} onIssued={afterIssue} />
              </TabsContent>
              <TabsContent value="cards" className="space-y-8 pt-4">
                <IssuedCards
                  partnerId={current.partner_id}
                  canPrint={current.capabilities.printCards}
                  showIssuer={current.capabilities.manageAgents}
                  exportable={current.capabilities.exportReports}
                  refreshKey={issuedKey}
                />
                {current.capabilities.seeLedger && (
                  <CreditLedger
                    key={`${current.partner_id}-${issuedKey}`}
                    partnerId={current.partner_id}
                  />
                )}
                {current.kind === 'individual' && current.capabilities.orderFaitierehubPrint && (
                  <PrintOrdersPanel me={me} />
                )}
              </TabsContent>
              <TabsContent value="training" className="pt-4">
                <TrainingPanel me={me} />
              </TabsContent>
              <TabsContent value="data" className="pt-4">
                <DataPanel me={me} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  )
}

export default function OperatorConsolePage() {
  return (
    <ProtectedRoute>
      <ConsoleContent />
    </ProtectedRoute>
  )
}
