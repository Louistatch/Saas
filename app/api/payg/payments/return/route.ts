// Retour de la page FedaPay pour un paiement PAYG (crédits, formation, impression). Le statut
// de l'URL est ignoré : l'intention est réglée d'après la transaction relue chez FedaPay.

import { settlePaygIntent } from '@/lib/payg/payments'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const intent = url.searchParams.get('intent') ?? ''
  if (!UUID.test(intent)) return NextResponse.redirect(`${url.origin}/operator/console`)
  const state = await settlePaygIntent(createAdminClient(), intent)
  return NextResponse.redirect(`${url.origin}/operator/console?payment=${state}&ref=${intent}`)
}
