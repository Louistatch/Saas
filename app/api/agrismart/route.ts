/**
 * Proxy AgriSmart → AgriTogo backend
 *
 * Routes :
 *   GET  /api/agrismart?resource=crops
 *   GET  /api/agrismart?resource=soil-types
 *   POST /api/agrismart  (body: { resource: 'calculate', ...payload })
 */
import { NextRequest, NextResponse } from 'next/server'

const AGRITOGO_URL = process.env.AGRITOGO_API_URL?.replace(/\/$/, '') ?? ''

async function proxy(path: string, init: RequestInit): Promise<Response> {
  if (!AGRITOGO_URL) {
    throw new Error('AGRITOGO_API_URL non configurée')
  }
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15_000)
  try {
    return await fetch(`${AGRITOGO_URL}/api/v1/agrismart/${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function GET(req: NextRequest) {
  try {
    const resource = req.nextUrl.searchParams.get('resource') ?? 'crops'
    if (!['crops', 'soil-types'].includes(resource)) {
      return NextResponse.json({ error: 'resource invalide' }, { status: 400 })
    }
    const upstream = await proxy(resource, { method: 'GET' })
    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch {
    return NextResponse.json({ error: 'Service AgriSmart momentanément indisponible' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { resource = 'calculate', ...payload } = body
    if (resource !== 'calculate') {
      return NextResponse.json({ error: 'resource invalide' }, { status: 400 })
    }
    const upstream = await proxy('calculate', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch {
    return NextResponse.json({ error: 'Service AgriSmart momentanément indisponible' }, { status: 503 })
  }
}
