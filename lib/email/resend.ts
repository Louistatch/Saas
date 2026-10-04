import 'server-only'

/**
 * E-mails transactionnels du site via l'API Resend (domaine faitierehub.com
 * vérifié). Les e-mails d'authentification, eux, partent par le SMTP Resend
 * configuré dans Supabase — ce module couvre tout le reste.
 *
 * Règle : un e-mail n'est JAMAIS bloquant. Sans RESEND_API_KEY, ou si Resend
 * échoue, l'action métier réussit quand même ; l'échec est seulement renvoyé.
 */

import type { DeliveryResult } from '@/lib/notifications/delivery'
import { createClient as createAdminClient } from '@/lib/supabase/admin'

const FROM = 'FaîtiereHub <noreply@faitierehub.com>'
const SITE = 'https://www.faitierehub.com'

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Gabarit unique, sobre et lisible sur mobile. `lines` = paragraphes en texte brut. */
export function renderEmail(opts: {
  title: string
  lines: string[]
  cta?: { label: string; path: string }
}): { html: string; text: string } {
  const paragraphs = opts.lines
    .map((l) => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(l)}</p>`)
    .join('')
  const button = opts.cta
    ? `<p style="margin:20px 0"><a href="${SITE}${opts.cta.path}" style="background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(opts.cta.label)}</a></p>`
    : ''
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1f2937"><h2 style="color:#166534">${escapeHtml(opts.title)}</h2>${paragraphs}${button}<p style="font-size:12px;color:#6b7280;margin-top:24px">FaîtiereHub · ${SITE.replace('https://', '')}</p></div>`
  const text = [
    opts.title,
    '',
    ...opts.lines,
    opts.cta ? `\n${opts.cta.label} : ${SITE}${opts.cta.path}` : '',
  ]
    .join('\n')
    .trim()
  return { html, text }
}

export async function deliverEmail(
  to: string | null,
  subject: string | null,
  content: { html?: string; text: string } | null,
): Promise<DeliveryResult> {
  if (!to || !subject || !content)
    return { ok: false, retryable: false, error: 'Missing email recipient, subject or body' }
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, retryable: true, error: 'Email provider not configured' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(8_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject,
        html: content.html,
        text: content.text,
      }),
    })
    if (res.ok) return { ok: true }
    return {
      ok: false,
      retryable: res.status === 429 || res.status >= 500,
      error: `Email HTTP ${res.status}`,
    }
  } catch {
    return { ok: false, retryable: true, error: 'Email delivery failed' }
  }
}

/** Adresse de connexion d'un compte (auth.users), lue côté serveur uniquement. */
async function emailOfUser(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().auth.admin.getUserById(userId)
  const email = data.user?.email ?? null
  // Comptes de démonstration internes : jamais d'envoi.
  return email && !email.endsWith('.internal') ? email : null
}

/** Envoi « fire-and-forget » à un compte : n'échoue jamais côté appelant. */
export async function emailUser(
  userId: string | null | undefined,
  subject: string,
  body: Parameters<typeof renderEmail>[0],
): Promise<void> {
  if (!userId) return
  try {
    const to = await emailOfUser(userId)
    if (!to) return
    await deliverEmail(to, subject, renderEmail(body))
  } catch {
    // Un e-mail manqué ne doit jamais casser l'action métier.
  }
}
