import { NextRequest, NextResponse } from 'next/server'
import { assertRole } from '@/lib/security/assert-access'

const AGRITOGO = process.env.AGRITOGO_API_URL ?? ''

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  await assertRole('super_admin')
  if (!AGRITOGO) return NextResponse.json({ error: 'AGRITOGO_API_URL non configuré' }, { status: 503 })

  const { path } = await params
  const upstream = `${AGRITOGO}/api/v1/${path.join('/')}${request.nextUrl.search}`
  try {
    const res = await fetch(upstream, { headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000) })
    const data: unknown = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'AgriTogo inaccessible' }, { status: 502 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  await assertRole('super_admin')
  if (!AGRITOGO) return NextResponse.json({ error: 'AGRITOGO_API_URL non configuré' }, { status: 503 })

  const { path } = await params
  const body = await request.text()
  const upstream = `${AGRITOGO}/api/v1/${path.join('/')}`
  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(30000),
    })
    const data: unknown = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'AgriTogo inaccessible' }, { status: 502 })
  }
}
