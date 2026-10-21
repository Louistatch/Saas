'use client'

/**
 * Console institution PAYG (responsable et gérants d'une FENOMAT, d'une MAPTO…).
 *
 * Un seul portefeuille pour toute l'équipe, des agents nommés avec leurs coopératives et leur
 * formation, l'activité de chacun, les rapports et l'impression. Un agent simple qui ouvre
 * cette adresse est renvoyé vers sa console de terrain : l'API refuse de toute façon.
 */

import { ProtectedRoute } from '@/app/components/protected-route'
import { ConsoleHeader, NoOperator, Notice, roleLabel } from '@/components/payg/console-shell'
import { CreditLedger, CreditsCard } from '@/components/payg/credits-card'
import { AgentsPanel } from '@/components/payg/institution-agents'
import {
  ActivityPanel,
  PrintOrdersPanel,
  ReportsPanel,
  TeamTrainingPanel,
} from '@/components/payg/institution-panels'
import { IssuedCards } from '@/components/payg/issued-cards'
import { PaymentBanner } from '@/components/payg/payment-banner'
import { usePayg } from '@/components/payg/use-payg'
import { Spinner } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Smartphone } from 'lucide-react'
import Link from 'next/link'

const TABS = [
  { value: 'team', label: 'Équipe' },
  { value: 'cards', label: 'Cartes' },
  { value: 'activity', label: 'Activité' },
  { value: 'training', label: 'Formation' },
  { value: 'print', label: 'Impression' },
  { value: 'reports', label: 'Rapports' },
] as const

function InstitutionContent() {
  const { me, error, loading, reload, switchPartner } = usePayg()
  const current = me?.current

  return (
    <div className="min-h-screen bg-background">
      <ConsoleHeader me={me} onSwitch={switchPartner} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 pb-32 pt-2 sm:px-6">
        {loading && !me ? (
          <div className="flex justify-center py-16" aria-busy="true">
            <Spinner className="h-6 w-6" />
          </div>
        ) : error && !me ? (
          <NoOperator error={error.status === 401 ? undefined : error.message} />
        ) : !me || !current ? (
          <NoOperator />
        ) : current.kind !== 'institutional' || !current.capabilities.manageAgents ? (
          <div className="mx-auto max-w-md space-y-4 py-12 text-center">
            <h1 className="text-xl font-semibold text-foreground">Console de terrain</h1>
            <p className="text-sm text-muted-foreground">
              {current.kind === 'institutional'
                ? 'La console institution est réservée au responsable et aux gérants. Vos producteurs et vos cartes sont dans votre console.'
                : 'Votre compte est un compte d’opérateur individuel : tout se fait depuis votre console.'}
            </p>
            <Button asChild className="min-h-11">
              <Link href={`/operator/console?partner=${current.partner_id}`}>
                Ouvrir ma console
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  {roleLabel(current.role)}, code {current.partner_code}
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {current.display_name}
                </h1>
              </div>
              <Button variant="outline" size="sm" className="min-h-10" asChild>
                <Link href={`/operator/console?partner=${current.partner_id}`}>
                  <Smartphone className="mr-1.5 h-4 w-4" /> Console de terrain
                </Link>
              </Button>
            </div>

            <PaymentBanner onSettled={reload} />
            {current.status !== 'active' && (
              <Notice tone="warn">
                Cette institution n’est pas encore active : l’émission de cartes ouvrira après
                activation par l’équipe FaîtièreHub.
              </Notice>
            )}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <div className="space-y-6">
                <CreditsCard me={me} />
                <CreditLedger partnerId={current.partner_id} />
              </div>
              <Tabs defaultValue="team" className="min-w-0">
                <TabsList className="flex h-auto w-full justify-start overflow-x-auto">
                  {TABS.map((t) => (
                    <TabsTrigger key={t.value} value={t.value} className="min-h-10 shrink-0">
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="team" className="pt-4">
                  <AgentsPanel me={me} />
                </TabsContent>
                <TabsContent value="cards" className="pt-4">
                  <IssuedCards
                    partnerId={current.partner_id}
                    canPrint={current.capabilities.printCards}
                    showIssuer
                    exportable
                  />
                </TabsContent>
                <TabsContent value="activity" className="pt-4">
                  <ActivityPanel partnerId={current.partner_id} />
                </TabsContent>
                <TabsContent value="training" className="pt-4">
                  <TeamTrainingPanel partnerId={current.partner_id} />
                </TabsContent>
                <TabsContent value="print" className="pt-4">
                  <PrintOrdersPanel me={me} />
                </TabsContent>
                <TabsContent value="reports" className="pt-4">
                  <ReportsPanel partnerId={current.partner_id} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default function OperatorInstitutionPage() {
  return (
    <ProtectedRoute>
      <InstitutionContent />
    </ProtectedRoute>
  )
}
