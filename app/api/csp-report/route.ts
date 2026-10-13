// Reports of the Report-Only CSP (lib/security/csp-report-only.ts). Public and unauthenticated by
// nature (the browser sends them): rate-limited per IP, size-bounded, nothing stored, only a compact
// line in the function logs, without query strings.
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

type Report = Record<string, unknown>

/** Path only: query strings can carry tokens or card numbers. */
function pathOf(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  if (!value.includes('/')) return value.slice(0, 60) // 'inline', 'eval', 'self'…
  try {
    const u = new URL(value)
    return `${u.host}${u.pathname}`.slice(0, 200)
  } catch {
    return value.split('?')[0].slice(0, 200)
  }
}

function summarise(r: Report) {
  return {
    directive: String(
      r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'] ?? '',
    ),
    blocked: pathOf(r['blocked-uri'] ?? r.blockedURL),
    page: pathOf(r['document-uri'] ?? r.documentURL),
    source: pathOf(r['source-file'] ?? r.sourceFile),
    line: Number(r['line-number'] ?? r.lineNumber ?? 0) || undefined,
  }
}

export async function POST(request: NextRequest) {
  const none = new NextResponse(null, { status: 204 })
  if (!rateLimit(`csp-report:${clientKeyFromHeaders(request.headers)}`, 20, 60_000).ok) return none
  const text = await request.text()
  if (text.length > 8_000) return none
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return none
  }
  // report-uri: { "csp-report": {...} }; Reporting API: [{ type, body: {...} }, ...]
  const reports: Report[] = Array.isArray(body)
    ? body
        .filter((x) => x && typeof x === 'object' && (x as Report).type === 'csp-violation')
        .map((x) => (x as { body: Report }).body)
        .filter(Boolean)
    : body && typeof body === 'object' && (body as Report)['csp-report']
      ? [(body as Record<string, Report>)['csp-report']]
      : []
  for (const r of reports.slice(0, 10)) {
    console.warn('[csp-report-only]', JSON.stringify(summarise(r)))
  }
  return none
}
