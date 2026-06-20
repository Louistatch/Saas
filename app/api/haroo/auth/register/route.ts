// Inscription Haroo (OUVRIER / ACHETEUR / AGRONOME).
//
// FaîtiereHub ne crée pas le compte lui-même : la logique Haroo vit dans le
// backend AgriTogo (déjà déployé), qui écrit dans la même base Supabase
// (auth.users + profiles + haroo_<type>_profiles). Cette route valide,
// rate-limite et proxifie vers AgriTogo.

import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientKeyFromHeaders } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { harooSignupSchema, flattenZodErrors } from '@/lib/validators/schemas'

export async function POST(request: NextRequest) {
  // Rate limiting persistant via Upstash (si configuré)
  const blocked = await applyRateLimit(request, 'auth')
  if (blocked) return blocked

  // Fallback in-memory — 5 inscriptions / 10 min / IP
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`haroo-register:${ip}`, 5, 600_000)
  if (!limit.ok) {
    return NextResponse.json(
      { success: false, error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
      { status: 429 }
    )
  }

  const body: unknown = await request.json().catch(() => null)
  const parsed = harooSignupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Données invalides', fields: flattenZodErrors(parsed.error) },
      { status: 400 }
    )
  }

  const agritogoUrl = process.env.AGRITOGO_API_URL
  if (!agritogoUrl) {
    return NextResponse.json(
      { success: false, error: 'Service Haroo non configuré' },
      { status: 503 }
    )
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`${agritogoUrl}/api/v1/haroo/auth/register`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        profile_type: parsed.data.profileType,
        email: parsed.data.email,
        password: parsed.data.password,
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        phone: parsed.data.phone,
      }),
    })
    clearTimeout(timeoutId)
    const data: unknown = await res.json().catch(() => ({
      success: false,
      error: 'Réponse invalide du service Haroo',
    }))
    return NextResponse.json(data, { status: res.status })
  } catch {
    clearTimeout(timeoutId)
    return NextResponse.json(
      { success: false, error: 'Service Haroo indisponible. Réessayez plus tard.' },
      { status: 502 }
    )
  }
}
