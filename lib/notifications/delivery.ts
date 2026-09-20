export type DeliveryResult = { ok: true } | { ok: false; retryable: boolean; error: string }

/** HTTP 200 alone is not an SMS acceptance: Africa's Talking returns recipient status codes. */
export function parseSmsAcceptance(payload: unknown): DeliveryResult {
  const data = payload as { SMSMessageData?: { Recipients?: { statusCode?: number }[] } } | null
  const recipients = data?.SMSMessageData?.Recipients
  if (recipients?.length === 1 && recipients[0].statusCode === 101) return { ok: true }
  return { ok: false, retryable: false, error: 'SMS recipient not accepted' }
}

export async function deliverSms(
  phone: string | null,
  body: string | null,
): Promise<DeliveryResult> {
  if (!phone || !body)
    return { ok: false, retryable: false, error: 'Missing SMS recipient or body' }
  const apiKey = process.env.AFRICAS_TALKING_API_KEY
  const username = process.env.AFRICAS_TALKING_USERNAME
  if (!apiKey || !username)
    return { ok: false, retryable: true, error: 'SMS provider not configured' }
  try {
    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      signal: AbortSignal.timeout(8_000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        apiKey,
      },
      body: new URLSearchParams({ username, to: phone, message: body, from: 'FaîtiereHub' }),
    })
    if (!res.ok)
      return {
        ok: false,
        retryable: res.status === 429 || res.status >= 500,
        error: `SMS HTTP ${res.status}`,
      }
    return parseSmsAcceptance(await res.json())
  } catch {
    // Ambiguous delivery must be checked with the provider before replay, to avoid duplicate SMS.
    return { ok: false, retryable: false, error: 'SMS delivery uncertain; reconciliation required' }
  }
}
