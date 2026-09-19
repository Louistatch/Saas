// Proxy vers les endpoints d'administration d'AgriTogo.
//
// assertRole RETOURNE { ok, response } — il ne lève pas. Une version
// antérieure de ce fichier appelait `await assertRole('super_admin')` sans
// exploiter le résultat : la garde ne faisait donc rien, et ces routes étaient
// ouvertes à tout le monde, y compris la configuration KoboCollect qui porte
// un jeton d'API. Toute modification ici doit conserver le `if (!guard.ok)`.
//
// Le jeton de l'appelant est transmis en amont pour qu'AgriTogo vérifie
// l'identité de son côté plutôt que de faire confiance à ce proxy sur parole.

import { type NextRequest, NextResponse } from 'next/server'
import { assertRole, type AccessContext } from '@/lib/security/assert-access'

const AGRITOGO = process.env.AGRITOGO_API_URL ?? ''

async function upstreamHeaders(ctx: AccessContext, contentType: string) {
  const headers: Record<string, string> = { 'Content-Type': contentType }
  const { data } = await ctx.supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  if (!AGRITOGO) return NextResponse.json({ error: 'AGRITOGO_API_URL non configuré' }, { status: 503 })

  const { path } = await params
  const upstream = `${AGRITOGO}/api/v1/${path.join('/')}${request.nextUrl.search}`
  try {
    const res = await fetch(upstream, {
      headers: await upstreamHeaders(guard.ctx, 'application/json'),
      signal: AbortSignal.timeout(8000),
    })
    const data: unknown = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'AgriTogo inaccessible' }, { status: 502 })
  }
}

async function forwardWithBody(method: string, request: NextRequest, pathSegments: string[]) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  if (!AGRITOGO) return NextResponse.json({ error: 'AGRITOGO_API_URL non configuré' }, { status: 503 })

  const body = await request.text()
  const upstream = `${AGRITOGO}/api/v1/${pathSegments.join('/')}${request.nextUrl.search}`
  try {
    const res = await fetch(upstream, {
      method,
      headers: await upstreamHeaders(
        guard.ctx,
        request.headers.get('content-type') ?? 'application/json',
      ),
      body: body || undefined,
      signal: AbortSignal.timeout(30000),
    })
    const data: unknown = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'AgriTogo inaccessible' }, { status: 502 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return forwardWithBody('POST', request, path)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return forwardWithBody('PUT', request, path)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return forwardWithBody('PATCH', request, path)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return forwardWithBody('DELETE', request, path)
}
