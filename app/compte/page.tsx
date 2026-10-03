'use client'

/**
 * Mon compte — le profil commun, le même pour l'espace FaîtiereHub et l'espace
 * Haroo. Une seule page, un seul formulaire d'identité.
 */

import { useAuth } from '@/app/context/auth-context'
import { MyMissions } from '@/components/account/my-missions'
import { ProfileIdentityForm } from '@/components/account/profile-identity-form'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { accountJourney, harooAction } from '@/lib/account/journey'
import Link from 'next/link'

export default function AccountPage() {
  const { user, isLoading } = useAuth()
  const haroo = harooAction(accountJourney(user))

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mon compte</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Un seul profil pour tous les services de FaîtiereHub, y compris Haroo.
          </p>
        </div>

        {isLoading ? null : !user ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 pt-6">
              <p className="text-sm text-muted-foreground">
                Connectez-vous pour voir votre profil.
              </p>
              <Button asChild>
                <Link href="/auth/login?redirect=/compte">Se connecter</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Profil</CardTitle>
                <CardDescription>Vos informations, partagées par tous les espaces.</CardDescription>
              </CardHeader>
              <CardContent>
                <ProfileIdentityForm />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mes demandes de mission</CardTitle>
                <CardDescription>
                  Missions demandées à des agronomes en scannant leur carte.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MyMissions />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Espace Haroo</CardTitle>
                <CardDescription>
                  Emplois, préventes et missions de conseil, avec la même identité.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {haroo ? (
                  <Button asChild>
                    <Link href={haroo.href}>{haroo.label}</Link>
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    L’espace Haroo s’active depuis un compte d’organisation.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MarketingLayout>
  )
}
