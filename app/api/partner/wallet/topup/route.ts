// Ancien rechargement en FCFA du portefeuille Partenaire, par CinetPay : fermé par la refonte
// PAYG. Les opérateurs achètent désormais des crédits, uniquement par FedaPay
// (/api/payg/credits/checkout), réglés automatiquement (notification, retour, relecture
// quotidienne /api/cron/payg-reconcile). Le callback CinetPay reste en place pour régler une
// éventuelle tentative déjà lancée ; aucune nouvelle n'est créée ici.

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Le rechargement en FCFA est remplacé par les crédits : achetez un pack depuis votre console (paiement FedaPay).',
    },
    { status: 410 },
  )
}
