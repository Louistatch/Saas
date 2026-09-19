import { createHash, randomUUID } from 'node:crypto'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Trafic du site, suivi maison (§ demande admin : « mon propre code », puis
 * « reconnaître le visiteur et sa position »). Route publique — appelée par
 * tout visiteur, connecté ou non, jamais gardée par assertRole.
 *
 * Identité : cookie httpOnly de première partie `fh_vid` (uuid, 2 ans),
 * généré ici s'il est absent — c'est lui qui permet de reconnaître un
 * visiteur qui revient. visitor_hash (sha256(ip + date du jour)) reste en
 * repli pour les navigateurs qui bloquent les cookies : jamais NULL,
 * jamais suffisant seul pour relier deux visites à des jours différents.
 *
 * Géolocalisation : aucun service tiers — Vercel résout déjà pays/région/
 * ville/coordonnées à l'edge et les pose en en-têtes de requête
 * (x-vercel-ip-*). Absents en local (dev) : colonnes nullable, dégradation
 * silencieuse, jamais d'appel réseau supplémentaire ni de clé API.
 */

const VISITOR_COOKIE = 'fh_vid'
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2 // 2 ans

const bodySchema = z.object({
  path: z.string().trim().min(1).max(300),
  referrer: z.string().trim().max(300).optional(),
})

function parseGeoHeaders(request: NextRequest) {
  const country = request.headers.get('x-vercel-ip-country')
  const region = request.headers.get('x-vercel-ip-country-region')
  const cityRaw = request.headers.get('x-vercel-ip-city')
  const latitude = request.headers.get('x-vercel-ip-latitude')
  const longitude = request.headers.get('x-vercel-ip-longitude')
  return {
    country: country || null,
    region: region || null,
    city: cityRaw ? decodeURIComponent(cityRaw) : null,
    latitude: latitude ? Number.parseFloat(latitude) : null,
    longitude: longitude ? Number.parseFloat(longitude) : null,
  }
}

export async function POST(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor ? forwardedFor.split(',')[0]?.trim() : 'unknown'

  const limit = rateLimit(`track-visit:${ip}`, 60, 60_000)
  if (!limit.ok) return new NextResponse(null, { status: 204 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new NextResponse(null, { status: 204 })

  const existingVisitorId = request.cookies.get(VISITOR_COOKIE)?.value
  const isValidUuid = !!existingVisitorId && /^[0-9a-f-]{36}$/i.test(existingVisitorId)
  const visitorId = isValidUuid ? existingVisitorId : randomUUID()
  const isNewVisitor = !isValidUuid

  const daysSalt = new Date().toISOString().slice(0, 10)
  const visitorHash = createHash('sha256').update(`${ip}:${daysSalt}`).digest('hex')

  const geo = parseGeoHeaders(request)

  const admin = createAdminClient()
  await admin.from('site_visits').insert({
    path: parsed.data.path,
    referrer: parsed.data.referrer ?? null,
    visitor_hash: visitorHash,
    visitor_id: visitorId,
    is_new_visitor: isNewVisitor,
    ...geo,
  })

  const response = new NextResponse(null, { status: 204 })
  response.cookies.set(VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: VISITOR_COOKIE_MAX_AGE,
    path: '/',
  })
  return response
}
