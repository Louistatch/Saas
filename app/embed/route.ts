import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clientKeyFromHeaders, isUuid, rateLimit } from '@/lib/utils/rate-limit'
import { createLogger } from '@/lib/utils/logger'

const log = createLogger('embed')

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isHexColor(s: string | null | undefined): s is string {
  return !!s && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)
}

const errorPage = (status: number, message: string) =>
  new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Error</title><style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;color:#555;margin:0;padding:24px;text-align:center}</style></head><body><div><p>${escapeHtml(message)}</p></div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )

interface CoopRow {
  id: string
  name: string
  description: string | null
  primary_color: string | null
}

interface ExploitationRow {
  id: string
  name: string
  description: string | null
  category: string | null
  price: number | null
  unit: string | null
  producer: string | null
}

export async function GET(request: NextRequest) {
  const limit = rateLimit(`embed:${clientKeyFromHeaders(request.headers)}`, 60, 60_000)
  if (!limit.ok) {
    return errorPage(429, 'Too many requests. Please slow down.')
  }

  const { searchParams } = new URL(request.url)
  const cooperativeId = searchParams.get('id')
  const themeRaw = searchParams.get('theme')
  const theme = themeRaw === 'dark' ? 'dark' : 'light'

  if (!isUuid(cooperativeId)) {
    return errorPage(400, 'A valid cooperative id is required.')
  }

  try {
    const supabase = await createClient()

    const [coopRes, fichesRes] = await Promise.all([
      supabase
        .from('cooperatives')
        .select('id, name, description, primary_color')
        .eq('id', cooperativeId)
        .single<CoopRow>(),
      supabase
        .from('fiches_techniques')
        .select('id, title, description, culture, type_agriculture, price_non_member')
        .eq('cooperative_id', cooperativeId)
        .eq('status', 'published')
        .order('title')
        .limit(100),
    ])

    if (coopRes.error || !coopRes.data) {
      return errorPage(404, 'Cooperative not found.')
    }

    const coop = coopRes.data
    const fiches = fichesRes.data ?? []
    const primaryColor = isHexColor(coop.primary_color) ? coop.primary_color : '#16a34a'

    const isDark = theme === 'dark'
    const bg = isDark ? '#1a1a1a' : '#f9f9f9'
    const cardBg = isDark ? '#2a2a2a' : '#ffffff'
    const textColor = isDark ? '#ffffff' : '#1a1a1a'
    const borderColor = isDark ? '#3a3a3a' : '#e0e0e0'
    const placeholderBg = isDark ? '#333' : '#f0f0f0'

    const ficheCards =
      fiches.length === 0
        ? `<div style="text-align:center;padding:40px;color:#888;">Aucune fiche technique disponible</div>`
        : fiches
            .map((f: any) => `
        <div class="card">
          <div class="card-image">📄</div>
          <div class="card-content">
            <div class="card-category">${escapeHtml(f.culture ?? 'Culture')}</div>
            <div class="card-name">${escapeHtml(f.title)}</div>
            <div class="card-producer">${escapeHtml(f.type_agriculture ?? '')}</div>
            <div class="card-footer">
              <span class="card-price">${f.price_non_member} FCFA</span>
            </div>
          </div>
        </div>`).join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(coop.name)} — Marketplace</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:${bg}; color:${textColor}; }
    .container { max-width:1200px; margin:0 auto; padding:24px; }
    .header { text-align:center; margin-bottom:32px; }
    .header h1 { font-size:28px; font-weight:700; color:${primaryColor}; margin-bottom:8px; }
    .header p { opacity:.7; font-size:15px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:20px; }
    .card { background:${cardBg}; border-radius:10px; overflow:hidden; border:1px solid ${borderColor}; transition:transform .2s,box-shadow .2s; }
    .card:hover { transform:translateY(-3px); box-shadow:0 6px 20px rgba(0,0,0,.12); }
    .card-image { height:160px; background:${placeholderBg}; display:flex; align-items:center; justify-content:center; font-size:56px; }
    .card-content { padding:16px; }
    .card-category { font-size:11px; text-transform:uppercase; letter-spacing:.5px; opacity:.6; margin-bottom:4px; }
    .card-name { font-size:17px; font-weight:600; margin-bottom:4px; }
    .card-producer { font-size:13px; opacity:.65; margin-bottom:12px; }
    .card-footer { display:flex; justify-content:space-between; align-items:center; }
    .card-price { font-size:18px; font-weight:700; color:${primaryColor}; }
    .footer { text-align:center; padding:24px; opacity:.5; font-size:12px; margin-top:16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(coop.name)}</h1>
      ${coop.description ? `<p>${escapeHtml(coop.description)}</p>` : ''}
    </div>
    <div class="grid">${ficheCards}</div>
    <div class="footer">Powered by FaîtiereHub</div>
  </div>
</body>
</html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // We deliberately allow framing for the embed surface only.
        'X-Frame-Options': 'ALLOWALL',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    log.error('Embed render failed', error)
    return errorPage(500, 'Marketplace unavailable. Please try again later.')
  }
}
