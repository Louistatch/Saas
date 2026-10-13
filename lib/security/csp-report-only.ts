/**
 * Nonce-based script policy, sent as Content-Security-Policy-Report-Only next to the enforced CSP
 * of next.config.mjs. It blocks nothing: browsers only report what a strict policy would refuse,
 * so the move away from 'unsafe-inline' can be measured before it is enforced.
 *
 * Off unless CSP_REPORT_ONLY=1, because every report is a function invocation.
 */
export const CSP_REPORT_PATH = '/api/csp-report'

export function cspReportOnlyEnabled(): boolean {
  return process.env.CSP_REPORT_ONLY === '1'
}

export function createNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

/**
 * 'strict-dynamic' lets scripts loaded by a nonced script run (Next's chunks); modern browsers then
 * ignore 'self', https: and 'unsafe-inline', which only stay as a fallback for old ones.
 */
export function reportOnlyPolicy(nonce: string): string {
  return [
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'self' https: 'unsafe-inline'`,
    "object-src 'none'",
    "base-uri 'self'",
    `report-uri ${CSP_REPORT_PATH}`,
  ].join('; ')
}
