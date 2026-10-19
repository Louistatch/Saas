import { buildWebhookUrl, mergeKoboConfig } from '@/lib/kobo/config'
import { generateWebhookSecret, hashWebhookSecret } from '@/lib/kobo/webhook-auth'
import { assertFaitiereAccess, assertTenantAccess } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import { cooperativeIdParam } from '@/lib/validators/kobo'
/**
 * POST /api/integrations/kobo/webhook-secret — génère ou fait pivoter le secret du webhook
 * de l'intégration Kobo d'une coopérative.
 *
 * Body: { cooperativeId: uuid }
 *
 * Le secret est renvoyé UNE SEULE FOIS dans la réponse ; seul son hash SHA-256 est stocké
 * (config.webhook_secret_hash). L'ancien secret cesse immédiatement de fonctionner : il faut
 * mettre à jour l'en-tête dans KoboToolbox → REST Services.
 *
 * Dans KoboToolbox (Paramètres du projet → REST Services), deux façons de présenter le secret :
 *   - « En-têtes HTTP personnalisés » : X-Kobo-Secret = <secret> ;
 *   - ou Authentification de base : mot de passe = <secret> (identifiant libre).
 * KoboToolbox ne signe jamais ses requêtes (pas de HMAC).
 *
 * @security assertFaitiereAccess + assertTenantAccess
 * @security Aucun secret en clair n'est stocké ni journalisé.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const log = createLogger('api:integrations:kobo:webhook-secret')

const bodySchema = z.object({ cooperativeId: cooperativeIdParam })

export async function POST(request: NextRequest) {
  const authResult = await assertFaitiereAccess()
  if (!authResult.ok) return authResult.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid cooperativeId' }, { status: 400 })
  const { cooperativeId } = parsed.data

  const tenantResult = await assertTenantAccess(cooperativeId)
  if (!tenantResult.ok) return tenantResult.response

  const admin = createAdminClient()
  const { data: integration } = await admin
    .from('integrations')
    .select('id, config')
    .eq('cooperative_id', cooperativeId)
    .eq('type', 'kobo')
    .maybeSingle()

  if (!integration) {
    return NextResponse.json(
      { error: "Configurez d'abord l'intégration KoboToolbox (token et Form ID)." },
      { status: 404 },
    )
  }

  const secret = generateWebhookSecret()
  const { error } = await admin
    .from('integrations')
    .update({
      config: mergeKoboConfig(integration.config, {
        webhook_secret_hash: hashWebhookSecret(secret),
      }),
    })
    .eq('id', integration.id)

  if (error) {
    log.error('Failed to store webhook secret hash', { error: error.message, cooperativeId })
    return NextResponse.json({ error: 'Impossible de générer le secret' }, { status: 500 })
  }

  log.info('Kobo webhook secret rotated', { cooperativeId })

  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(
    /\/$/,
    '',
  )
  return NextResponse.json({
    ok: true,
    webhookUrl: buildWebhookUrl(appOrigin, integration.id as string),
    // Affiché une seule fois : seul le hash est conservé.
    webhookSecret: secret,
  })
}
